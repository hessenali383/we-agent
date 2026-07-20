"""Agent assembly: LLM + tools + prompt -> AgentExecutor wrapped with MongoDB chat history.

The agent is built exactly once, at server startup (see `app.py`'s lifespan
handler), and reused for every incoming request via `AgentBundle`.
"""
import logging
from typing import Optional

from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_google_genai import ChatGoogleGenerativeAI

from . import mongo_service
from .config import get_settings
from .prompts import SYSTEM_PROMPT
from .tools import build_tools
from .vectorstore import build_retriever

logger = logging.getLogger(__name__)


class AgentBundle:
    """Holds the singleton agent (and its chat-history wrapper) for the app's lifetime."""

    def __init__(self) -> None:
        self.agent_with_chat_history: Optional[RunnableWithMessageHistory] = None

    def build(self) -> None:
        """Run the full startup pipeline: retriever -> LLM -> tools -> agent."""
        settings = get_settings()

        logger.info("Step 1/4 — Loading embeddings and Qdrant collection, building retriever...")
        retriever = build_retriever()

        logger.info("Step 2/4 — Initializing LLM (%s)...", settings.llm_model_name)
        llm = ChatGoogleGenerativeAI(
            model=settings.llm_model_name,
            temperature=settings.llm_temperature,
        )

        logger.info("Step 3/4 — Assembling agent tools...")
        # The LLM is passed in because search_we_knowledge_base reuses it to
        # translate Arabic queries to English before searching (see tools.py).
        tools = build_tools(retriever, llm)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                ("system", "{language_directive}"),
                MessagesPlaceholder(variable_name="chat_history"),
                ("user", "{input}"),
                MessagesPlaceholder(variable_name="agent_scratchpad"),
            ]
        )

        agent = create_tool_calling_agent(llm, tools, prompt)
        agent_executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=False,
            handle_parsing_errors=True,
        )

        logger.info("Step 4/4 — Wrapping agent with MongoDB-backed chat history...")
        self.agent_with_chat_history = RunnableWithMessageHistory(
            agent_executor,
            mongo_service.get_message_history,
            input_messages_key="input",
            history_messages_key="chat_history",
        )
        logger.info("Agent initialized and ready to serve requests.")

    @property
    def is_ready(self) -> bool:
        return self.agent_with_chat_history is not None


# Process-wide singleton — built once during the FastAPI lifespan startup hook.
_bundle = AgentBundle()


def get_agent_bundle() -> AgentBundle:
    return _bundle
