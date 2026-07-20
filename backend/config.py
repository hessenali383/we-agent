"""
Configuration module for the WE Telecom AI Agent backend.

Every configurable value used across the application lives here and is
loaded from environment variables (typically via a local `.env` file).
Nothing sensitive is ever hardcoded — see `.env.example` for the full list
of variables this project expects.
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ---- API Keys ----
    google_api_key: str = ""
    qdrant_api_key: str = ""

    # ---- Database URLs ----
    mongo_uri: str = ""
    qdrant_url: str = ""
    sqlite_db_path: str = "we_telecom.db"

    # ---- MongoDB ----
    mongo_db_name: str = "we_telecom_db"
    mongo_tickets_collection: str = "tickets"
    mongo_chat_history_collection: str = "chat_history"

    # ---- Qdrant / Vector store ----
    qdrant_collection_name: str = "we_knowledge_base"
    embedding_model_name: str = "all-MiniLM-L6-v2"
    embedding_dimension: int = 384
    retriever_top_k: int = 3
    chunk_size: int = 500
    chunk_overlap: int = 50

    # ---- Knowledge base (loaded from local markdown files, no downloads) ----
    # Leave empty to use the built-in default: backend/data/knowledge/
    knowledge_dir: str = ""

    # ---- LLM ----
    llm_model_name: str = "gemini-2.5-flash"
    llm_temperature: float = 0.8

    # ---- Server ----
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: List[str] = ["*"]
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    """Return a process-wide cached Settings instance (parsed once)."""
    return Settings()
