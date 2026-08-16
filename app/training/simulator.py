import random
import logging
from typing import Optional, List, Dict

from app.ai import router, prompts
from app.database import repository
from app.database.models import TrainingSession, TrainingFeedback, SKILL_KEYS, SKILL_LABELS_RU, LEVELS

logger = logging.getLogger(__name__)


async def start_training(
    telegram_id: int, mode: str, skill_focus: str = None
) -> tuple[TrainingSession, str]:
    user = await repository.get_user(telegram_id)
    level = user.current_level if user else 1

    weak_skill = user.weak_skill if user else None
    if not skill_focus and weak_skill:
        skill_focus = SKILL_LABELS_RU.get(weak_skill, weak_skill)

    persona = random.choice(prompts.CLIENT_PERSONAS)
    system_prompt = prompts.create_training_system_prompt(mode, persona, skill_focus, level)

    session = await repository.create_training_session(telegram_id, mode, skill_focus, persona)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "Привет! Я хочу узнать про ваш продукт."},
    ]
    opening, _ = await router.chat(
        messages, telegram_id, temperature=0.8, max_tokens=256, operation="training_start"
    )

    await repository.add_training_message(session.id, telegram_id, "assistant", opening, 0)
    return session, opening


async def reply_in_training(
    telegram_id: int, session: TrainingSession, user_message: str
) -> str:
    messages_data = await repository.get_training_messages(session.id)

    system_prompt = prompts.create_training_system_prompt(
        session.mode, session.persona or "клиент", session.skill_focus
    )

    chat_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for m in messages_data:
        chat_messages.append({"role": m.role, "content": m.content})
    chat_messages.append({"role": "user", "content": user_message})

    reply, _ = await router.chat(
        chat_messages, telegram_id, temperature=0.8, max_tokens=256, operation="training_reply"
    )

    next_index = len(messages_data)
    await repository.add_training_message(session.id, telegram_id, "user", user_message, next_index)
    await repository.add_training_message(session.id, telegram_id, "assistant", reply, next_index + 1)

    return reply


async def finish_training(telegram_id: int, session: TrainingSession) -> dict:
    messages_data = await repository.get_training_messages(session.id)
    dialog = "\n".join(f"[{m.role}]: {m.content}" for m in messages_data)

    mode_label = prompts.TRAINING_MODE_PROMPTS.get(session.mode, {}).get("label", "Симуляция")
    eval_prompt = prompts.create_evaluation_prompt(dialog, mode_label)

    eval_result, _ = await router.chat(
        [{"role": "user", "content": eval_prompt}],
        telegram_id,
        temperature=0.3,
        max_tokens=1024,
        operation="training_eval",
    )

    parsed = _parse_eval_result(eval_result)
    score = max(0, min(100, int(parsed.get("score", 50))))
    skill_updates = parsed.get("skill_updates", {})

    await repository.finish_training_session(session.id, score, parsed.get("recommended_alternative"))

    feedback = TrainingFeedback(
        session_id=session.id,
        telegram_id=telegram_id,
        score=score,
        strengths=parsed.get("strengths", []),
        weaknesses=parsed.get("weaknesses", []),
        missed_opportunities=parsed.get("missed_opportunities", []),
        recommended_alternative=parsed.get("recommended_alternative"),
        ideal_response=parsed.get("ideal_response"),
        next_exercise=parsed.get("next_exercise"),
        skill_updates=skill_updates,
    )
    await repository.save_training_feedback(feedback)
    await repository.update_skill_profile(telegram_id, skill_updates)

    had_errors = score < 40
    await repository.update_user_stats(telegram_id, score, had_errors)

    weak_skill = _determine_weakest_skill(skill_updates)
    new_level = _determine_level(score, telegram_id)
    await repository.update_user_level(telegram_id, new_level, weak_skill)

    parsed["score"] = score
    parsed["level"] = new_level
    parsed["level_name"] = LEVELS.get(new_level, "UNKNOWN")
    return parsed


def _parse_eval_result(text: str) -> dict:
    import json
    try:
        import re
        match = re.search(r'\{[\s\S]*\}', text)
        if match:
            return json.loads(match.group(0))
    except Exception:
        pass
    return {
        "score": 50,
        "strengths": [],
        "weaknesses": ["Не удалось распарсить оценку"],
        "missed_opportunities": [],
        "recommended_alternative": text[:500] if text else "",
        "ideal_response": "",
        "next_exercise": "",
        "skill_updates": {},
        "critical_mistake": "",
        "better_approach": "",
    }


def _determine_weakest_skill(skill_updates: dict) -> Optional[str]:
    if not skill_updates:
        return None
    min_key = min(skill_updates, key=lambda k: skill_updates.get(k, 0))
    return min_key if skill_updates[min_key] < 0 else None


def _determine_level(score: int, telegram_id: int) -> int:
    if score >= 90:
        return 6
    elif score >= 75:
        return 5
    elif score >= 60:
        return 4
    elif score >= 45:
        return 3
    elif score >= 30:
        return 2
    return 1


def format_feedback(result: dict) -> str:
    score = result.get("score", 0)
    level = result.get("level", 1)
    level_name = result.get("level_name", "")

    lines = [
        f"РЕЗУЛЬТАТ ТРЕНИРОВКИ",
        f"",
        f"Оценка: {score}/100",
        f"Уровень: {level} — {level_name}",
        f"",
    ]

    strengths = result.get("strengths", [])
    if strengths:
        lines.append("СИЛЬНЫЕ СТОРОНЫ:")
        for s in strengths:
            lines.append(f"  + {s}")
        lines.append("")

    weaknesses = result.get("weaknesses", [])
    if weaknesses:
        lines.append("СЛАБЫЕ СТОРОНЫ:")
        for w in weaknesses:
            lines.append(f"  - {w}")
        lines.append("")

    critical = result.get("critical_mistake")
    if critical:
        lines.append(f"КЛЮЧЕВАЯ ОШИБКА: {critical}")
        lines.append("")

    better = result.get("better_approach")
    if better:
        lines.append(f"КАК ЛУЧШЕ: {better}")
        lines.append("")

    ideal = result.get("ideal_response")
    if ideal:
        lines.append(f"ИДЕАЛЬНЫЙ ОТВЕТ: {ideal}")
        lines.append("")

    next_ex = result.get("next_exercise")
    if next_ex:
        lines.append(f"ТРЕНИРОВОЧНОЕ ЗАДАНИЕ: {next_ex}")

    return "\n".join(lines)
