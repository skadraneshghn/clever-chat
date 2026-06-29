import asyncio
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

async def main():
    api_key = "cag_1f4dd741f5afe9aa6df9117f1a15bfd6980dc9a00301fb6c"
    base_url = "https://clevers.ir/v1"
    model = "nvidia/nvidia/llama-3.1-nemotron-nano-vl-8b-v1"

    # Mimic reasoning model config: temperature=1.0, reasoning_effort="medium"
    llm = ChatOpenAI(
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=1.0,
        streaming=True,
        model_kwargs={
            "reasoning_effort": "medium"
        }
    )
    
    sys_content = (
        "You are CleverChat, a helpful, harmless, and honest AI assistant. "
        "Be concise, accurate, and friendly. Use markdown formatting when appropriate.\n\n"
        "[System Language Constraint]: The user's prompt language is detected as Persian. "
        "You MUST write your entire response in Persian."
    )
    
    msgs = [
        SystemMessage(content=sys_content),
        HumanMessage(content="سلام عزیزم چطوری؟")
    ]
    
    try:
        response_text = ""
        async for chunk in llm.astream(msgs):
            response_text += chunk.content
            print(chunk.content, end="", flush=True)
        print(f"\nResponse: {repr(response_text)}")
    except Exception as e:
        print("\nFailed:", e)

if __name__ == "__main__":
    asyncio.run(main())
