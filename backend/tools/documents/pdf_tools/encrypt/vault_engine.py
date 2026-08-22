"""
ToolCEO Vault (.tceo File Format) Engine
========================================

Implements the .tceo binary container format for permanently locking PDFs.
Uses PBKDF2 (600,000 iterations), AES-256-CBC encryption, PDF header scrambling,
deterministic noise byte interleaving, zlib compression, and SHA-256 checksum integrity.

Specification:
  MAGIC HEADER    (8 bytes) : 0x54 0x43 0x45 0x4F 0x56 0x4C 0x54 0x00 ("TCEOVLT\0")
  VERSION         (1 byte)  : 0x02
  SALT            (32 bytes): os.urandom(32)
  IV              (16 bytes): os.urandom(16)
  HINT_LENGTH     (2 bytes) : unsigned short (big-endian >H)
  HINT_DATA       (var bytes): Encrypted hint data (hint_iv + AES_CBC_encrypted_hint)
  NOISE_SEED      (8 bytes) : os.urandom(8)
  PAYLOAD_LENGTH  (8 bytes) : unsigned long long (big-endian >Q)
  PAYLOAD         (var bytes): Encrypted payload bytes
  CHECKSUM        (32 bytes): SHA-256 of all preceding bytes
"""

from __future__ import annotations

import hashlib
import hmac
import io
import os
import random
import struct
import zlib
from typing import Any, Dict, Optional

import pikepdf

# ---------------------------------------------------------------------------
# Cryptographic & Padding Helpers
# ---------------------------------------------------------------------------

def _pad_pkcs7(data: bytes, block_size: int = 16) -> bytes:
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len] * pad_len)


def _unpad_pkcs7(padded: bytes, block_size: int = 16) -> bytes:
    if not padded or len(padded) % block_size != 0:
        raise ValueError("Invalid PKCS7 padding length")
    pad_len = padded[-1]
    if pad_len < 1 or pad_len > block_size:
        raise ValueError("Invalid PKCS7 padding byte")
    if padded[-pad_len:] != bytes([pad_len] * pad_len):
        raise ValueError("Invalid PKCS7 padding pattern")
    return padded[:-pad_len]


from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


def _aes_cbc_encrypt(key: bytes, iv: bytes, plaintext: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    return encryptor.update(plaintext) + encryptor.finalize()


def _aes_cbc_decrypt(key: bytes, iv: bytes, ciphertext: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    return decryptor.update(ciphertext) + decryptor.finalize()


MAGIC_HEADER = b"TCEOVLT\x00"
VERSION_BYTE = b"\x02"
SCRAMBLED_HEADER = b"\xDE\xAD\xC0\xDE\xFE\xED\xBE\xEF"
DEFAULT_PDF_HEADER = b"%PDF-1.7"
PBKDF2_ITERATIONS = 600000


def lock_vault_pdf(file_bytes: bytes, password: str, hint: Optional[str] = None) -> bytes:
    """
    Lock a PDF into a .tceo binary container format.
    """
    if not password or len(password) < 4:
        raise ValueError("password_too_short:Password must be at least 4 characters long")

    # Step 1: Open PDF with pikepdf to validate and strip pre-existing PDF-level passwords/encryption
    try:
        doc = pikepdf.open(io.BytesIO(file_bytes))
        out_buf = io.BytesIO()
        doc.save(out_buf)
        doc.close()
        pdf_bytes = out_buf.getvalue()
    except pikepdf.PasswordError:
        raise ValueError("invalid_pdf:PDF is encrypted with an unknown password and cannot be read")
    except Exception as exc:
        raise ValueError(f"invalid_pdf:File is not a valid PDF document ({exc})")

    if len(pdf_bytes) < 8 or not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("invalid_pdf:File is not a valid PDF document")

    # Step 2 & 3: Scramble PDF header signature
    scrambled_payload = bytearray(pdf_bytes)
    scrambled_payload[0:8] = SCRAMBLED_HEADER

    # Step 4: Interleave noise bytes using NOISE_SEED
    noise_seed = os.urandom(8)
    seed_int = int.from_bytes(noise_seed, "big")
    rng = random.Random(seed_int)

    interleaved = bytearray()
    for i in range(0, len(scrambled_payload), 7):
        chunk = scrambled_payload[i : i + 7]
        interleaved.extend(chunk)
        if len(chunk) == 7:
            interleaved.append(rng.randrange(0, 256))

    # Step 5: Compress interleaved bytes with zlib (level 9)
    compressed_payload = zlib.compress(bytes(interleaved), level=9)

    # Step 6: Derive key & encrypt payload with AES-256-CBC
    salt = os.urandom(32)
    iv = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS, 32)

    encrypted_payload = _aes_cbc_encrypt(key, iv, _pad_pkcs7(compressed_payload))

    # Encrypt password hint if provided
    hint_data = b""
    if hint and hint.strip():
        hint_str = hint.strip()
        hint_iv = os.urandom(16)
        encrypted_hint = _aes_cbc_encrypt(key, hint_iv, _pad_pkcs7(hint_str.encode("utf-8")))
        hint_data = hint_iv + encrypted_hint

    hint_length = len(hint_data)

    # Assemble container
    header_part = (
        MAGIC_HEADER
        + VERSION_BYTE
        + salt
        + iv
        + struct.pack(">H", hint_length)
        + hint_data
        + noise_seed
        + struct.pack(">Q", len(encrypted_payload))
        + encrypted_payload
    )

    # Step 7: SHA-256 Checksum over all container bytes
    checksum = hashlib.sha256(header_part).digest()
    return header_part + checksum


def unlock_vault_pdf(file_bytes: bytes, password: str) -> bytes:
    """
    Unlock a .tceo binary container format and recover the original PDF.
    """
    if not password:
        raise ValueError("wrong_password:Password is required")

    # Min size: magic(8) + ver(1) + salt(32) + iv(16) + hint_len(2) + seed(8) + payload_len(8) + checksum(32) = 107
    if len(file_bytes) < 107:
        raise ValueError("not_tceo_file:File is not a valid ToolCEO Vault (.tceo) container")

    if not file_bytes.startswith(MAGIC_HEADER):
        raise ValueError("not_tceo_file:File is not a valid ToolCEO Vault (.tceo) container")

    # Parse checksum & verify integrity
    payload_and_header = file_bytes[:-32]
    expected_checksum = file_bytes[-32:]
    computed_checksum = hashlib.sha256(payload_and_header).digest()

    if not hmac.compare_digest(computed_checksum, expected_checksum):
        # Per security rules: do not leak tampered details on unlock, return wrong_password
        raise ValueError("wrong_password:Incorrect password")

    offset = len(MAGIC_HEADER)
    version = file_bytes[offset]
    offset += 1

    if version != 2:
        raise ValueError("not_tceo_file:Unsupported ToolCEO Vault container version")

    salt = file_bytes[offset : offset + 32]
    offset += 32
    iv = file_bytes[offset : offset + 16]
    offset += 16

    (hint_len,) = struct.unpack(">H", file_bytes[offset : offset + 2])
    offset += 2
    offset += hint_len  # skip hint data

    noise_seed = file_bytes[offset : offset + 8]
    offset += 8

    (payload_len,) = struct.unpack(">Q", file_bytes[offset : offset + 8])
    offset += 8

    encrypted_payload = file_bytes[offset : offset + payload_len]

    if len(encrypted_payload) != payload_len:
        raise ValueError("wrong_password:Incorrect password")

    # Derive AES key
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS, 32)

    # Decrypt AES-256-CBC payload
    try:
        padded = _aes_cbc_decrypt(key, iv, encrypted_payload)
        compressed_payload = _unpad_pkcs7(padded)
    except Exception:
        raise ValueError("wrong_password:Incorrect password")

    # Decompress zlib
    try:
        interleaved = zlib.decompress(compressed_payload)
    except Exception:
        raise ValueError("wrong_password:Incorrect password")

    # Reverse noise interleaving
    restored_scrambled = bytearray()
    for i in range(0, len(interleaved), 8):
        block = interleaved[i : i + 8]
        if len(block) == 8:
            restored_scrambled.extend(block[:7])
        else:
            restored_scrambled.extend(block)

    if len(restored_scrambled) < 8:
        raise ValueError("wrong_password:Incorrect password")

    # Restore original PDF header (%PDF-1.7)
    restored_scrambled[0:8] = DEFAULT_PDF_HEADER
    recovered_pdf = bytes(restored_scrambled)

    if not recovered_pdf.startswith(b"%PDF-"):
        raise ValueError("wrong_password:Incorrect password")

    return recovered_pdf


def check_vault_file(file_bytes: bytes) -> Dict[str, Any]:
    """
    Inspect a file to check if it is a valid .tceo container and return metadata.
    """
    if len(file_bytes) < 107 or not file_bytes.startswith(MAGIC_HEADER):
        return {
            "is_tceo": False,
            "version": None,
            "has_hint": False,
            "hint": None,
            "tampered": False,
        }

    payload_and_header = file_bytes[:-32]
    expected_checksum = file_bytes[-32:]
    computed_checksum = hashlib.sha256(payload_and_header).digest()
    is_tampered = not hmac.compare_digest(computed_checksum, expected_checksum)

    offset = len(MAGIC_HEADER)
    version = file_bytes[offset]
    offset += 1
    offset += 32  # salt
    offset += 16  # iv

    (hint_len,) = struct.unpack(">H", file_bytes[offset : offset + 2])
    has_hint = hint_len > 0

    return {
        "is_tceo": True,
        "version": version,
        "has_hint": has_hint,
        "hint": None,  # Hint is encrypted; requires password to decrypt
        "tampered": is_tampered,
    }
