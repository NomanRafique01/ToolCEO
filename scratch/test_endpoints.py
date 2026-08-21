"""
Test FastAPI routes for ToolCEO Vault & Encrypt
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

DUMMY_PDF = (
    b"%PDF-1.7\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF"
)

def test_routes():
    print("--- 1. Testing GET /health ---")
    r = client.get("/health")
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    print("PASS: /health returned 200 OK")

    print("\n--- 2. Testing POST /api/pdf/vault-lock ---")
    files = {"file": ("test.pdf", DUMMY_PDF, "application/pdf")}
    data = {"password": "TestPassword123", "hint": "My hint"}
    r = client.post("/api/pdf/vault-lock", files=files, data=data)
    assert r.status_code == 200, f"vault-lock failed: {r.status_code} {r.text}"
    vault_bytes = r.content
    assert vault_bytes.startswith(b"TCEOVLT\x00"), "vault-lock response should be .tceo container"
    print(f"PASS: vault-lock returned {len(vault_bytes)} bytes .tceo container")

    print("\n--- 3. Testing POST /api/pdf/vault-check ---")
    files = {"file": ("test.tceo", vault_bytes, "application/octet-stream")}
    r = client.post("/api/pdf/vault-check", files=files)
    assert r.status_code == 200, f"vault-check failed: {r.status_code} {r.text}"
    json_data = r.json()
    assert json_data["is_tceo"] is True, "is_tceo should be True"
    assert json_data["has_hint"] is True, "has_hint should be True"
    print("PASS: vault-check returned JSON:", json_data)

    print("\n--- 4. Testing POST /api/pdf/vault-unlock ---")
    files = {"file": ("test.tceo", vault_bytes, "application/octet-stream")}
    data = {"password": "TestPassword123"}
    r = client.post("/api/pdf/vault-unlock", files=files, data=data)
    assert r.status_code == 200, f"vault-unlock failed: {r.status_code} {r.text}"
    recovered_pdf = r.content
    assert recovered_pdf.startswith(b"%PDF-"), "recovered PDF should start with %PDF-"
    print("PASS: vault-unlock successfully returned recovered PDF!")

    print("\n--- 5. Testing POST /api/pdf/vault-unlock with WRONG password ---")
    files = {"file": ("test.tceo", vault_bytes, "application/octet-stream")}
    data = {"password": "WrongPassword!"}
    r = client.post("/api/pdf/vault-unlock", files=files, data=data)
    assert r.status_code == 400, f"Expected 400 Bad Request, got {r.status_code}"
    err_json = r.json()
    assert err_json["error"] == "wrong_password", f"Expected wrong_password error, got {err_json}"
    print("PASS: Wrong password correctly returned 400 wrong_password")

    print("\n=== ALL FASTAPI ENDPOINT TESTS PASSED! ===")

if __name__ == "__main__":
    test_routes()
