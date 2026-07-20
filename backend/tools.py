"""LangChain tool definitions for the WE Telecom agent.

Business logic (validation rules, error strings the LLM sees, DB writes) is
preserved exactly from the notebook — only the plumbing around it changed.

`search_we_knowledge_base` is a custom tool (rather than the previous
`create_retriever_tool` auto-generated one) so it can translate an Arabic
query into English before embedding/searching — the local knowledge base in
`backend/data/knowledge/` is written in English. Translation reuses the same
Gemini LLM instance the agent already has; no new dependency or API key.
"""
import logging

from langchain_core.tools import tool

from . import database, mongo_service
from .language import detect_language, translate_to_english
from .schemas import TicketSchema, UserProfileSchema

logger = logging.getLogger(__name__)


def build_tools(retriever, llm) -> list:
    """Assemble the three tools the agent can call, bound to a given retriever and LLM."""

    @tool("search_we_knowledge_base")
    def search_we_knowledge_base(query: str) -> str:
        """Search for information about WE Telecom internet plans, router configuration,
        troubleshooting, and billing."""
        search_query = query
        if detect_language(query) == "ar":
            search_query = translate_to_english(llm, query)
            logger.info("Translated retrieval query from Arabic: %r -> %r", query, search_query)

        docs = retriever.invoke(search_query)
        if not docs:
            return "No relevant documents found in the knowledge base."
        return "\n\n".join(doc.page_content for doc in docs)

    @tool("save_user_profile", args_schema=UserProfileSchema)
    def save_user_profile(name: str, phone: str, age: int, city: str) -> str:
        """Saves the user's demographic profile to the SQL database. MUST be used before helping them."""
        # Hard-coded Python validation acts as a guardrail against LLM hallucinations.
        if len(phone) != 11 or not phone.startswith(("010", "011", "012", "015")):
            return (
                "Error: Phone number must be exactly 11 digits and start with "
                "010, 011, 012, or 015. Please ask the user to correct it."
            )
        if age < 10 or age > 120:
            return "Error: Please provide a valid age. Ask the user to correct it."

        try:
            database.insert_user_profile(name, phone, age, city)
            return f"Successfully saved user profile for {name}. You may now proceed to help them."
        except Exception as exc:  # noqa: BLE001 - surfaced back to the agent, not swallowed
            logger.exception("Failed to save user profile")
            return f"Database error: {exc}"

    @tool("submit_support_ticket", args_schema=TicketSchema)
    def submit_support_ticket(phone: str, issue_type: str, description: str) -> str:
        """Saves a detailed customer support ticket or complaint to the MongoDB database."""
        try:
            ticket_id = mongo_service.insert_ticket(phone, issue_type, description)
            return f"Successfully submitted support ticket. Ticket ID: {ticket_id}"
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to submit support ticket")
            return f"MongoDB error: {exc}"

    return [search_we_knowledge_base, save_user_profile, submit_support_ticket]
