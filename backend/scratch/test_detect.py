from app.services.discovery import _detect_capabilities

test_models = [
    "nvidia/nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    "deepseek-r1",
    "deepseek-r1-distill-llama-8b-think",
    "nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "nvidia/nvidia/nemotron-4-340b-instruct",
    "gpt-4o",
    "gpt-4o-mini",
    "o1-preview",
    "o3-mini",
    "qwq-32b-preview"
]

for m in test_models:
    caps = _detect_capabilities(m)
    print(f"Model: {m:<50} | Vision: {caps['vision']:<5} | Reasoning: {caps['reasoning']:<5}")
