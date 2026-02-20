import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_path: str) -> str:
    """Estrae testo da un file PDF usando pdfplumber."""
    try:
        import pdfplumber
    except ImportError:
        logger.error("pdfplumber not installed. Run: pip install pdfplumber")
        return ""

    path = Path(file_path)
    if not path.exists():
        logger.error("File not found: %s", file_path)
        return ""

    text_parts: list[str] = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"--- Pagina {i + 1} ---\n{page_text}")
                else:
                    text_parts.append(f"--- Pagina {i + 1} --- [nessun testo estraibile]")

                # Estrai anche tabelle se presenti
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if row:
                            text_parts.append(
                                " | ".join(cell or "" for cell in row)
                            )

    except Exception as e:
        logger.error("Failed to extract text from PDF %s: %s", file_path, e)
        return ""

    return "\n".join(text_parts)
