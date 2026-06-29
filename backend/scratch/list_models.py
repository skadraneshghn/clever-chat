import asyncio
import httpx

async def main():
    api_key = "cag_1f4dd741f5afe9aa6df9117f1a15bfd6980dc9a00301fb6c"
    base_url = "https://clevers.ir/v1/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    async with httpx.AsyncClient() as client:
        res = await client.get(base_url, headers=headers)
        if res.status_code == 200:
            models = res.json().get("data", [])
            for m in models:
                print(f"ID: {m['id']}")
        else:
            print("Failed:", res.status_code, res.text)

if __name__ == "__main__":
    asyncio.run(main())
