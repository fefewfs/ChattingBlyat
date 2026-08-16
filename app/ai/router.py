import asyncio
import logging
import time
from typing import List, Dict, Optional, Tuple

import aiohttp

from app.config import config
from app.ai.exceptions import ProviderError
from app.ai.openrouter import OpenRouterProvider
from app.ai.mistral import MistralProvider
from app.database import repository

logger = logging.getLogger(__name__)


def _get_providers() -> List[Tuple[str, object]]:
    providers = []
    if config.has_openrouter:
        providers.append(("openrouter", OpenRouterProvider(config.openrouter_api_key, config.openrouter_model)))
    if config.has_mistral:
        providers.append(("mistral", MistralProvider(config.mistral_api_key, config.mistral_model)))
    return providers


def _ordered_providers() -> List[Tuple[str, object]]:
    all_providers = _get_providers()
    if not all_providers:
        return []

    primary = config.primary_provider
    fallback = config.fallback_provider

    ordered = []
    for name, p in all_providers:
        if name == primary:
            ordered.insert(0, (name, p))
        elif name == fallback:
            ordered.append((name, p))
    return ordered if ordered else all_providers


async def chat(
    messages: List[Dict[str, str]],
    telegram_id: int,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    operation: str = "chat",
) -> Tuple[str, str]:
    """
    Call AI with fallback. Returns (response_text, provider_name).
    Raises RuntimeError if all providers fail.
    """
    providers = _ordered_providers()
    if not providers:
        raise RuntimeError("Не настроен ни один AI провайдер. Добавьте OPENROUTER_API_KEY или MISTRAL_API_KEY в .env")

    last_error = None
    async with aiohttp.ClientSession() as session:
        for name, provider in providers:
            start = time.monotonic()
            try:
                response = await provider.chat(
                    messages, temperature=temperature, max_tokens=max_tokens, session=session,
                )
                latency = int((time.monotonic() - start) * 1000)
                logger.info(
                    "AI call success | user=%d op=%s provider=%s model=%s latency=%dms",
                    telegram_id, operation, name, provider.model, latency,
                )
                return response, name
            except ProviderError as e:
                latency = int((time.monotonic() - start) * 1000)
                last_error = e
                logger.warning(
                    "AI call failed | user=%d op=%s provider=%s code=%d latency=%dms err=%s",
                    telegram_id, operation, name, e.code, latency, str(e)[:100],
                )
                await repository.log_ai_error(
                    telegram_id, name, provider.model, str(e), e.code, operation, latency,
                )
                continue
            except (asyncio.TimeoutError, aiohttp.ClientError) as e:
                latency = int((time.monotonic() - start) * 1000)
                last_error = e
                logger.warning(
                    "AI call network error | user=%d op=%s provider=%s latency=%dms err=%s",
                    telegram_id, operation, name, latency, str(e)[:100],
                )
                await repository.log_ai_error(
                    telegram_id, name, provider.model, str(e), None, operation, latency,
                )
                continue

    raise RuntimeError(f"Все AI провайдеры недоступны. Последняя ошибка: {last_error}")


async def health_check() -> Dict[str, str]:
    results = {}
    providers = _get_providers()
    if not providers:
        return {"openrouter": "NOT_CONFIGURED", "mistral": "NOT_CONFIGURED"}

    for name, provider in providers:
        try:
            ok = await asyncio.wait_for(provider.health_check(), timeout=10)
            results[name] = "OK" if ok else "ERROR"
        except Exception:
            results[name] = "ERROR"

    if "openrouter" not in results:
        results["openrouter"] = "NOT_CONFIGURED"
    if "mistral" not in results:
        results["mistral"] = "NOT_CONFIGURED"

    return results
