import asyncio
import logging
import sys
import os

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from app.config import config
from app.database.database import close_session, check_db_connection
from app.bot.handlers.handlers import router
from app.bot.middlewares.middlewares import UserMiddleware, LoggingMiddleware

logging.basicConfig(
    level=getattr(logging, config.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("apex")


async def main():
    if not config.bot_token:
        logger.error("BOT_TOKEN не задан. Добавьте BOT_TOKEN в .env")
        sys.exit(1)

    if not config.has_any_provider:
        logger.warning("Ни один AI провайдер не настроен. Бот запустится, но AI функции не будут работать.")

    if not config.has_supabase:
        logger.error("Supabase URL и service role key не заданы. Добавьте VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env")
        sys.exit(1)

    db_ok = await check_db_connection()
    if not db_ok:
        logger.error("Не удалось подключиться к Supabase REST API. Проверьте VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.")
        sys.exit(1)
    logger.info("Supabase REST API connection: OK")

    bot = Bot(
        token=config.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())

    dp.message.middleware(UserMiddleware())
    dp.callback_query.middleware(UserMiddleware())
    dp.message.middleware(LoggingMiddleware())
    dp.callback_query.middleware(LoggingMiddleware())

    dp.include_router(router)

    logger.info("Starting APEX Chatter Trainer bot...")
    logger.info("Primary AI provider: %s", config.primary_provider or "none")
    logger.info("Fallback provider: %s", config.fallback_provider or "none")

    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await close_session()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot stopped.")
