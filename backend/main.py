from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.pdf_tools import router as pdf_router
from routers.pdf_conversions import router as pdf_conversions_router
from routers.sse_progress import router as sse_router

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
