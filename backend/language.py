"""Lightweight bilingual (English/Arabic) support helpers.

Two small, real pieces of behavior live here:

1. `detect_language` — a dependency-free Unicode-range heuristic that
   classifies the customer's latest message as Arabic or English. This is
   intentionally simple rather than pulling in a new ML dependency: the
   agent only needs to distinguish these two scripts.

2. `translate_to_english` — reuses the SAME already-initialized Gemini LLM
   instance the agent uses everywhere else (no separate translation
   service, no new API key) to translate a query to English when needed.

Both are consumed by:
- `agent.py`, to build a per-turn "reply in this language" instruction.
- `tools.py`, so `search_we_knowledge_base` can translate an Arabic query
  into English before it's embedded and searched (the local knowledge base
  is written in English).
"""
import logging
import re

logger = logging.getLogger(__name__)

# Unicode blocks covering Arabic script (Arabic, Arabic Supplement, Arabic
# Extended-A, Arabic Presentation Forms A/B).
_ARABIC_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")

LANGUAGE_NAMES = {"ar": "Arabic", "en": "English"}


def detect_language(text: str) -> str:
    """Classify `text` as 'ar' or 'en' based on script composition.

    Counts Arabic-script characters against total alphabetic characters;
    defaults to English for empty input or text with no letters at all
    (e.g. a lone phone number).
    """
    stripped = (text or "").strip()
    if not stripped:
        return "en"

    arabic_chars = len(_ARABIC_RE.findall(stripped))
    letter_chars = sum(1 for ch in stripped if ch.isalpha())
    if letter_chars == 0:
        return "en"

    return "ar" if (arabic_chars / letter_chars) > 0.3 else "en"


def language_directive(lang: str) -> str:
    """Build the per-turn instruction that tells the agent which language to reply in."""
    name = LANGUAGE_NAMES.get(lang, "English")
    return (
        f"IMPORTANT: The customer's latest message is in {name}. Write your entire "
        f"reply in {name}, regardless of what language earlier turns used."
    )


def translate_to_english(llm, text: str) -> str:
    """Translate `text` to English using the agent's own Gemini LLM instance.

    Used only by the knowledge-base search tool, and only when the query is
    in Arabic — the local knowledge base under `backend/data/knowledge/` is
    written in English, so retrieval quality is best against English
    queries. Falls back to the original text if translation fails for any
    reason (never breaks the tool call).
    """
    try:
        result = llm.invoke(
            "Translate the following text to English. Reply with ONLY the "
            f"translation, no notes or quotation marks:\n\n{text}"
        )
        translated = (getattr(result, "content", "") or "").strip()
        return translated or text
    except Exception:
        logger.exception("Query translation failed; falling back to the original text.")
        return text
