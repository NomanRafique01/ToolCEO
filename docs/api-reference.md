# API Reference

All endpoints are served by the Python FastAPI backend at `http://127.0.0.1:8000`.

An interactive Swagger UI is available at `http://127.0.0.1:8000/docs` when the backend is running.

---

## Common Patterns

### Async Job Response (202)

Most conversion endpoints return immediately with a job ID:

```json
{ "job_id": "550e8400-e29b-41d4-a716-446655440000" }
```

The frontend then:
1. Opens a `GET /api/progress/{job_id}` SSE stream to track progress
2. On `state: "done"`, calls `GET /api/download/{job_id}` to retrieve the result

### SSE Progress Event Shape

```
data: {"state": "running",  "progress": 45}
data: {"state": "done",     "progress": 100, "filename": "out.pdf", "media_type": "application/pdf"}
data: {"state": "error",    "progress": 0,   "error": "Something went wrong"}
```

Optional fields on `done` for compressor/image tools:
```json
{
  "original_size": 1048576,
  "compressed_size": 524288,
  "saved_percent": 50.0
}
```

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Returns `{"status": "ToolCEO backend running"}` |
| `GET` | `/health` | Returns `{"status": "ok"}` |

---

## Progress & Download

### `GET /api/progress/{job_id}`

Streams Server-Sent Events until the job finishes or errors.

- **Content-Type:** `text/event-stream`
- **Poll interval:** 250 ms
- **Terminal states:** `done` or `error` (stream closes after either)

### `GET /api/download/{job_id}`

Returns the completed file bytes.

- **Response:** Binary file with `Content-Disposition: attachment; filename="..."`
- **404** if the job is not found or not yet done
- Waits up to 10 s if the job is still transitioning to `done`

---

## PDF Tools

Base prefix: `/api/pdf/`

### Split

```
POST /api/pdf/split
Content-Type: multipart/form-data

Fields:
  file     : <PDF file>
  ranges   : "1-3,5,7-9"   (page range string)

Response 202:
  { "job_id": "..." }

Download: ZIP of extracted PDFs (one per range)
```

### Merge

```
POST /api/pdf/merger/merge
Content-Type: multipart/form-data

Fields:
  files    : <PDF file>[]   (multiple files, same field name)

Response 202:
  { "job_id": "..." }

Download: merged.pdf
```

```
POST /api/pdf/merger/info
Fields:
  files    : <PDF file>[]

Response 200:
  { "total_pages": 12, "file_count": 3 }
```

### Compress

```
POST /api/pdf/compressor/compress
Content-Type: multipart/form-data

Fields:
  file             : <PDF file>
  password         : string (optional, for encrypted PDFs)
  max_file_size    : integer (optional, target output size in bytes)
  output_filename  : string (optional, default "compressed.pdf")

Response 202:
  { "job_id": "..." }
```

```
POST /api/pdf/compressor/info
Fields:
  file     : <PDF file>
  password : string (optional)

Response 200:
  { "page_count": 5, "file_size": 1048576, "thumbnail": "<base64 JPEG>" }
```

### Rotate

```
POST /api/pdf/rotate/rotate
Fields:
  file      : <PDF file>
  angle     : 90 | 180 | 270
  pages     : "all" | "1,3,5" | "1-3"

Response 202: { "job_id": "..." }
```

### Encrypt / Decrypt

```
POST /api/pdf/encrypt/encrypt
Fields:
  file            : <PDF file>
  password        : string (owner password)
  user_password   : string (optional, user open password)

Response 202: { "job_id": "..." }

POST /api/pdf/encrypt/decrypt
Fields:
  file     : <PDF file>
  password : string

Response 202: { "job_id": "..." }
```

### Watermark

```
POST /api/pdf/watermark/add
Fields:
  file       : <PDF file>
  text       : string (watermark text)
  opacity    : float 0.0–1.0
  angle      : integer (rotation degrees)
  font_size  : integer

Response 202: { "job_id": "..." }
```

### Editor

```
POST /api/pdf/editor/edit
Fields:
  file       : <PDF file>
  operations : JSON string describing edits

Response 202: { "job_id": "..." }
```

### Extractor (Text / Images)

```
POST /api/pdf/extractor/extract-text
Fields:
  file     : <PDF file>
  pages    : "all" | page range string

Response 202: { "job_id": "..." }
Download: .txt file

POST /api/pdf/extractor/extract-images
Fields:
  file     : <PDF file>

Response 202: { "job_id": "..." }
Download: ZIP of extracted images
```

---

## PDF Conversions

### PDF → Word

```
POST /api/pdf/word/convert
Fields:
  file     : <PDF file>

Response 202: { "job_id": "..." }
Download: output.docx
```

### PDF → Excel

```
POST /api/pdf/excel/convert
Fields:
  file     : <PDF file>

Response 202: { "job_id": "..." }
Download: output.xlsx
```

### PDF → HTML

```
POST /api/pdf/html/convert
Fields:
  file     : <PDF file>

Response 202: { "job_id": "..." }
Download: output.html
```

### PDF → TXT

```
POST /api/pdf/txt/convert
Fields:
  file     : <PDF file>

Response 202: { "job_id": "..." }
Download: output.txt
```

### PDF → PowerPoint

```
POST /api/pdf/ppt/convert
Fields:
  file     : <PDF file>

Response 202: { "job_id": "..." }
Download: output.pptx
```

### PDF → Images

```
POST /api/pdf/images/convert
Fields:
  file     : <PDF file>
  format   : "png" | "jpg" (default "png")
  dpi      : integer (default 150)

Response 202: { "job_id": "..." }
Download: ZIP of page images
```

### Images → PDF

```
POST /api/images/pdf/convert
Fields:
  files    : <image files>[]

Response 202: { "job_id": "..." }
Download: output.pdf
```

---

## Document Converters

All document converters follow the same pattern:

```
POST /api/{source}/{target}/convert
Fields:
  file     : <source file>

Response 202: { "job_id": "..." }
```

### DOCX Conversions (`/api/docx/{target}/convert`)

| Target | Output |
|--------|--------|
| `pdf` | `.pdf` |
| `html` | `.html` |
| `odt` | `.odt` |
| `txt` | `.txt` |
| `epub` | `.epub` |
| `md` | `.md` |

### PPTX Conversions (`/api/pptx/{target}/convert`)

| Target | Output |
|--------|--------|
| `pdf` | `.pdf` |
| `html` | `.html` |
| `images` | `.zip` of images |
| `odp` | `.odp` |
| `txt` | `.txt` |
| `repair` | `.pptx` |

### XLSX Conversions (`/api/xlsx/{target}/convert`)

| Target | Output |
|--------|--------|
| `pdf` | `.pdf` |
| `csv` | `.csv` |
| `html` | `.html` |
| `ods` | `.ods` |
| `txt` | `.txt` |
| `json` | `.json` |

### TXT Conversions (`/api/txt/{target}/convert`)

| Target | Output |
|--------|--------|
| `pdf` | `.pdf` |
| `docx` | `.docx` |
| `html` | `.html` |
| `md` | `.md` |
| `epub` | `.epub` |
| `odt` | `.odt` |
| `rtf` | `.rtf` |

### ODT Conversions (`/api/odt/{target}/convert`)

| Target | Output |
|--------|--------|
| `pdf` | `.pdf` |
| `docx` | `.docx` |
| `html` | `.html` |
| `rtf` | `.rtf` |
| `txt` | `.txt` |
| `epub` | `.epub` |
| `md` | `.md` |

### CSV Conversions (`/api/csv/{target}/convert`)

| Target | Output |
|--------|--------|
| `json` | `.json` |
| `xlsx` | `.xlsx` |
| `html` | `.html` |
| `md` | `.md` |
| `pdf` | `.pdf` |
| `txt` | `.txt` |
| `xml` | `.xml` |
| `sql` | `.sql` |

---

## Image Tools

### Image Compressor

```
POST /api/images/compress/{fmt}
  fmt: jpg | png | webp | gif | bmp | tiff | svg

Fields:
  file     : <image file>
  quality  : integer 1-100 (where applicable)

Response 202: { "job_id": "..." }

SSE done payload also includes:
  original_size, compressed_size, saved_percent
```

### JPG Converter (`/api/jpg/to-{target}/convert`)

Targets: `png`, `webp`, `pdf`, `bmp`, `tiff`, `ico`, `gif`, `txt`

### PNG Converter (`/api/png/to-{target}/convert`)

Targets: `jpg`, `webp`, `pdf`, `bmp`, `tiff`, `ico`, `txt`

### WEBP Converter (`/api/webp/to-{target}/convert`)

Targets: `jpg`, `png`, `pdf`, `bmp`, `tiff`, `ico`

### SVG Converter (`/api/svg/to-{target}/convert`)

Targets: `png`, `jpg`, `webp`, `pdf`

All image converters:
```
POST /api/{source}/to-{target}/convert
Fields:
  file     : <image file>

Response 202: { "job_id": "..." }
```

---

## eBook Conversions

```
POST /api/ebooks/convert
Fields:
  file         : <ebook file>
  source_fmt   : "epub" | "mobi" | "azw3" | "fb2" | "rtf" | "txt" | "pdf"
  target_fmt   : "epub" | "mobi" | "azw3" | "fb2" | "rtf" | "txt" | "pdf"

Response 202: { "job_id": "..." }
```

Backed by Calibre CLI or a native pdf-epub engine depending on the conversion pair.

---

## Archives

```
POST /api/archives/create
Fields:
  files    : <files>[]
  format   : "zip" | "7z" | "tar" | "tar.gz" | "tar.bz2"
  name     : string (output archive name without extension)

Response 202: { "job_id": "..." }

POST /api/archives/extract
Fields:
  file     : <archive file>

Response 202: { "job_id": "..." }
Download: ZIP of extracted contents, or extracted files directly
```

---

## Error Responses

| Code | Meaning |
|------|---------|
| `200` | Synchronous success |
| `202` | Job accepted, poll `/api/progress/{job_id}` |
| `404` | Job not found or file not ready |
| `422` | Validation error (invalid PDF, unsupported format, etc.) |
| `500` | Unexpected server error |
