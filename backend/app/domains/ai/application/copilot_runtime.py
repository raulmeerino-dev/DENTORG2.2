"""Prepare local inference without blocking app startup or sending clinic data."""

import logging

import httpx

from app.domains.ai.application.copilot_provider import ToolCallingProvider

logger = logging.getLogger(__name__)


async def preload_local_model(settings):
    if not settings.ollama_preload or ToolCallingProvider(settings).name != "ollama":
        return
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=3)) as client:
            response = await client.post(
                settings.ollama_base_url.rstrip("/") + "/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": [],
                    "stream": False,
                    "keep_alive": settings.ollama_keep_alive,
                    "options": {"num_ctx": settings.ollama_context_length},
                },
            )
            response.raise_for_status()
        logger.info("Local assistant model preloaded")
    except httpx.HTTPError:
        # AI is optional: an unavailable model must not prevent clinic startup.
        logger.warning("Local assistant preload unavailable; requests may retry loading")
