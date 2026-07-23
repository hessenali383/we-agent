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

    @tool("lookup_customer_by_phone")
    def lookup_customer_by_phone(phone: str) -> str:
        """Checks whether a customer with this phone number already has a saved
        profile (from a previous visit or ticket). Use this when a returning
        customer gives their phone number for a complaint/ticket, BEFORE asking
        them to repeat their name/age/city — if a profile is found, reuse it
        instead of re-collecting it."""
        try:
            profile = database.get_user_profile_by_phone(phone)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to look up customer by phone")
            return f"Database error: {exc}"

        if not profile:
            return "No existing profile found for this phone number. Ask for name, age, and city."
        return (
            f"Existing customer found: name={profile['name']}, age={profile['age']}, "
            f"city={profile['city']}. No need to ask for these again."
        )

    @tool("lookup_customer_tickets")
    def lookup_customer_tickets(phone: str) -> str:
        """Looks up this phone number's existing support tickets/complaints
        (most recent first), with their Ticket ID and status (Open, Pending,
        Resolved, etc). Use this when a customer follows up on a complaint
        they believe they already reported, BEFORE creating a new ticket —
        so you can show them what's on file and ask whether they want to
        continue with an existing ticket or open a new one."""
        try:
            tickets = mongo_service.get_tickets_by_phone(phone)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to look up tickets by phone")
            return f"MongoDB error: {exc}"

        if not tickets:
            return "No existing tickets found for this phone number. Proceed as a new complaint."

        lines = [
            f"- Ticket {t['ticket_id']} | {t['issue_type']} | status={t['status']} | "
            f"filed={t['created_at']} | \"{t['description']}\""
            for t in tickets
        ]
        return (
            f"Found {len(tickets)} existing ticket(s) for this phone number, newest first:\n"
            + "\n".join(lines)
            + "\n\nShow these to the customer and ask if they want an update on one of these "
            "existing tickets, or want to file a new complaint instead."
        )

    @tool("save_user_profile", args_schema=UserProfileSchema)
    def save_user_profile(name: str, phone: str, age: int, city: str) -> str:
        """Saves the customer's profile (name, phone, age, city) to the SQL database,
        linked by phone number. Only needed when the customer is filing a
        support ticket/complaint (via submit_support_ticket) — NOT required for
        general questions about plans, prices, or troubleshooting."""
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
            return f"Successfully saved profile for {name}. You may now submit their ticket."
        except Exception as exc:  # noqa: BLE001 - surfaced back to the agent, not swallowed
            logger.exception("Failed to save user profile")
            return f"Database error: {exc}"

    @tool("submit_support_ticket", args_schema=TicketSchema)
    def submit_support_ticket(phone: str, issue_type: str, description: str) -> str:
        """Saves a detailed customer support ticket or complaint to the MongoDB
        database, linked to the customer's phone number. The customer's profile
        (save_user_profile) MUST already be saved for this phone number before
        calling this, so the ticket stays linked to a known customer record."""
        try:
            if not database.get_user_profile_by_phone(phone):
                return (
                    "Error: No saved profile for this phone number yet. Call "
                    "save_user_profile first (collect name, age, city if not already "
                    "known), then retry submit_support_ticket."
                )
            ticket_id = mongo_service.insert_ticket(phone, issue_type, description)
            return f"Successfully submitted support ticket. Ticket ID: {ticket_id}"
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to submit support ticket")
            return f"MongoDB error: {exc}"

    return [
        search_we_knowledge_base,
        lookup_customer_by_phone,
        lookup_customer_tickets,
        save_user_profile,
        submit_support_ticket,
    ]
