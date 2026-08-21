"""
PDF Encrypt / Decrypt / Check Encryption Engine using pikepdf.
All operations run strictly in-memory using BytesIO.
"""

from __future__ import annotations

import io
import re
from typing import Any, Dict, Optional
import pikepdf


def encrypt_pdf(
    file_bytes: bytes,
    user_password: str,
    owner_password: Optional[str] = None,
    encryption_level: str = "256",
    allow_printing: bool = True,
    allow_copying: bool = False,
    allow_editing: bool = False,
    allow_annotations: bool = False,
    allow_forms: bool = False,
) -> bytes:
    """
    Encrypt a PDF using pikepdf with AES-256 (R=6) or RC4/AES-128 (R=4).
    """
    try:
        doc = pikepdf.open(io.BytesIO(file_bytes))
    except pikepdf.PasswordError:
        raise ValueError("incorrect_password:PDF is password protected and requires a password to open")
    except pikepdf.PdfError:
        raise ValueError("invalid_file:File is not a valid PDF document")
    except Exception as e:
        raise ValueError(f"invalid_file:{str(e)}")

    try:
        permissions = pikepdf.Permissions(
            accessibility=True,
            extract=allow_copying,
            modify_annotation=allow_annotations,
            modify_assembly=allow_editing,
            modify_other=allow_editing,
            modify_form=allow_forms,
            print_lowres=allow_printing,
            print_highres=allow_printing,
        )

        owner_pwd = (
            owner_password
            if owner_password is not None and owner_password != ""
            else user_password
        )
        r_val = 6 if str(encryption_level).strip() == "256" else 4

        encryption = pikepdf.Encryption(
            owner=owner_pwd,
            user=user_password,
            R=r_val,
            allow=permissions,
        )

        out_buffer = io.BytesIO()
        doc.save(out_buffer, encryption=encryption)
        doc.close()
        out_buffer.seek(0)
        return out_buffer.getvalue()
    except Exception as e:
        doc.close()
        raise e


def decrypt_pdf(file_bytes: bytes, password: str) -> bytes:
    """
    Remove password protection from an encrypted PDF using pikepdf.
    """
    # First check if valid PDF and if encrypted
    try:
        doc_check = pikepdf.open(io.BytesIO(file_bytes), password="")
        if not doc_check.is_encrypted:
            doc_check.close()
            raise ValueError("not_encrypted:PDF is not password protected")
        doc_check.close()
    except pikepdf.PasswordError:
        # File is encrypted and requires a password to unlock
        pass
    except pikepdf.PdfError:
        raise ValueError("invalid_file:File is not a valid PDF document")
    except ValueError as ve:
        raise ve
    except Exception as e:
        raise ValueError(f"invalid_file:{str(e)}")

    # Attempt unlock with provided password
    try:
        doc = pikepdf.open(io.BytesIO(file_bytes), password=password)
        if not doc.is_encrypted:
            doc.close()
            raise ValueError("not_encrypted:PDF is not password protected")
    except pikepdf.PasswordError:
        raise ValueError("incorrect_password:Wrong password")
    except pikepdf.PdfError:
        raise ValueError("invalid_file:File is not a valid PDF document")
    except ValueError as ve:
        raise ve
    except Exception as e:
        raise ValueError(f"invalid_file:{str(e)}")

    try:
        out_buffer = io.BytesIO()
        doc.save(out_buffer)
        doc.close()
        out_buffer.seek(0)
        return out_buffer.getvalue()
    except Exception as e:
        doc.close()
        raise e


def check_pdf_encryption(file_bytes: bytes) -> Dict[str, Any]:
    """
    Inspect a PDF to check encryption status, password presence,
    encryption level, and restriction flags.
    """
    try:
        doc = pikepdf.open(io.BytesIO(file_bytes), password="")
        if not doc.is_encrypted:
            doc.close()
            return {
                "is_encrypted": False,
                "has_user_password": False,
                "has_owner_password": False,
                "encryption_level": None,
                "restrictions": {
                    "printing": True,
                    "copying": True,
                    "editing": True,
                    "annotations": True,
                    "forms": True,
                },
            }

        # Opened with empty password, but PDF is marked as encrypted
        has_user_pass = False
        has_owner_pass = not getattr(doc, "owner_password_matched", False)

        enc_info = getattr(doc, "encryption", None)
        r_val = getattr(enc_info, "R", 6) if enc_info else 6
        bits_val = getattr(enc_info, "bits", 256) if enc_info else 256
        enc_level = (
            "256" if (r_val in (5, 6) or bits_val == 256) else "128"
        )

        allow = doc.allow
        restrictions = {
            "printing": bool(allow.print_lowres or allow.print_highres)
            if allow
            else True,
            "copying": bool(allow.extract) if allow else True,
            "editing": bool(allow.modify_assembly or allow.modify_other)
            if allow
            else True,
            "annotations": bool(allow.modify_annotation) if allow else True,
            "forms": bool(allow.modify_form) if allow else True,
        }
        doc.close()
        return {
            "is_encrypted": True,
            "has_user_password": has_user_pass,
            "has_owner_password": has_owner_pass,
            "encryption_level": enc_level,
            "restrictions": restrictions,
        }

    except pikepdf.PasswordError:
        # User password is required
        enc_level = "256"
        has_owner_pass = True
        printing = True
        copying = False
        editing = False
        annotations = False
        forms = False

        try:
            raw_str = file_bytes.decode("latin-1", errors="ignore")
            if (
                "/AESV3" in raw_str
                or "/R 6" in raw_str
                or "/R 5" in raw_str
                or "/Length 256" in raw_str
            ):
                enc_level = "256"
            elif (
                "/AESV2" in raw_str
                or "/R 4" in raw_str
                or "/R 3" in raw_str
                or "/Length 128" in raw_str
            ):
                enc_level = "128"

            p_match = re.search(r"/P\s+(-?\d+)", raw_str)
            if p_match:
                p_val = int(p_match.group(1))
                printing = bool(p_val & 4)
                copying = bool(p_val & 16)
                editing = bool((p_val & 8) or (p_val & 32))
                annotations = bool(p_val & 64)
                forms = bool(p_val & 256)
        except Exception:
            pass

        return {
            "is_encrypted": True,
            "has_user_password": True,
            "has_owner_password": has_owner_pass,
            "encryption_level": enc_level,
            "restrictions": {
                "printing": printing,
                "copying": copying,
                "editing": editing,
                "annotations": annotations,
                "forms": forms,
            },
        }
    except pikepdf.PdfError:
        raise ValueError("invalid_file:File is not a valid PDF document")
    except Exception as e:
        raise ValueError(f"invalid_file:{str(e)}")
