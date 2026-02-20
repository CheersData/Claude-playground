import base64
import json
import logging
from pathlib import Path

from pydantic import BaseModel

from app.agents.base import BaseAgent
from app.config import settings
from app.models.profile import DocumentExtractionResult, UserFinancialProfile
from app.prompts.document_ingestion import DOCUMENT_INGESTION_SYSTEM_PROMPT
from app.utils.merge_profiles import merge_extraction_results
from app.utils.pdf_extractor import extract_text_from_pdf

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
PDF_EXTENSIONS = {".pdf"}


class DocumentIngestionAgent(BaseAgent):
    """Agent 0: Estrae dati strutturati da documenti fiscali/finanziari."""

    def __init__(self):
        super().__init__(name="DocumentIngestion", model=settings.EXTRACTION_MODEL)

    def get_system_prompt(self) -> str:
        return DOCUMENT_INGESTION_SYSTEM_PROMPT

    def get_output_model(self) -> type[BaseModel]:
        return DocumentExtractionResult

    async def process_file(self, file_path: str) -> dict:
        """Processa un singolo file (PDF, immagine o testo)."""
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix in PDF_EXTENSIONS:
            text = extract_text_from_pdf(file_path)
            if not text.strip():
                # PDF potrebbe essere scansionato, prova come immagine
                logger.warning(
                    "PDF %s has no text, may be scanned. Skipping image fallback in MVP.",
                    path.name,
                )
                return {
                    "status": "error",
                    "error": f"PDF '{path.name}' non contiene testo estraibile. Potrebbe essere scansionato.",
                }
            return await self.run(
                f"Documento: {path.name}\n\nContenuto:\n{text}"
            )

        elif suffix in IMAGE_EXTENSIONS:
            return await self._process_image(file_path)

        else:
            # Prova come testo
            content = path.read_text(encoding="utf-8", errors="replace")
            return await self.run(
                f"Documento: {path.name}\n\nContenuto:\n{content}"
            )

    async def _process_image(self, file_path: str) -> dict:
        """Processa un'immagine usando Claude Vision API."""
        path = Path(file_path)
        suffix = path.suffix.lower().lstrip(".")
        media_type_map = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp",
        }
        media_type = media_type_map.get(suffix, "image/jpeg")

        with open(file_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                system=self.get_system_prompt(),
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data,
                                },
                            },
                            {
                                "type": "text",
                                "text": f"Analizza questo documento ({path.name}) ed estrai tutti i dati finanziari/fiscali.",
                            },
                        ],
                    }
                ],
            )

            raw_text = response.content[0].text
            json_str = self._extract_json(raw_text)
            parsed = json.loads(json_str)

            return {
                "status": "success",
                "data": parsed,
                "model": self.model,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
            }
        except Exception as e:
            logger.error("Image processing failed for %s: %s", path.name, e)
            return {
                "status": "error",
                "error": f"Elaborazione immagine fallita per {path.name}: {str(e)}",
            }

    async def process_files(
        self, file_paths: list[str], extra_info: dict | None = None
    ) -> UserFinancialProfile:
        """Processa multipli file e merge i risultati in un UserFinancialProfile."""
        results: list[DocumentExtractionResult] = []

        for fp in file_paths:
            logger.info("Processing file: %s", fp)
            result = await self.process_file(fp)

            if result["status"] == "success":
                try:
                    extraction = DocumentExtractionResult(
                        filename=Path(fp).name,
                        tipo_documento=result["data"].get(
                            "tipo_documento", "non_riconosciuto"
                        ),
                        dati_estratti=result["data"].get("dati_estratti", {}),
                        confidence=result["data"].get("confidence", 0.0),
                        warnings=result["data"].get("warnings", []),
                    )
                    results.append(extraction)
                except Exception as e:
                    logger.error("Failed to parse extraction result for %s: %s", fp, e)
            else:
                logger.warning("File processing failed for %s: %s", fp, result.get("error"))

        return merge_extraction_results(results, extra_info)
