"""Pydantic schemas: LangChain tool argument schemas and API request/response models."""
from pydantic import BaseModel, Field


class UserProfileSchema(BaseModel):
    """Schema the LLM must fill in before calling `save_user_profile`."""

    name: str = Field(description="The full name of the user")
    phone: str = Field(
        description="The user's 11-digit Egyptian phone number starting with 010, 011, 012, or 015"
    )
    age: int = Field(description="The user's age as an integer")
    city: str = Field(description="The city where the user lives")


class TicketSchema(BaseModel):
    """Schema the LLM must fill in before calling `submit_support_ticket`."""

    phone: str = Field(description="The user's phone number")
    issue_type: str = Field(
        description="Category of the issue (e.g., Billing, Technical, Plan Inquiry)"
    )
    description: str = Field(description="Detailed description of the user's issue or complaint")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="The user's chat message")
    session_id: str = Field(..., min_length=1, description="Unique identifier for the chat session")


class ResetRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="The session whose history should be cleared")


class HealthResponse(BaseModel):
    status: str
    agent_ready: bool
