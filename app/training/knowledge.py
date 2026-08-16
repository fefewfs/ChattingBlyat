import logging
from typing import Dict

from app.ai import router, prompts
from app.database import repository

logger = logging.getLogger(__name__)


async def analyze_dialogue(telegram_id: int, dialog: str) -> str:
    analysis_prompt = prompts.create_dialogue_analysis_prompt(dialog)
    result, _ = await router.chat(
        [{"role": "user", "content": analysis_prompt}],
        telegram_id,
        temperature=0.3,
        max_tokens=2048,
        operation="dialogue_analysis",
    )
    return result


async def search_scripts(telegram_id: int, query: str) -> str:
    knowledge_items = await repository.search_knowledge(query, limit=5)

    await repository.add_search_history(telegram_id, query, len(knowledge_items))

    if not knowledge_items:
        knowledge_context = "Релевантные материалы не найдены. Ответь на основе своих знаний."
    else:
        parts = []
        for item in knowledge_items:
            tags_str = ", ".join(item.tags) if item.tags else ""
            parts.append(f"---\nКатегория: {item.category}\nЗаголовок: {item.title}\nТеги: {tags_str}\nСодержание:\n{item.content}")
        knowledge_context = "\n\n".join(parts)

    search_prompt = prompts.create_script_search_prompt(query, knowledge_context)
    result, _ = await router.chat(
        [{"role": "user", "content": search_prompt}],
        telegram_id,
        temperature=0.5,
        max_tokens=1024,
        operation="script_search",
    )
    return result


async def handle_objection(telegram_id: int, objection: str) -> str:
    knowledge_items = await repository.search_knowledge(objection, limit=3)

    if knowledge_items:
        context = "\n\n".join(
            f"[{item.title}] {item.content}" for item in knowledge_items
        )
    else:
        context = "Нет специфических материалов. Используй общие знания."

    prompt = f"""Клиент выдвинул возражение: "{objection}"

Материалы из базы знаний:
{context}

Дай структурированный ответ:
1. Суть возражения (что за ним стоит)
2. Как ответить (конкретный скрипт)
3. Чего делать нельзя
4. Дополнительный вопрос для прояснения

Отвечай на русском. Будь конкретен."""

    result, _ = await router.chat(
        [{"role": "user", "content": prompt}],
        telegram_id,
        temperature=0.5,
        max_tokens=1024,
        operation="objection_handling",
    )
    return result
