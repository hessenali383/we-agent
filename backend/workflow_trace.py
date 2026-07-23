"""Maps LangChain execution events to conceptual "workflow node" updates.

This module does NOT change agent behavior in any way — it purely observes
the same event stream `app.py` already consumes (via `astream_events`) and
translates it into `node_update` SSE frames that the frontend uses to
animate the execution-trace visualization.

To add a new pipeline stage later: add its id to `PIPELINE_ORDER`, give it
entries in `STATUS_LABELS`, and (if it corresponds to a tool call) add it to
`TOOL_NODE_GROUPS`. No other backend code needs to change — the frontend's
`workflow.js` picks up new node ids automatically as long as it also gets a
matching entry in its own `NODES` list.
"""
from typing import Dict, Tuple

# Canonical node ids, in pipeline order (also mirrored in frontend/workflow.js).
# Every id here corresponds to a real, identifiable piece of the backend:
#   user       -> POST /chat receiving the request (app.py)
#   language   -> language.detect_language() (language.py)
#   prompt     -> ChatPromptTemplate assembly (agent.py)
#   memory     -> MongoDBChatMessageHistory via RunnableWithMessageHistory (mongo_service.py)
#   llm        -> ChatGoogleGenerativeAI / Gemini calls, both tool-deciding and final-answer (agent.py)
#   retriever  -> the search_we_knowledge_base tool call itself (tools.py)
#   embedding  -> HuggingFaceEmbeddings / MiniLM, used inside the retriever (vectorstore.py)
#   qdrant     -> QdrantVectorStore similarity search, used inside the retriever (vectorstore.py)
#   context    -> the retrieved chunks becoming tool-result context fed back to the LLM
#   sql        -> save_user_profile / lookup_customer_by_phone tools -> SQLite (database.py)
#   mongo      -> submit_support_ticket / lookup_customer_tickets tools -> MongoDB tickets collection (mongo_service.py)
#   response   -> the final, text-producing Gemini call (agent.py, same LLM as above)
#   assistant  -> the completed reply streamed back over SSE (app.py)
PIPELINE_ORDER: Tuple[str, ...] = (
    "user",
    "language",
    "prompt",
    "memory",
    "retriever",
    "qdrant",
    "embedding",
    "context",
    "llm",
    "sql",
    "mongo",
    "response",
    "assistant",
)

# Which conceptual nodes light up when a given LangChain tool runs.
TOOL_NODE_GROUPS: Dict[str, Tuple[str, ...]] = {
    "search_we_knowledge_base": ("retriever", "embedding", "qdrant"),
    "lookup_customer_by_phone": ("sql",),
    "lookup_customer_tickets": ("mongo",),
    "save_user_profile": ("sql",),
    "submit_support_ticket": ("mongo",),
}

# The node that represents "context assembled" right after a retrieval tool completes.
RAG_CONTEXT_NODE = "context"

STATUS_LABELS: Dict[str, Dict[str, str]] = {
    "user": {"active": "Message received", "done": "Message received"},
    "language": {"active": "Detecting language...", "done": "Language detected"},
    "prompt": {"active": "Processing prompt...", "done": "Prompt processed"},
    "memory": {"active": "Loading conversation memory...", "done": "Memory loaded"},
    "retriever": {"active": "Searching knowledge base...", "done": "Documents retrieved"},
    "embedding": {"active": "Embedding query (MiniLM)...", "done": "Query embedded"},
    "qdrant": {"active": "Querying Qdrant...", "done": "Vectors matched"},
    "context": {"active": "Assembling context...", "done": "Context ready"},
    "llm": {"active": "Thinking...", "done": "Reasoning complete"},
    "sql": {"active": "Running SQL query...", "done": "SQL query complete"},
    "mongo": {"active": "Querying MongoDB...", "done": "MongoDB query complete"},
    "response": {"active": "Generating response...", "done": "Response ready"},
    "assistant": {"active": "Delivering reply...", "done": "Completed"},
}


def label_for(node: str, status: str) -> str:
    """Return a human-readable status label for a node, falling back gracefully."""
    return STATUS_LABELS.get(node, {}).get(status, f"{node.title()} {status}")
