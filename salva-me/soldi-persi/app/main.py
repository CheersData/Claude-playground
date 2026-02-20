"""FastAPI application — Soldi Persi API."""

import json
import logging
import time
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.agents.document_ingestion import DocumentIngestionAgent
from app.agents.orchestrator import OrchestratorAgent
from app.config import settings
from app.models.report import FinalReport

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Soldi Persi",
    description="Analisi finanziaria intelligente per contribuenti italiani",
    version="0.1.0",
)

# In-memory store per i report (MVP — in produzione usare un DB)
_reports: dict[str, dict] = {}


@app.get("/api/health")
async def health():
    """Health check."""
    return {"status": "ok", "version": "0.1.0"}


@app.post("/api/analyze")
async def analyze(
    files: list[UploadFile] = File(...),
    info_aggiuntive: str | None = Form(default=None),
):
    """Upload documenti e ottieni il report completo."""
    # Validazione
    if len(files) > settings.MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Massimo {settings.MAX_FILES_PER_REQUEST} file per richiesta",
        )

    for f in files:
        if f.size and f.size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' supera il limite di {settings.MAX_FILE_SIZE_MB}MB",
            )

    extra_info = None
    if info_aggiuntive:
        try:
            extra_info = json.loads(info_aggiuntive)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="info_aggiuntive deve essere un JSON valido",
            )

    start_time = time.time()

    # Salva file temporanei
    with TemporaryDirectory() as tmpdir:
        file_paths: list[str] = []
        for f in files:
            tmp_path = Path(tmpdir) / (f.filename or f"upload_{uuid.uuid4()}")
            content = await f.read()
            tmp_path.write_bytes(content)
            file_paths.append(str(tmp_path))

        # Step 1: Document Ingestion
        ingestion = DocumentIngestionAgent()
        profile = await ingestion.process_files(file_paths, extra_info)

        # Step 2: Orchestrator analysis
        orchestrator = OrchestratorAgent()
        report = await orchestrator.analyze(profile)

    elapsed = time.time() - start_time

    # Salva report in memory
    report_id = report.user_id
    _reports[report_id] = report.model_dump(mode="json")

    return {
        "status": "completed",
        "report_id": report_id,
        "report": report.model_dump(mode="json"),
        "processing_time_seconds": round(elapsed, 1),
    }


@app.post("/api/extract")
async def extract(
    files: list[UploadFile] = File(...),
    info_aggiuntive: str | None = Form(default=None),
):
    """Solo estrazione documenti (senza analisi)."""
    if len(files) > settings.MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Massimo {settings.MAX_FILES_PER_REQUEST} file per richiesta",
        )

    extra_info = None
    if info_aggiuntive:
        try:
            extra_info = json.loads(info_aggiuntive)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="info_aggiuntive deve essere un JSON valido",
            )

    with TemporaryDirectory() as tmpdir:
        file_paths: list[str] = []
        for f in files:
            tmp_path = Path(tmpdir) / (f.filename or f"upload_{uuid.uuid4()}")
            content = await f.read()
            tmp_path.write_bytes(content)
            file_paths.append(str(tmp_path))

        ingestion = DocumentIngestionAgent()
        profile = await ingestion.process_files(file_paths, extra_info)

    return {
        "status": "completed",
        "profile": profile.model_dump(mode="json"),
    }


@app.get("/api/report/{report_id}")
async def get_report(report_id: str):
    """Recupera un report già generato."""
    if report_id not in _reports:
        raise HTTPException(status_code=404, detail="Report non trovato")
    return {"status": "ok", "report": _reports[report_id]}
