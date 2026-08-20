from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.pdf_tools import router as pdf_router
from routers.pdf_conversions import router as pdf_conversions_router
from routers.sse_progress import router as sse_router
# Tool sub-modules — each tool owns its own router
from tools.documents.pdf_tools.splitter.router import router as splitter_router
from tools.documents.pdf_tools.merger.router   import router as merger_router

app = FastAPI(title="ToolCEO Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ToolCEO backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(pdf_router, prefix="/api")
app.include_router(pdf_conversions_router, prefix="/api")
app.include_router(sse_router, prefix="/api")
# Splitter tool routes — the splitter router owns /api/pdf/page-count,
# /api/pdf/thumbnail and /api/pdf/split.  These duplicate the routes in
# pdf_router; FastAPI will use whichever is registered first, so these
# new registrations will be silently shadowed — they exist so the module
# is self-contained and testable in isolation.  Remove the duplicates
# from pdf_tools.py when you retire that monolithic router.
# app.include_router(splitter_router, prefix="/api")

# Merger tool — owns /api/pdf/merger/info and /api/pdf/merger/merge
app.include_router(merger_router, prefix="/api")
