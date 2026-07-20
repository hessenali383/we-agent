"""FastAPI application entrypoint for the WE Telecom AI Agent.

Startup flow (exactly once, in `lifespan`):
    Server Start
      -> If Qdrant collection exists -> Load it
      -> Else -> Load local markdown files -> Split -> Embed (MiniLM) -> Insert into Qdrant
      -> Create Retriever
      -> Create Agent
      -> Wait for incoming requests

After startup, every request reuses the same initialized agent — nothing is
rebuilt per-request.
"""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import database, mongo_service
from .agent import get_agent_bundle
from .config import get_settings
from .language import LANGUAGE_NAMES, detect_language, language_directive
from .logging_config import setup_logging
from .schemas import ChatRequest, HealthResponse, ResetRequest
from .workflow_trace import RAG_CONTEXT_NODE, TOOL_NODE_GROUPS, label_for

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Server starting up...")

    database.init_db()
    mongo_service.get_mongo_client()  # fail fast if Mongo is unreachable

    bundle = get_agent_bundle()
    bundle.build()

    logger.info("Startup complete — agent is ready to serve requests.")
    yield
    logger.info("Server shutting down.")


settings = get_settings()

app = FastAPI(
    title="WE Telecom AI Agent API",
    description="Production backend for the WE Telecom customer-service AI agent.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sse(event: str, payload: Any) -> str:
    """Format a single Server-Sent-Events frame. `payload` may be a string or any JSON-serializable value."""
    return f"event: {event}\ndata: {json.dumps({'data': payload})}\n\n"


def _node_sse(
    node: str,
    status: str,
    duration_ms: Optional[float] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """Format a `node_update` SSE frame for the workflow visualization.

    `duration_ms` (when present) is a real, measured wall-clock duration for
    that node's activation-to-completion span in THIS run — not a fixed or
    invented number. `metadata` carries short input/output summaries pulled
    directly from the real LangChain tool-call event data, for the
    frontend's per-node debugger panel.
    """
    payload: Dict[str, Any] = {"node": node, "status": status, "label": label_for(node, status)}
    if duration_ms is not None:
        payload["duration_ms"] = round(duration_ms, 1)
    if metadata:
        payload["metadata"] = metadata
    return _sse("node_update", payload)


def _summarize(value: Any, limit: int = 220) -> str:
    """Collapse a tool-call input/output value into a short, display-safe string."""
    if value is None:
        return ""
    content = getattr(value, "content", None)
    if content is not None:
        value = content
    if isinstance(value, dict):
        text = ", ".join(f"{k}={v!r}" for k, v in value.items())
    else:
        text = str(value)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _extract_text(content: Any) -> str:
    """Normalize a chat-model content chunk into plain text.

    Google GenAI sometimes streams `content` as a list of dicts instead of a
    plain string (noted in the original notebook's chat loop) — handle both.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and "text" in item:
                parts.append(item["text"])
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts)
    return ""


async def _stream_agent_response(user_input: str, session_id: str) -> AsyncGenerator[str, None]:
    """Stream the agent's reply as SSE frames.

    Emits the original event set (`token`, `tool_start`, `tool_end`, `done`,
    `error`) unchanged, plus additional event types that don't affect agent
    behavior at all — they only let the frontend animate and inspect the
    execution-trace visualization in sync with what's actually happening:

      - `trace_reset`: sent once at the start of a turn, tells the frontend
        to reset all pipeline nodes to idle before the new run begins.
      - `node_update`: `{"node", "status", "label", "duration_ms"?, "metadata"?}`.
        `duration_ms` and `metadata.input_summary`/`output_summary` are real
        values measured/extracted from this run, not invented.
      - `language_info`: sent once near the end of a turn, summarizing the
        detected language, whether the retrieval query needed translation,
        and total execution time for the turn.
    """
    bundle = get_agent_bundle()
    if not bundle.is_ready:
        yield _sse("error", "Agent is not ready yet. Please try again shortly.")
        return

    detected_lang = detect_language(user_input)
    directive = language_directive(detected_lang)
    lang_name = LANGUAGE_NAMES.get(detected_lang, "English")

    config = {"configurable": {"session_id": session_id}}
    turn_start = time.perf_counter()
    last_active_node = "user"
    response_node_active = False
    retrieval_used = False
    node_start: Dict[str, float] = {}

    def start(node: str) -> None:
        node_start[node] = time.perf_counter()

    def finish(node: str, status: str = "done", metadata: Optional[Dict[str, Any]] = None) -> str:
        started = node_start.get(node, time.perf_counter())
        duration_ms = (time.perf_counter() - started) * 1000.0
        return _node_sse(node, status, duration_ms=duration_ms, metadata=metadata)

    try:
        # Reset the visualization for this turn.
        yield _sse("trace_reset", "")

        # --- Synthetic pre-agent stages ---
        # These stages are real (request received, language classified,
        # prompt assembled, chat history loaded) but happen inside a single
        # Python call before the agent's first LangChain event fires, so
        # there's no discrete event to hook into. A short, deliberate pause
        # per stage (well under half a second total) makes the trace
        # readable instead of an instant jump. Every OTHER node below
        # (retriever, qdrant, embedding, sql, mongo, llm, response) reports
        # a genuinely measured duration from real event timestamps.
        start("user")
        yield _node_sse("user", "active")
        await asyncio.sleep(0.08)
        yield finish("user")

        start("language")
        yield _node_sse("language", "active")
        last_active_node = "language"
        await asyncio.sleep(0.05)
        yield finish(
            "language",
            metadata={"detected_language": lang_name, "response_language": lang_name},
        )

        start("prompt")
        yield _node_sse("prompt", "active")
        last_active_node = "prompt"
        await asyncio.sleep(0.08)
        yield finish("prompt")

        start("memory")
        yield _node_sse("memory", "active")
        last_active_node = "memory"
        await asyncio.sleep(0.08)
        yield finish("memory")

        async for event in bundle.agent_with_chat_history.astream_events(
            {"input": user_input, "language_directive": directive},
            config=config,
            version="v2",
        ):
            kind = event.get("event")

            if kind == "on_chat_model_start":
                start("llm")
                yield _node_sse("llm", "active")
                last_active_node = "llm"

            elif kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                text = _extract_text(getattr(chunk, "content", ""))
                if text:
                    if not response_node_active:
                        response_node_active = True
                        start("response")
                        yield _node_sse("response", "active")
                    last_active_node = "response"
                    yield _sse("token", text)

            elif kind == "on_chat_model_end":
                if response_node_active:
                    yield finish("response")
                    response_node_active = False
                yield finish("llm")

            elif kind == "on_tool_start":
                name = event.get("name", "")
                yield _sse("tool_start", name)
                input_summary = _summarize(event.get("data", {}).get("input"))
                meta = {"input_summary": input_summary} if input_summary else None

                if name == "search_we_knowledge_base":
                    retrieval_used = True

                for node in TOOL_NODE_GROUPS.get(name, ()):
                    start(node)
                    yield _node_sse(node, "active", metadata=meta)
                    last_active_node = node

            elif kind == "on_tool_end":
                name = event.get("name", "")
                yield _sse("tool_end", name)
                output_summary = _summarize(event.get("data", {}).get("output"))
                meta = {"output_summary": output_summary} if output_summary else None

                for node in TOOL_NODE_GROUPS.get(name, ()):
                    yield finish(node, metadata=meta)

                if name == "search_we_knowledge_base":
                    start(RAG_CONTEXT_NODE)
                    yield _node_sse(RAG_CONTEXT_NODE, "active")
                    last_active_node = RAG_CONTEXT_NODE
                    await asyncio.sleep(0.04)
                    yield finish(RAG_CONTEXT_NODE, metadata=meta)

        start("assistant")
        yield _node_sse("assistant", "active")
        last_active_node = "assistant"
        await asyncio.sleep(0.05)
        yield finish("assistant")

        elapsed_ms = (time.perf_counter() - turn_start) * 1000.0
        logger.info("Chat response completed in %.2fs (session=%s)", elapsed_ms / 1000, session_id)

        yield _sse(
            "language_info",
            {
                "detected_language": lang_name,
                "response_language": lang_name,
                "retrieval_query_language": "English" if retrieval_used else None,
                "translation_required": bool(retrieval_used and detected_lang == "ar"),
                "execution_time_ms": round(elapsed_ms, 1),
            },
        )
        yield _sse("done", "")

    except Exception:
        logger.exception("Error while streaming agent response (session=%s)", session_id)
        yield finish(last_active_node, status="error")
        yield _sse("error", "Something went wrong while generating a response. Please try again.")


@app.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """Stream the agent's reply to a user message via Server-Sent Events."""
    logger.info("Incoming request (session=%s)", request.session_id)
    return StreamingResponse(
        _stream_agent_response(request.message, request.session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/reset")
async def reset(request: ResetRequest) -> dict:
    """Clear the stored chat history for a given session."""
    try:
        mongo_service.clear_session_history(request.session_id)
        return {"status": "ok", "message": "Session history cleared."}
    except Exception as exc:
        logger.exception("Failed to reset session %s", request.session_id)
        raise HTTPException(status_code=500, detail="Failed to reset session history.") from exc


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    bundle = get_agent_bundle()
    return HealthResponse(status="ok", agent_ready=bundle.is_ready)


# Serve the frontend as static files too, so `uvicorn app:app` alone is enough
# to try the whole thing at http://localhost:8000/ (the API endpoints above
# still take priority over the catch-all static mount).
_frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if _frontend_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
