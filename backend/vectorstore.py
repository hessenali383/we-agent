"""Qdrant vector store: embedding model, knowledge-base ingestion, and retriever.

The knowledge base is loaded from local markdown files that already ship with
the project (see `backend/data/knowledge/`) — nothing is downloaded from the
network. Ingestion (load -> split -> embed -> upsert) only runs when the
target Qdrant collection doesn't already exist / is empty, so the knowledge
base survives server restarts instead of being rebuilt on every boot:

    Server Start
      -> If Qdrant collection exists -> Load existing collection -> Ready
      -> Else -> Load markdown files -> Split documents
              -> Generate MiniLM embeddings -> Insert into Qdrant -> Ready
"""
import logging
from functools import lru_cache
from pathlib import Path
from typing import List

import qdrant_client
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client.http.models import Distance, VectorParams

from .config import get_settings

logger = logging.getLogger(__name__)

# Default location of the local knowledge base, relative to this file
# (i.e. `backend/data/knowledge/`) — independent of the process's cwd.
DEFAULT_KNOWLEDGE_DIR = Path(__file__).resolve().parent / "data" / "knowledge"


@lru_cache
def get_embeddings() -> HuggingFaceEmbeddings:
    """Load the MiniLM sentence-transformers embedding model.

    This runs locally (no external embedding API calls) — kept identical to
    the notebook, which deliberately avoids OpenAI embeddings.
    """
    settings = get_settings()
    logger.info("Loading embedding model: %s", settings.embedding_model_name)
    return HuggingFaceEmbeddings(model_name=settings.embedding_model_name)


@lru_cache
def get_qdrant_client() -> qdrant_client.QdrantClient:
    settings = get_settings()
    return qdrant_client.QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)


def _get_knowledge_dir() -> Path:
    """Resolve the knowledge-base directory (env override, else the built-in default)."""
    settings = get_settings()
    return Path(settings.knowledge_dir) if settings.knowledge_dir else DEFAULT_KNOWLEDGE_DIR


def _load_and_split_documents() -> List[Document]:
    """Load the local markdown knowledge base and split it into retrievable chunks.

    No network access of any kind — purely reads `.md` files already present
    on disk under the knowledge directory.
    """
    settings = get_settings()
    knowledge_dir = _get_knowledge_dir()

    if not knowledge_dir.is_dir():
        raise FileNotFoundError(
            f"Knowledge base directory not found at '{knowledge_dir}'. "
            "Add your .md files there (or set KNOWLEDGE_DIR in .env) before starting the server."
        )

    logger.info("Loading local knowledge base from '%s'...", knowledge_dir)
    loader = DirectoryLoader(str(knowledge_dir), glob="**/*.md", loader_cls=TextLoader)
    raw_docs = loader.load()

    if not raw_docs:
        raise FileNotFoundError(
            f"No .md files found under '{knowledge_dir}'. "
            "Add at least one markdown file to the knowledge base before starting the server."
        )

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size, chunk_overlap=settings.chunk_overlap
    )
    chunks = splitter.split_documents(raw_docs)
    logger.info("Loaded %d markdown file(s), split into %d chunks.", len(raw_docs), len(chunks))
    return chunks


def _collection_is_populated(client: qdrant_client.QdrantClient, name: str) -> bool:
    if not client.collection_exists(name):
        return False
    info = client.get_collection(name)
    return (info.points_count or 0) > 0


def build_vector_store() -> QdrantVectorStore:
    """Connect to the persistent Qdrant collection, ingesting only if needed."""
    settings = get_settings()
    client = get_qdrant_client()
    embeddings = get_embeddings()

    if _collection_is_populated(client, settings.qdrant_collection_name):
        logger.info(
            "Reusing existing Qdrant collection '%s' (already populated).",
            settings.qdrant_collection_name,
        )
        return QdrantVectorStore(
            client=client,
            collection_name=settings.qdrant_collection_name,
            embedding=embeddings,
        )

    logger.info(
        "Qdrant collection '%s' not found or empty — ingesting local knowledge base.",
        settings.qdrant_collection_name,
    )
    if client.collection_exists(settings.qdrant_collection_name):
        client.delete_collection(settings.qdrant_collection_name)

    client.create_collection(
        collection_name=settings.qdrant_collection_name,
        vectors_config=VectorParams(size=settings.embedding_dimension, distance=Distance.COSINE),
    )

    chunks = _load_and_split_documents()
    vectorstore = QdrantVectorStore.from_documents(
        chunks,
        embeddings,
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
        collection_name=settings.qdrant_collection_name,
    )
    logger.info("Qdrant knowledge base populated successfully.")
    return vectorstore


def build_retriever():
    """Build the retriever the search tool will use (top-k similarity search)."""
    settings = get_settings()
    vectorstore = build_vector_store()
    return vectorstore.as_retriever(search_kwargs={"k": settings.retriever_top_k})
