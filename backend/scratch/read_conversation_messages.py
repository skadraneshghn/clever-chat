import asyncio
from dotenv import load_dotenv
load_dotenv()

from app.core.config import get_settings
settings = get_settings()
print("RESOLVED DATABASE_URL:", settings.DATABASE_URL)

from app.core.database import init_db, get_db_context
from app.models.conversation import Conversation
from app.models.message import Message
from sqlalchemy import select, desc

async def main():
    await init_db()
    async with get_db_context() as db:
        conv_res = await db.execute(
            select(Conversation).order_by(desc(Conversation.created_at)).limit(1)
        )
        conv = conv_res.scalar_one_or_none()
        if not conv:
            print("No conversations found!")
            return
        print(f"Conversation: {conv.id} - Title: {conv.title} - Model: {conv.model_id}")

if __name__ == "__main__":
    asyncio.run(main())
