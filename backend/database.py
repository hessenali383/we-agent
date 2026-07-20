"""SQLite persistence layer for WE Telecom customer profiles.

SQLite is used here exactly as in the original notebook — as a lightweight
stand-in for a relational (MySQL-style) database. See the README for notes
on pointing this at a real MySQL server instead.
"""
import logging
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import get_settings

logger = logging.getLogger(__name__)


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Yield a short-lived SQLite connection (SQLite connections are not thread-safe to share)."""
    settings = get_settings()
    conn = sqlite3.connect(settings.sqlite_db_path)
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    """Create the `users` table if it does not already exist. Safe to call on every startup."""
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                phone TEXT,
                age INTEGER,
                city TEXT
            )
            """
        )
        conn.commit()
    logger.info("SQLite database ready at '%s' ('users' table verified).", get_settings().sqlite_db_path)


def insert_user_profile(name: str, phone: str, age: int, city: str) -> None:
    """Insert an already-validated user profile row."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO users (name, phone, age, city) VALUES (?, ?, ?, ?)",
            (name, phone, age, city),
        )
        conn.commit()
