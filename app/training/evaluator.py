import logging
from typing import Dict, List

from app.ai import router, prompts
from app.database import repository
from app.database.models import SKILL_KEYS, SKILL_LABELS_RU, LEVELS

logger = logging.getLogger(__name__)


async def get_stats_text(telegram_id: int) -> str:
    user = await repository.get_user(telegram_id)
    if not user:
        return "Пользователь не найден."

    profile = await repository.get_skill_profile(telegram_id)
    recent_sessions = await repository.get_user_sessions(telegram_id, 5)
    recent_feedback = await repository.get_user_feedback(telegram_id, 3)

    lines = [
        "ВАША СТАТИСТИКА",
        "",
        f"Тренировок всего: {user.training_count}",
        f"Завершено симуляций: {user.completed_simulations}",
        f"Средняя оценка: {user.avg_score:.1f}",
        f"Лучший результат: {user.best_score}",
        f"Ошибок: {user.total_errors}",
        f"Текущий уровень: {user.current_level} — {LEVELS.get(user.current_level, '?')}",
    ]

    if user.weak_skill:
        lines.append(f"Слабое место: {SKILL_LABELS_RU.get(user.weak_skill, user.weak_skill)}")

    if profile:
        lines.append("")
        lines.append("ПРОФИЛЬ НАВЫКОВ:")
        for k in SKILL_KEYS:
            val = getattr(profile, k, 50)
            bar = _progress_bar(val)
            lines.append(f"  {SKILL_LABELS_RU[k]}: {val} {bar}")

    if recent_sessions:
        lines.append("")
        lines.append("ПОСЛЕДНИЕ ТРЕНИРОВКИ:")
        for s in recent_sessions:
            score_str = f"{s.score}/100" if s.score is not None else "не завершена"
            mode_label = prompts.TRAINING_MODE_PROMPTS.get(s.mode, {}).get("label", s.mode)
            lines.append(f"  {mode_label} — {score_str}")

    if recent_feedback:
        lines.append("")
        lines.append("ПОСЛЕДНЯЯ ОБРАТНАЯ СВЯЗЬ:")
        fb = recent_feedback[0]
        if fb.get("strengths"):
            lines.append(f"  Сильные: {', '.join(fb['strengths'][:2])}")
        if fb.get("weaknesses"):
            lines.append(f"  Слабые: {', '.join(fb['weaknesses'][:2])}")

    return "\n".join(lines)


def _progress_bar(value: int) -> str:
    filled = value // 10
    return "[" + "#" * filled + "-" * (10 - filled) + "]"
