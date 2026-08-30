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
from tools.documents.pdf_convertor.pdf_ppt.router    import router as pdf_ppt_router
from tools.documents.pdf_convertor.pdf_images.router import router as pdf_images_router
from tools.documents.pdf_convertor.images_pdf.router import router as images_pdf_router
# eBook conversion — single router backed by utils/calibre_engine.py
from tools.ebooks.router import router as ebooks_router
# DOCX conversion tools — single router (6 targets: pdf, html, odt, txt, epub, md)
from tools.documents.docx_convertor.router import router as docx_convertor_router
# PPTX conversion tools — single router (6 targets: pdf, html, images, odp, txt, pptx/repair)
from tools.documents.pptx_convertor.router import router as pptx_convertor_router
# XLSX conversion tools — single router (6 targets: pdf, csv, html, ods, txt, json)
from tools.documents.xlsx_convertor.router import router as xlsx_convertor_router
# TXT conversion tools — single router (7 targets: pdf, docx, html, md, epub, odt, rtf)
from tools.documents.txt_convertor.router import router as txt_convertor_router
# ODT conversion tools — single router (7 targets: pdf, docx, html, rtf, txt, epub, md)
from tools.documents.odt_convertor.router import router as odt_convertor_router
# CSV conversion tools — single router (8 targets: json, xlsx, html, md, pdf, txt, xml, sql)
from tools.documents.csv_convertor.router import router as csv_convertor_router
# Image Compressor — 7 formats: jpg, png, webp, gif, bmp, tiff, svg
from tools.images.image_compressor.router import router as image_compressor_router
# JPG Convertor — 8 targets: png, webp, pdf, bmp, tiff, ico, gif, txt
from tools.images.jpg_convertor.router import router as jpg_convertor_router
# PNG Convertor — 7 targets: jpg, webp, pdf, bmp, tiff, ico, txt
from tools.images.png_convertor.router import router as png_convertor_router
# WEBP Convertor — 7 targets: jpg, png, pdf, bmp, tiff, ico, txt
from tools.images.webp_convertor.router import router as webp_convertor_router
# SVG Convertor — 4 targets: png, jpg, webp, pdf
from tools.images.svg_convertor.router import router as svg_convertor_router

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
# PDF → PPT converter — owns /api/pdf/ppt/info and /api/pdf/ppt/convert
app.include_router(pdf_ppt_router,    prefix="/api")
# PDF → Images converter — owns /api/pdf/images/info and /api/pdf/images/convert
app.include_router(pdf_images_router, prefix="/api")
# Images → PDF converter — owns /api/images/pdf/convert
app.include_router(images_pdf_router, prefix="/api")
# eBook converter — owns /api/ebooks/convert
app.include_router(ebooks_router, prefix="/api")
# DOCX converter — owns /api/docx/{target}/convert
app.include_router(docx_convertor_router, prefix="/api")
# PPTX converter — owns /api/pptx/{target}/convert
app.include_router(pptx_convertor_router, prefix="/api")
# XLSX converter — owns /api/xlsx/{target}/convert
app.include_router(xlsx_convertor_router, prefix="/api")
# TXT converter — owns /api/txt/{target}/convert
app.include_router(txt_convertor_router, prefix="/api")
# ODT converter — owns /api/odt/{target}/convert
app.include_router(odt_convertor_router, prefix="/api")
# CSV converter — owns /api/csv/{target}/convert
app.include_router(csv_convertor_router, prefix="/api")
# Image Compressor — owns /api/images/compress/{fmt}
app.include_router(image_compressor_router, prefix="/api")
# JPG Convertor — owns /api/jpg/to-{target}/convert
app.include_router(jpg_convertor_router, prefix="/api")
# PNG Convertor — owns /api/png/to-{target}/convert
app.include_router(png_convertor_router, prefix="/api")
# WEBP Convertor — owns /api/webp/to-{target}/convert
app.include_router(webp_convertor_router, prefix="/api")
# SVG Convertor — owns /api/svg/to-{target}/convert
app.include_router(svg_convertor_router, prefix="/api")


