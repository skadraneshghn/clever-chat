import asyncio
import asyncpg

async def main():
    uri = "postgresql://urql3diwa5xgridpco0i:1ZarWu26xLVCaf2VEZri@bsh0xeaszdyp5ajtvenh-postgresql.services.clever-cloud.com:8246/bsh0xeaszdyp5ajtvenh"
    conn = await asyncpg.connect(uri)
    try:
        # Get latest conversations
        conversations = await conn.fetch("SELECT * FROM conversations ORDER BY created_at DESC LIMIT 5")
        for conv in conversations:
            print(f"=== Conversation: {conv['id']} | Title: {conv['title']} ===")
            messages = await conn.fetch("SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at", conv["id"])
            for m in messages:
                print(f"Role: {m['role']} | Created: {m['created_at']}")
                print(f"Content: {m['content']}")
                print("-" * 50)
            print("\n" + "=" * 80 + "\n")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
