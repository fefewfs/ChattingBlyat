import logging
import time
from typing import Any, Callable, Awaitable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Update, Message, CallbackQuery

from app.database import repository

logger = logging.getLogger(__name__)


class UserMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        if user:
            is_admin = user.id in _get_admin_ids()
            await repository.create_or_update_user(
                telegram_id=user.id,
                username=user.username,
                first_name=user.first_name,
                last_name=user.last_name,
                is_admin=is_admin,
            )
        return await handler(event, data)


class LoggingMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        start = time.monotonic()
        user = data.get("event_from_user")
        uid = user.id if user else "?"
        update: Update = data.get("event_update")
        op = _describe_update(update)
        try:
            result = await handler(event, data)
            latency = int((time.monotonic() - start) * 1000)
            logger.info("handled | user=%s op=%s latency=%dms", uid, op, latency)
            return result
        except Exception as e:
            latency = int((time.monotonic() - start) * 1000)
            logger.error("error | user=%s op=%s latency=%dms err=%s", uid, op, latency, str(e)[:200], exc_info=True)
            raise


def _get_admin_ids():
    from app.config import config
    return set(config.admin_ids)


def _describe_update(update: Update) -> str:
    if update.message:
        if update.message.text:
            return f"msg:{update.message.text[:30]}"
        if update.message.document:
            return "msg:document"
        return "msg:other"
    if update.callback_query:
        return f"cb:{update.callback_query.data[:40]}"
    return "unknown"
