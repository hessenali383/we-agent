# WE Assistant — WE Telecom AI Agent

A production-ready customer-service AI agent for WE Telecom Egypt: a FastAPI
backend (LangChain + Gemini + Qdrant + MongoDB + SQLite) paired with a
frontend that visualizes the agent's real execution as a system-architecture
diagram alongside a floating chat widget.

The agent:
- Collects a customer profile (name, phone, age, city) before helping, with
  validation, and stores it in SQLite.
- Answers questions about internet plans, router setup, troubleshooting, and
  billing using Retrieval-Augmented Generation (RAG) over a Qdrant vector
  store built from a **local** markdown knowledge base (no downloads).
- Logs support tickets/complaints to MongoDB Atlas.
- Remembers the conversation per session via MongoDB-backed chat history.
- **Automatically detects Arabic vs. English** per message, translates the
  retrieval query to English when needed, and always replies in the language
  of the customer's latest message.
- Streams its replies token-by-token over Server-Sent Events (SSE), along
  with a live execution trace the frontend uses to animate the diagram.

---

## Project structure

```
project/
├── backend/
│   ├── app.py               # FastAPI app: /chat (SSE), /reset, /health, startup lifecycle
│   ├── agent.py              # Builds LLM + tools + prompt into a reusable AgentExecutor
│   ├── prompts.py             # System prompt (the strict customer-service protocol)
│   ├── config.py               # Typed Settings loaded from environment variables
│   ├── language.py              # EN/AR detection heuristic + LLM-based query translation
│   ├── tools.py                  # The 3 agent tools (search KB, save profile, submit ticket)
│   ├── vectorstore.py             # MiniLM embeddings + local-file Qdrant ingestion + retriever
│   ├── mongo_service.py            # MongoDB connection, tickets, chat history
│   ├── database.py                  # SQLite connection + user profile inserts
│   ├── schemas.py                    # Pydantic models (tool args + API request/response)
│   ├── workflow_trace.py              # Maps real LangChain events -> visualization node updates
│   ├── logging_config.py               # Structured logging setup
│   ├── data/knowledge/                  # Local markdown knowledge-base files (see below)
│   └── requirements.txt
├── frontend/
│   ├── index.html            # App shell: architecture diagram + debugger panel + chat widget
│   ├── style.css              # Custom CSS — light Linear/Notion/Vercel-inspired shell
│   ├── workflow.js             # Fixed, hardcoded system-architecture diagram + animation
│   ├── script.js                # SSE client, automatic EN/AR UI language, markdown rendering
│   └── icons/                     # NOT included — see "Node icons" below
├── .env.example
├── .gitignore
└── README.md
```

---

## 1. Installation

**Requirements:** Python 3.11+, Node not required (frontend is plain JS).

```bash
cd project
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

## 2. Knowledge base (local files, no downloads)

The retriever's knowledge base lives entirely under `backend/data/knowledge/`
as plain `.md` files. The backend **never** downloads anything — no Kaggle,
no ZIP extraction, no `urllib`. On startup:

```
Server Start
  -> If the Qdrant collection already exists -> load it directly
  -> Else -> load backend/data/knowledge/*.md -> split into chunks
          -> embed with MiniLM -> insert into Qdrant
  -> Build retriever -> Build agent -> Ready
```

A handful of starter articles (`internet-plans.md`, `router-setup.md`,
`troubleshooting.md`, `billing-faq.md`) are included so the pipeline works
out of the box — replace them with your real WE Telecom documentation.
Add/edit `.md` files, delete the Qdrant collection (or point
`QDRANT_COLLECTION_NAME` at a fresh name) to re-ingest.

## 3. Environment variables

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `GOOGLE_API_KEY` | Gemini API key (used by `ChatGoogleGenerativeAI`) — also powers query translation, no separate key needed |
| `QDRANT_API_KEY` / `QDRANT_URL` | Your Qdrant Cloud cluster credentials |
| `MONGO_URI` | MongoDB Atlas connection string (passwords with special characters are URL-encoded automatically) |
| `SQLITE_DB_PATH` | Path to the local SQLite file (default `we_telecom.db`) |
| `KNOWLEDGE_DIR` | Optional override for the knowledge-base folder; defaults to `backend/data/knowledge/` |
| `LLM_MODEL_NAME` / `LLM_TEMPERATURE` | Defaults to `gemini-2.5-flash` / `0.8` |
| `QDRANT_COLLECTION_NAME`, `EMBEDDING_MODEL_NAME`, `RETRIEVER_TOP_K`, `CHUNK_SIZE`, `CHUNK_OVERLAP` | RAG tuning knobs |
| `CORS_ORIGINS` | JSON array of allowed frontend origins |

**MongoDB Atlas network access:** whitelist your server's IP (or `0.0.0.0/0`
for development) in Atlas → Network Access.

## 4. Running the backend

Run from the **project root** (the backend uses relative imports):

```bash
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

Check readiness any time with `curl http://localhost:8000/health`.

## 5. Running the frontend

The backend serves the frontend as static files, so once uvicorn is running,
open `http://localhost:8000/`. Opening `frontend/index.html` directly also
works — it auto-detects `file://` and points API calls at
`http://localhost:8000`.

### Node icons

The architecture diagram references icons by filename only
(`frontend/icons/user.svg`, `language.svg`, `memory.svg`, `prompt.svg`,
`gemini.svg`, `retriever.svg`, `embedding.svg`, `qdrant.svg`, `context.svg`,
`sql.svg`, `mongodb.svg`, `response.svg`, `assistant.svg`) — **no icon files
are bundled**, by design. Until you drop real SVGs into `frontend/icons/`,
each node gracefully falls back to a colored initial-letter badge, so the UI
stays clean rather than showing broken images.

---

## 6. How the visualization maps to the real backend

`frontend/workflow.js` is a single, hardcoded diagram — it is **not**
generated dynamically. Every node corresponds to a specific, real piece of
the backend (see the comment block at the top of that file and of
`backend/workflow_trace.py` for the exact mapping). Briefly:

| Diagram node | Real backend source |
|---|---|
| User | `backend/app.py` — `POST /chat` |
| Language Detection | `backend/language.py` — `detect_language()` |
| Memory | `backend/mongo_service.py` — `MongoDBChatMessageHistory` |
| Prompt Assembly | `backend/agent.py` — `ChatPromptTemplate` |
| Gemini LLM | `backend/agent.py` — `ChatGoogleGenerativeAI` (tool-routing call) |
| Retriever | `backend/tools.py` — `search_we_knowledge_base` |
| MiniLM / Qdrant | `backend/vectorstore.py` — embeddings + similarity search (used inside the retriever tool) |
| RAG Context | the retriever tool's return value, fed back to the LLM |
| SQL Tool | `backend/tools.py` + `database.py` — `save_user_profile` → SQLite |
| Mongo Tool | `backend/tools.py` + `mongo_service.py` — `submit_support_ticket` → tickets collection |
| Response Generator | `backend/agent.py` — same Gemini instance, final text-producing call |
| Assistant | `backend/app.py` — completed reply streamed over SSE |

Only nodes that actually execute in a given turn light up (conditional
execution); the glowing particle travels along the real curved connectors
between them, and `duration_ms` shown per node is a genuine measured
wall-clock time for that step in that run (the four pre-agent stages — User,
Language, Memory, Prompt — have a small fixed pacing delay added since they
happen inside one Python call with no discrete LangChain event to hook into;
every other node's timing comes straight from real event timestamps).
Click any node to open the debugger panel with its status, execution time,
description, backend source, and (for tool nodes) real input/output
summaries pulled from the LangChain event data.

## 7. Automatic language handling

There is no manual language switch anywhere in the UI. Per message:

1. `backend/language.py` classifies the message as Arabic or English via a
   Unicode-script heuristic (no extra ML dependency).
2. If Arabic and the knowledge-base tool is used, the query is translated to
   English before embedding/search (the local KB is written in English) —
   reusing the same Gemini LLM instance, no separate translation API.
3. The agent is instructed, per turn, to reply in whatever language the
   latest message was in — so switching languages mid-conversation "just
   works."
4. The frontend's own UI text (buttons, labels, panels) automatically
   follows the detected language too, via the `language_info` SSE event —
   it's reactive, not a stored preference.

The workflow's "🌍 Language" panel shows the detected language, whether the
retrieval query needed translation, the response language, and execution
time for the turn.

## 8. API reference

| Endpoint | Method | Description |
|---|---|---|
| `/chat` | `POST` | Body: `{"message", "session_id"}`. Returns an SSE stream. |
| `/reset` | `POST` | Body: `{"session_id"}`. Clears that session's stored chat history. |
| `/health` | `GET` | Returns `{"status", "agent_ready"}`. |

### `/chat` SSE events

| Event | Payload | Notes |
|---|---|---|
| `token` | string | A chunk of the reply text |
| `tool_start` / `tool_end` | tool name | Unchanged from the original API |
| `trace_reset` | — | Sent once per turn; frontend resets the diagram to idle |
| `node_update` | `{node, status, label, duration_ms?, metadata?}` | `duration_ms` is a real measured value; `metadata.input_summary`/`output_summary` come straight from LangChain tool-call event data |
| `language_info` | `{detected_language, response_language, retrieval_query_language, translation_required, execution_time_ms}` | Sent once near the end of a turn |
| `done` / `error` | string | Unchanged from the original API |

---

## Troubleshooting

- **"No .md files found" on startup** — make sure `backend/data/knowledge/`
  has at least one `.md` file, or set `KNOWLEDGE_DIR` to a folder that does.
- **MongoDB connection timeout** — check `MONGO_URI` and Atlas Network
  Access IP whitelisting.
- **Qdrant `401 Unauthorized`** — double-check `QDRANT_URL`/`QDRANT_API_KEY`.
- **Diagram nodes show plain letter badges instead of icons** — expected
  until real SVGs are added under `frontend/icons/` (see above).
- **`ModuleNotFoundError` on startup** — install `backend/requirements.txt`
  in the same environment you run `uvicorn` from, and launch it as
  `backend.app:app` from the project root.
- **CORS errors in the browser console** — set `CORS_ORIGINS` in `.env` to
  the exact origin the frontend is served from.

## Deployment notes

- Keep `--workers 1` (or use a shared/external cache) since the agent is
  held in in-process memory per worker.
- SSE needs unbuffered, long-lived connections — disable reverse-proxy
  buffering for `/chat` (the app already sends `X-Accel-Buffering: no`).
- Persist `SQLITE_DB_PATH` on a durable volume in ephemeral deployments.
- Restrict `CORS_ORIGINS` to your real frontend domain(s) in production.
