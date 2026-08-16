import logging
from typing import List, Dict, Optional

import aiohttp

from app.ai.exceptions import ProviderError

logger = logging.getLogger(__name__)

MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"


class MistralProvider:
    name = "mistral"

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
            async with session.post(MISTRAL_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status == 429:
                    raise ProviderError("mistral", 429, "Mistral: rate limit (429)")
                if resp.status == 401:
                    raise ProviderError("mistral", 401, "Mistral: invalid API key (401)")
                if not resp.ok:
                    text = await resp.text()
                    raise ProviderError("mistral", resp.status, f"Mistral HTTP {resp.status}: {text[:200]}")
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
                    "https://api.mistral.ai/v1/models",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    return resp.ok
        except Exception:
            return False
