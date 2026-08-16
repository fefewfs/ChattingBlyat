from aiogram.types import (
    InlineKeyboardMarkup, InlineKeyboardButton,
    ReplyKeyboardMarkup, KeyboardButton,
)
from app.ai.prompts import TRAINING_MODE_PROMPTS


def main_menu_kb() -> ReplyKeyboardMarkup:
    kb = [
        [KeyboardButton(text="🎯 Тренировка"), KeyboardButton(text="🥊 Симулятор")],
        [KeyboardButton(text="🔍 Найти скрипт"), KeyboardButton(text="🧠 Разбор диалога")],
        [KeyboardButton(text="💬 Возражения"), KeyboardButton(text="📚 База знаний")],
        [KeyboardButton(text="📊 Моя статистика"), KeyboardButton(text="⚙️ Настройки")],
    ]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)


def training_modes_kb() -> InlineKeyboardMarkup:
    kb = []
    for key, cfg in TRAINING_MODE_PROMPTS.items():
        kb.append([InlineKeyboardButton(text=cfg["label"], callback_data=f"train:{key}")])

    kb.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="back:menu")])
    return InlineKeyboardMarkup(inline_keyboard=kb)


def cancel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="❌ Отмена", callback_data="cancel")],
    ])


def finish_training_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Завершить и оценить", callback_data="finish_training"),
            InlineKeyboardButton(text="❌ Отмена", callback_data="cancel"),
        ],
    ])


def admin_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👥 Пользователи", callback_data="admin:users")],
        [InlineKeyboardButton(text="📊 Общая статистика", callback_data="admin:stats")],
        [InlineKeyboardButton(text="📋 Логи ошибок AI", callback_data="admin:errors")],
        [InlineKeyboardButton(text="💊 Проверка API", callback_data="admin:health")],
        [InlineKeyboardButton(text="➕ Добавить знание", callback_data="admin:add_knowledge")],
        [InlineKeyboardButton(text="🗑 Удалить знание", callback_data="admin:del_knowledge")],
        [InlineKeyboardButton(text="📢 Рассылка", callback_data="admin:broadcast")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="back:menu")],
    ])


def knowledge_categories_kb() -> InlineKeyboardMarkup:
    categories = ["Scripts", "Objections", "Dialogues", "Examples", "Training", "Psychology", "Sales", "Mistakes", "Templates"]
    kb = []
    row = []
    for cat in categories:
        row.append(InlineKeyboardButton(text=cat, callback_data=f"know_cat:{cat}"))
        if len(row) == 3:
            kb.append(row)
            row = []
    if row:
        kb.append(row)
    kb.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="back:menu")])
    return InlineKeyboardMarkup(inline_keyboard=kb)


def settings_kb() -> InlineKeyboardMarkup:
    from app.config import config
    provider = config.primary_provider or "не настроен"
    fallback = config.fallback_provider or "нет"

    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"Провайдер: {provider}", callback_data="noop")],
        [InlineKeyboardButton(text=f"Fallback: {fallback}", callback_data="noop")],
        [InlineKeyboardButton(text=f"OpenRouter: {'✅' if config.has_openrouter else '❌'}", callback_data="noop")],
        [InlineKeyboardButton(text=f"Mistral: {'✅' if config.has_mistral else '❌'}", callback_data="noop")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="back:menu")],
    ])
