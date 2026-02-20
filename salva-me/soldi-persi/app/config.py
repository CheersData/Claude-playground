from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Configurazione dell'applicazione, caricata da variabili d'ambiente / .env."""

    ANTHROPIC_API_KEY: str = Field(..., description="Chiave API Anthropic")
    DEFAULT_MODEL: str = Field(
        default="claude-sonnet-4-5-20250929",
        description="Modello di default per gli agenti di analisi",
    )
    EXTRACTION_MODEL: str = Field(
        default="claude-haiku-4-5-20251001",
        description="Modello per l'estrazione documenti (cost-efficient)",
    )
    LOG_LEVEL: str = Field(default="INFO")
    MAX_FILE_SIZE_MB: int = Field(default=20)
    MAX_FILES_PER_REQUEST: int = Field(default=10)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
