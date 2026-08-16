import logging
from typing import List, Dict, Optional

import aiohttp

from app.config import config
from app.ai.exceptions import ProviderError

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterProvider:
    name = "openrouter"

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        session: Optional[aiohttp.ClientSession] = None,
    ) -> str:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://apex-closer-telegram.bot",
            "X-Title": "APEX Chatter Trainer",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        own_session = session is None
        if own_session:
            session = aiohttp.ClientSession()

        try:
            async with session.post(OPENROUTER_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status == 429:
                    raise ProviderError("openrouter", 429, "OpenRouter: rate limit (429)")
                if resp.status == 401:
                    raise ProviderError("openrouter", 401, "OpenRouter: invalid API key (401)")
                if not resp.ok:
                    text = await resp.text()
                    raise ProviderError("openrouter", resp.status, f"OpenRouter HTTP {resp.status}: {text[:200]}")
                data = await resp.json()
                return data["choices"][0]["message"]["content"]
        finally:
            if own_session:
                await session.close()

    async def health_check(self) -> bool:
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://openrouter.ai/api/v1/key",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    return resp.ok
        except Exception:
            return False
