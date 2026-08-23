from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.pdf_tools import router as pdf_router
from routers.pdf_conversions import router as pdf_conversions_router
from routers.sse_progress import router as sse_router
# Tool sub-modules — each tool owns its own router
from tools.documents.pdf_tools.splitter.router   import router as splitter_router
from tools.documents.pdf_tools.merger.router      import router as merger_router
from tools.documents.pdf_tools.compressor.router  import router as compressor_router
from tools.documents.pdf_tools.encrypt.router     import router as encrypt_router
from tools.documents.pdf_tools.rotate.router      import router as rotate_router
from tools.documents.pdf_tools.editor.router      import router as editor_router
from tools.documents.pdf_tools.water_mark.router   import router as watermark_router
from tools.documents.pdf_tools.extractor.router   import router as extractor_router
# PDF Convertor tools
from tools.documents.pdf_convertor.pdf_word.router  import router as pdf_word_router
from tools.documents.pdf_convertor.pdf_excel.router import router as pdf_excel_router
from tools.documents.pdf_convertor.pdf_html.router  import router as pdf_html_router
from tools.documents.pdf_convertor.pdf_txt.router   import router as pdf_txt_router

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


app.include_router(encrypt_router, prefix="/api")
app.include_router(rotate_router, prefix="/api")
app.include_router(editor_router, prefix="/api")
app.include_router(watermark_router, prefix="/api")
app.include_router(extractor_router, prefix="/api")
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
# Compressor tool — owns /api/pdf/compressor/info and /api/pdf/compressor/compress
app.include_router(compressor_router, prefix="/api")
# PDF → Word converter — owns /api/pdf/word/info and /api/pdf/word/convert
app.include_router(pdf_word_router,  prefix="/api")
# PDF → Excel converter — owns /api/pdf/excel/info and /api/pdf/excel/convert
app.include_router(pdf_excel_router, prefix="/api")
# PDF → HTML converter — owns /api/pdf/html/info and /api/pdf/html/convert
app.include_router(pdf_html_router,  prefix="/api")
# PDF → TXT extractor — owns /api/pdf/txt/info and /api/pdf/txt/convert
app.include_router(pdf_txt_router,   prefix="/api")


