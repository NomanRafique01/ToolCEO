import os
import sys

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Handle PyInstaller unpacked temp dir if frozen
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    if sys._MEIPASS not in sys.path:
        sys.path.insert(0, sys._MEIPASS)

from main import app
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("TOOLCEO_PORT", 8765))
    for idx, arg in enumerate(sys.argv[1:]):
        if arg == "--port" and idx + 2 < len(sys.argv):
            try:
                port = int(sys.argv[idx + 2])
            except ValueError:
                pass
    host = os.environ.get("TOOLCEO_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, log_level="info")


