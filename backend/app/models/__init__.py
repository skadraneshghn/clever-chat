"""Database models package — import all models for metadata registration."""

from app.models.conversation import Conversation
from app.models.conversation_share import ConversationShare
from app.models.discovered_model import DiscoveredModel
from app.models.embeddings import DocumentChunk, MessageEmbedding
from app.models.media_asset import MediaAsset
from app.models.message import Message
from app.models.provider_connection import ProviderConnection
from app.models.session import Session
from app.models.user import User
from app.models.user_preferences import UserPreferences

__all__ = [
    "User",
    "Session",
    "Conversation",
    "ConversationShare",
    "Message",
    "UserPreferences",
    "MediaAsset",
    "MessageEmbedding",
    "DocumentChunk",
    "ProviderConnection",
    "DiscoveredModel",
]
