"""Edit PDF router."""

from __future__ import annotations

import base64

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from tools.documents.pdf_tools.editor.engine import load_pages, save_edited_pdf

router = APIRouter(prefix="/pdf/editor", tags=["PDF Editor"])


class EditedPage(BaseModel):
    page_number: int = Field(..., ge=1)
    image: str = Field(..., min_length=1)


class SaveEditedPdfRequest(BaseModel):
    file: str = Field(..., min_length=1)
    edits: list[EditedPage] = Field(..., min_length=1)
    filename: str | None = None


async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _validate_pdf_upload(file: UploadFile) -> None:
    name = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if not (name.endswith(".pdf") or content_type == "application/pdf"):
        raise HTTPException(
            status_code=422,
            detail="Invalid File Format. Please select a valid PDF file.",
        )


def _decode_base64_pdf(file_data: str) -> bytes:
    try:
        if "," in file_data:
            file_data = file_data.split(",", 1)[1]
        return base64.b64decode(file_data, validate=True)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail="Invalid PDF payload. Expected base64 encoded PDF data.",
        ) from exc


@router.get("/info", summary="Return Edit PDF tool placeholder metadata")
def editor_info():
    return {
        "tool": "Edit PDF",
        "status": "ready",
        "message": "PDF page loading is available.",
    }


@router.post(
    "/load-pages",
    summary="Load a PDF and return editable page thumbnails",
)
async def load_editor_pages(file: UploadFile = File(...)):
    _validate_pdf_upload(file)
    raw = await _read(file)

    try:
        payload = load_pages(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not load PDF: {exc}")

    return JSONResponse(payload)


@router.post(
    "/save",
    summary="Save edited PDF pages from browser editor payload",
)
async def save_editor_pdf(payload: SaveEditedPdfRequest):
    raw = _decode_base64_pdf(payload.file)

    try:
        output = save_edited_pdf(
            raw,
            [edit.dict() for edit in payload.edits],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save edited PDF: {exc}")

    encoded = base64.b64encode(output).decode("ascii")
    return JSONResponse(
        {
            "file": encoded,
            "filename": payload.filename or "edited.pdf",
            "media_type": "application/pdf",
        }
    )
