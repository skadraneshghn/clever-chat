import asyncio
import httpx
import json

async def main():
    api_key = "cag_1f4dd741f5afe9aa6df9117f1a15bfd6980dc9a00301fb6c"
    base_url = "https://clevers.ir/v1/chat/completions"
    model = "nvidia/nvidia/llama-3.1-nemotron-nano-vl-8b-v1"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "سلام عزیزم چطوری؟"}
        ],
        "stream": True,
        "temperature": 0.7,
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", base_url, json=payload, headers=headers) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        print("\n[DONE]")
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        print(f"RAW CHUNK: {repr(content)}")
                    except Exception as e:
                        print(f"Failed to parse line {repr(line)}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
