import io
from pathlib import Path

from fastapi import HTTPException, UploadFile

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
TEXT_EXTENSIONS = {".txt", ".md"}


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages)
    except PdfReadError as exc:
        raise HTTPException(status_code=400, detail="Could not read this PDF. Is it password protected?") from exc


def extract_text(file: UploadFile) -> str:
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large. The limit is 5 MB.")
    extension = Path(file.filename or "").suffix.lower()
    if extension == ".pdf":
        text = _pdf_text(data)
    elif extension in TEXT_EXTENSIONS:
        text = data.decode("utf-8", errors="replace")
    else:
        raise HTTPException(status_code=400, detail="Upload a PDF, .txt or .md file.")
    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No text found in this file. Scanned PDFs (images of pages) are not supported.",
        )
    return text.strip()
