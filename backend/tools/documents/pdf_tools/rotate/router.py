"""
PDF Rotate router.

Endpoints
---------
POST /api/pdf/rotate/info
    Synchronous preview helper. Accepts one PDF and returns page count plus a
    first-page thumbnail, matching the pattern used by Merger and Compressor.

POST /api/rotate-pdf
    Synchronous rotate endpoint used by the Rotate Pages frontend viewer.
    Accepts base64 PDF bytes and a per-page rotations array, returns a base64
    output PDF.
"""

from __future__ import annotations

import base64
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator

from tools.documents.pdf_tools.rotate.engine import (
    get_pdf_info,
    rotate_pdf_pages,
)

router = APIRouter(tags=["PDF Rotate"])


class RotatePdfRequest(BaseModel):
    file: str = Field(..., min_length=1)
    rotations: List[int] = Field(..., min_length=1)
    password: Optional[str] = None

    @validator("rotations")
    def validate_rotations(cls, value: List[int]) -> List[int]:
        allowed = {0, 90, 180, 270}
        invalid = [angle for angle in value if int(angle) % 360 not in allowed]
        if invalid:
            raise ValueError("Rotations must be one of 0, 90, 180 or 270 degrees.")
        return [int(angle) % 360 for angle in value]


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


@router.post(
    "/pdf/rotate/info",
    summary="Return page count + first-page thumbnail for a PDF",
)
async def pdf_rotate_info(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
):
    _validate_pdf_upload(file)
    raw = await _read(file)

    try:
        info = get_pdf_info(raw, password or None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")

    return JSONResponse(info)


@router.post(
    "/rotate-pdf",
    summary="Rotate PDF pages from base64 payload",
)
async def rotate_pdf_endpoint(payload: RotatePdfRequest):
    raw = _decode_base64_pdf(payload.file)

    try:
        output = rotate_pdf_pages(
            raw,
            payload.rotations,
            payload.password or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not rotate PDF: {exc}")

    encoded = base64.b64encode(output).decode("ascii")
    return JSONResponse(
        {
            "file": encoded,
            "filename": "rotated.pdf",
            "media_type": "application/pdf",
        }
    )
