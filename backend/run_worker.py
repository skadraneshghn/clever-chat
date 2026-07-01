import asyncio
from arq import run_worker
from app.worker import WorkerSettings

if __name__ == '__main__':
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    run_worker(WorkerSettings)
