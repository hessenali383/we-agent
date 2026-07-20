"""Structured logging configuration for the backend."""
import logging
import sys

from .config import get_settings


def setup_logging() -> None:
    """Configure root logging once, at server startup."""
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )

    # Third-party libraries are noisy at INFO/DEBUG — keep them quiet.
    for noisy_logger in ("httpx", "httpcore", "pymongo", "urllib3", "qdrant_client"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)
