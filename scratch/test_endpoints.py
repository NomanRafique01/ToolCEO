import sys
sys.path.insert(0, 'backend')
import io
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

svg_data = b'<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="green"/></svg>'

# Test all 4 endpoints
endpoints = [
    ("/api/svg/to-png/convert", "png", "test_logo.png"),
    ("/api/svg/to-jpg/convert", "jpg", "test_logo.jpg"),
    ("/api/svg/to-webp/convert", "webp", "test_logo.webp"),
    ("/api/svg/to-pdf/convert", "pdf", "test_logo.pdf"),
]

for endpoint, fmt, expected_name in endpoints:
    files = [("files", ("logo.svg", io.BytesIO(svg_data), "image/svg+xml"))]
    data = {"output_filename": "test_logo"}
    response = client.post(endpoint, files=files, data=data)
    assert response.status_code == 202, f"Expected 202, got {response.status_code}: {response.text}"
    job_id = response.json().get("job_id")
    assert job_id, f"No job_id returned for {endpoint}"
    print(f"[PASSED] {endpoint} returned job_id: {job_id}")

print("ALL FASTAPI SVG CONVERTER ENDPOINTS TESTED SUCCESSFULLY!")
