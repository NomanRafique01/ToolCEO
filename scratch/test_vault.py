"""
Test suite for ToolCEO Vault (.tceo file format)
"""

import os
import sys

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from tools.documents.pdf_tools.encrypt.vault_engine import (
    lock_vault_pdf,
    unlock_vault_pdf,
    check_vault_file,
    MAGIC_HEADER
)

# Build a small dummy valid PDF
DUMMY_PDF = (
    b"%PDF-1.7\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF"
)

def run_tests():
    print("--- 1. Testing Vault Check on non-TCEO file ---")
    info = check_vault_file(DUMMY_PDF)
    assert not info["is_tceo"], "Dummy PDF should not be identified as TCEO"
    print("PASS: Non-TCEO check passed")

    print("\n--- 2. Testing Vault Lock (.tceo container creation) ---")
    password = "SecretPassword123"
    hint = "My secret pass"
    tceo_bytes = lock_vault_pdf(DUMMY_PDF, password, hint)
    
    assert tceo_bytes.startswith(MAGIC_HEADER), "Container must start with MAGIC_HEADER"
    assert b"%PDF" not in tceo_bytes[:20], "Original PDF signature must be scrambled"
    print(f"PASS: Lock produced {len(tceo_bytes)} bytes container")

    print("\n--- 3. Testing Vault Check on created .tceo file ---")
    info = check_vault_file(tceo_bytes)
    assert info["is_tceo"] is True, "Should be identified as TCEO container"
    assert info["version"] == 2, "Version should be 2"
    assert info["has_hint"] is True, "Should have hint flag set"
    assert info["hint"] is None, "Hint field must return None"
    assert info["tampered"] is False, "Fresh container must not be marked tampered"
    print("PASS: Vault Check metadata verification passed")

    print("\n--- 4. Testing Vault Unlock with correct password ---")
    recovered_pdf = unlock_vault_pdf(tceo_bytes, password)
    assert recovered_pdf.startswith(b"%PDF-"), "Recovered PDF must start with %PDF-"
    print("PASS: Unlocked PDF successfully recovered and restored PDF header!")

    print("\n--- 5. Testing Vault Unlock with WRONG password ---")
    try:
        unlock_vault_pdf(tceo_bytes, "WrongPassword!")
        assert False, "Should have raised exception for wrong password"
    except ValueError as exc:
        assert "wrong_password" in str(exc), f"Expected wrong_password error, got {exc}"
        print("PASS: Wrong password correctly rejected with wrong_password error")

    print("\n--- 6. Testing Vault Unlock on TAMPERED file ---")
    tampered_bytes = bytearray(tceo_bytes)
    tampered_bytes[40] ^= 0xFF  # Flip a bit in the payload
    try:
        unlock_vault_pdf(bytes(tampered_bytes), password)
        assert False, "Should have raised exception for tampered file"
    except ValueError as exc:
        assert "wrong_password" in str(exc), f"Expected wrong_password error on tamper, got {exc}"
        print("PASS: Tampered container correctly rejected with wrong_password error")

    print("\n=== ALL VAULT ENGINE TESTS PASSED! ===")

if __name__ == "__main__":
    run_tests()
