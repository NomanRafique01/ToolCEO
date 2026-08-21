"""
PDF Encrypt / Decrypt / Check Encryption FastAPI Router
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
import pikepdf

from tools.documents.pdf_tools.encrypt.engine import (
    check_pdf_encryption,
    decrypt_pdf,
    encrypt_pdf,
)
from tools.documents.pdf_tools.encrypt.vault_engine import (
    check_vault_file,
    lock_vault_pdf,
    unlock_vault_pdf,
)

router = APIRouter(prefix="/pdf", tags=["PDF Encrypt / Decrypt / ToolCEO Vault"])


def _make_error_response(status_code: int, error_code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": error_code, "message": message},
    )


def _handle_engine_exception(exc: Exception) -> JSONResponse:
    if isinstance(exc, pikepdf.PasswordError):
        return _make_error_response(400, "incorrect_password", "Wrong password")
    if isinstance(exc, pikepdf.PdfError):
        return _make_error_response(400, "invalid_file", "File is not a valid PDF document")

    msg_str = str(exc)
    if ":" in msg_str:
        parts = msg_str.split(":", 1)
        err_code = parts[0].strip()
        err_msg = parts[1].strip()
        if err_code in (
            "incorrect_password",
            "not_encrypted",
            "invalid_file",
            "password_too_short",
            "invalid_pdf",
            "not_tceo_file",
            "wrong_password",
        ):
            return _make_error_response(400, err_code, err_msg)

    return _make_error_response(500, "server_error", msg_str)


@router.post("/encrypt", summary="Encrypt a PDF with password and permission restrictions")
async def encrypt_endpoint(
    file: UploadFile = File(...),
    user_password: str = Form(...),
    owner_password: Optional[str] = Form(None),
    encryption_level: str = Form("256"),
    allow_printing: bool = Form(True),
    allow_copying: bool = Form(False),
    allow_editing: bool = Form(False),
    allow_annotations: bool = Form(False),
    allow_forms: bool = Form(False),
):
    try:
        raw = await file.read()
        encrypted_bytes = encrypt_pdf(
            file_bytes=raw,
            user_password=user_password,
            owner_password=owner_password,
            encryption_level=encryption_level,
            allow_printing=allow_printing,
            allow_copying=allow_copying,
            allow_editing=allow_editing,
            allow_annotations=allow_annotations,
            allow_forms=allow_forms,
        )
    except Exception as exc:
        return _handle_engine_exception(exc)

    orig_name = file.filename or "document.pdf"
    base_name = orig_name.rsplit(".", 1)[0] if "." in orig_name else orig_name
    out_filename = f"{base_name}_encrypted.pdf"

    return Response(
        content=encrypted_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{out_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/decrypt", summary="Unlock and decrypt a password-protected PDF")
async def decrypt_endpoint(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    try:
        raw = await file.read()
        decrypted_bytes = decrypt_pdf(file_bytes=raw, password=password)
    except Exception as exc:
        return _handle_engine_exception(exc)

    orig_name = file.filename or "document.pdf"
    base_name = orig_name.rsplit(".", 1)[0] if "." in orig_name else orig_name
    out_filename = f"{base_name}_unlocked.pdf"

    return Response(
        content=decrypted_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{out_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/check-encryption", summary="Check PDF encryption status and restrictions")
async def check_encryption_endpoint(
    file: UploadFile = File(...),
):
    try:
        raw = await file.read()
        info = check_pdf_encryption(file_bytes=raw)
    except Exception as exc:
        return _handle_engine_exception(exc)

    return JSONResponse(content=info)


# ---------------------------------------------------------------------------
# ToolCEO Vault (.tceo) Endpoints
# ---------------------------------------------------------------------------


@router.post("/vault-lock", summary="Permanently lock a PDF into a ToolCEO Vault (.tceo) binary container")
async def vault_lock_endpoint(
    file: UploadFile = File(...),
    password: str = Form(...),
    hint: Optional[str] = Form(None),
):
    try:
        raw = await file.read()
        vault_bytes = lock_vault_pdf(file_bytes=raw, password=password, hint=hint)
    except Exception as exc:
        return _handle_engine_exception(exc)

    orig_name = file.filename or "document.pdf"
    base_name = orig_name.rsplit(".", 1)[0] if "." in orig_name else orig_name
    out_filename = f"{base_name}.tceo"

    return Response(
        content=vault_bytes,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{out_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/vault-unlock", summary="Recover and unlock a PDF from a ToolCEO Vault (.tceo) container")
async def vault_unlock_endpoint(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    try:
        raw = await file.read()
        pdf_bytes = unlock_vault_pdf(file_bytes=raw, password=password)
    except Exception as exc:
        return _handle_engine_exception(exc)

    orig_name = file.filename or "locked.tceo"
    base_name = orig_name.rsplit(".", 1)[0] if "." in orig_name else orig_name
    if base_name.endswith("_encrypted") or base_name.endswith("_vault"):
        base_name = base_name.rsplit("_", 1)[0]
    out_filename = f"{base_name}_unlocked.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{out_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/vault-check", summary="Check if a file is a ToolCEO Vault (.tceo) container")
async def vault_check_endpoint(
    file: UploadFile = File(...),
):
    try:
        raw = await file.read()
        info = check_vault_file(file_bytes=raw)
    except Exception as exc:
        return _handle_engine_exception(exc)

    return JSONResponse(content=info)

