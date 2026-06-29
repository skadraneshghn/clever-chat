import asyncio
import os

os.environ["DATABASE_URL"] = "postgresql+asyncpg://urql3diwa5xgridpco0i:1ZarWu26xLVCaf2VEZri@bsh0xeaszdyp5ajtvenh-postgresql.services.clever-cloud.com:8246/bsh0xeaszdyp5ajtvenh"

from app.core.database import init_db, get_db_context
from app.models.conversation import Conversation
from app.models.message import Message
from sqlalchemy import select, desc

async def main():
    await init_db()
    async with get_db_context() as db:
        # Get the latest conversation
        conv_res = await db.execute(
            select(Conversation).order_by(desc(Conversation.created_at)).limit(1)
        )
        conv = conv_res.scalar_one_or_none()
        if not conv:
            print("No conversations found!")
            return
        
        print(f"Conversation: {conv.id} - Title: {conv.title} - Model: {conv.model_id}")
        
        # Get messages
        msg_res = await db.execute(
            select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at)
        )
        messages = msg_res.scalars().all()
        for m in messages:
            print(f"[{m.role}] ID: {m.id} | Parent: {m.parent_message_id} | Sender: {m.sender_id} | Hidden: {m.hidden_from_owner}")
            print(f"Content: {m.content}")
            print("-" * 40)

if __name__ == "__main__":
    asyncio.run(main())
