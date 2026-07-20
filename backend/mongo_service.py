"""MongoDB Atlas integration: connection management, support tickets, and chat history.

Mirrors the notebook's MongoDB logic exactly (including the password URL-encoding
fix and the relaxed TLS settings needed for some Atlas/Colab environments), just
refactored into reusable, testable functions instead of top-level script code.
"""
import datetime
import logging
import urllib.parse
from functools import lru_cache

import certifi
import pymongo
from langchain_mongodb import MongoDBChatMessageHistory

from .config import get_settings

logger = logging.getLogger(__name__)


def _encode_mongo_uri(raw_uri: str) -> str:
    """URL-encode the password segment of a Mongo URI.

    Passwords containing characters like '@' or '/' break naive URI parsing
    unless percent-encoded. This reproduces the notebook's fix generically.
    """
    if not raw_uri or "@" not in raw_uri or "://" not in raw_uri:
        return raw_uri

    scheme, rest = raw_uri.split("://", 1)
    creds_and_host = rest.split("@", 1)
    if len(creds_and_host) != 2:
        return raw_uri

    credentials, host = creds_and_host
    if ":" not in credentials:
        return raw_uri

    username, password = credentials.split(":", 1)
    encoded_password = urllib.parse.quote_plus(password)
    return f"{scheme}://{username}:{encoded_password}@{host}"


@lru_cache
def get_mongo_client() -> pymongo.MongoClient:
    """Return a process-wide singleton MongoClient, verifying connectivity once."""
    settings = get_settings()
    encoded_uri = _encode_mongo_uri(settings.mongo_uri)

    client = pymongo.MongoClient(
        encoded_uri,
        tls=True,
        tlsCAFile=certifi.where(),
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=5000,
    )

    try:
        client.admin.command("ping")
        logger.info("Connected to MongoDB Atlas.")
    except Exception:
        logger.exception(
            "Failed to connect to MongoDB. Check MONGO_URI and that your server's "
            "IP is whitelisted in Atlas Network Access."
        )
        raise

    return client


def get_tickets_collection():
    settings = get_settings()
    client = get_mongo_client()
    return client[settings.mongo_db_name][settings.mongo_tickets_collection]


def insert_ticket(phone: str, issue_type: str, description: str) -> str:
    """Insert a new support ticket document and return its generated ID."""
    ticket = {
        "phone": phone,
        "issue_type": issue_type,
        "description": description,
        "status": "Open",
        "created_at": datetime.datetime.now(datetime.timezone.utc),
    }
    result = get_tickets_collection().insert_one(ticket)
    return str(result.inserted_id)


def get_message_history(session_id: str) -> MongoDBChatMessageHistory:
    """Return the LangChain chat-history object backing a given session."""
    settings = get_settings()
    return MongoDBChatMessageHistory(
        session_id=session_id,
        connection_string=_encode_mongo_uri(settings.mongo_uri),
        database_name=settings.mongo_db_name,
        collection_name=settings.mongo_chat_history_collection,
    )


def clear_session_history(session_id: str) -> None:
    """Wipe stored chat history for a session (used by POST /reset)."""
    get_message_history(session_id).clear()
