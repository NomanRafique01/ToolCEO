"""
PDF Merger tool package.

Exposes the FastAPI router so main.py can import it with a single line:

    from tools.documents.pdf_tools.merger import router as merger_router
"""

from tools.documents.pdf_tools.merger.router import router

__all__ = ["router"]
