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

# ── Fix Python on Windows: WinError 10054 during client SSE disconnection ─────
# In Python 3.8-3.13 on Windows, asyncio's ProactorBasePipeTransport._call_connection_lost
# calls self._sock.shutdown() without a try-except. When the client closes an SSE
# connection first, Windows returns WinError 10054 (ConnectionResetError), which triggers
# an unhandled exception callback. We safely catch and suppress this normal disconnect.
if sys.platform == "win32":
    import socket
    try:
        from asyncio.proactor_events import _ProactorBasePipeTransport

        def _fixed_call_connection_lost(self, exc):
            if self._called_connection_lost:
                return
            try:
                self._protocol.connection_lost(exc)
            finally:
                if hasattr(self._sock, "shutdown") and self._sock.fileno() != -1:
                    try:
                        self._sock.shutdown(socket.SHUT_RDWR)
                    except (OSError, ConnectionResetError):
                        pass
                if self._sock is not None:
                    try:
                        self._sock.close()
                    except (OSError, ConnectionResetError):
                        pass
                    self._sock = None
                server = self._server
                if server is not None:
                    server._detach(self)
                    self._server = None
                self._called_connection_lost = True

        _ProactorBasePipeTransport._call_connection_lost = _fixed_call_connection_lost
    except Exception:
        pass

from platform_tools import ensure_silent_subprocess
ensure_silent_subprocess()

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


