import logging
from typing import List, Optional

from app.database.database import (
    rest_select, rest_insert, rest_upsert, rest_update,
    rest_delete, rest_rpc, rest_count, close_session,
)
from app.database.models import (
    TgUser, TrainingSession, TrainingMessage, SkillProfile,
    TrainingFeedback, KnowledgeItem, SKILL_KEYS,
)

logger = logging.getLogger(__name__)


async def create_or_update_user(
    telegram_id: int,
    username: str = None,
    first_name: str = None,
    last_name: str = None,
    is_admin: bool = False,
) -> TgUser:
    existing = await rest_select("tg_users", {"telegram_id": str(telegram_id)}, single=True)
    if existing:
        payload = {
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "is_admin": existing.get("is_admin") or is_admin,
            "last_active": "now()",
        }
        row = await rest_update("tg_users", {"telegram_id": str(telegram_id)}, payload, select="*")
        return _row_to_user(row[0] if row else existing)
    else:
        payload = {
            "telegram_id": telegram_id,
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "is_admin": is_admin,
        }
        row = await rest_insert("tg_users", payload, select="*")
        return _row_to_user(row) if row else TgUser(telegram_id=telegram_id, username=username)


async def get_user(telegram_id: int) -> Optional[TgUser]:
    row = await rest_select("tg_users", {"telegram_id": str(telegram_id)}, single=True)
    return _row_to_user(row) if row else None


async def update_user_stats(telegram_id: int, score: int, had_errors: bool = False):
    user = await rest_select("tg_users", {"telegram_id": str(telegram_id)}, single=True)
    if not user:
        return
    new_count = (user.get("training_count") or 0) + 1
    old_avg = float(user.get("avg_score") or 0)
    old_count = user.get("training_count") or 0
    new_avg = (old_avg * old_count + score) / new_count if new_count else 0
    new_best = max(user.get("best_score") or 0, score)
    new_errors = (user.get("total_errors") or 0) + (1 if had_errors else 0)
    new_sims = (user.get("completed_simulations") or 0) + 1
    await rest_update("tg_users", {"telegram_id": str(telegram_id)}, {
        "training_count": new_count,
        "best_score": new_best,
        "avg_score": round(new_avg, 2),
        "total_errors": new_errors,
        "completed_simulations": new_sims,
    })


async def update_user_level(telegram_id: int, level: int, weak_skill: str = None):
    await rest_update("tg_users", {"telegram_id": str(telegram_id)}, {
        "current_level": level,
        "weak_skill": weak_skill,
    })


async def create_training_session(
    telegram_id: int, mode: str, skill_focus: str = None, persona: str = None
) -> TrainingSession:
    row = await rest_insert("tg_training_sessions", {
        "telegram_id": telegram_id,
        "mode": mode,
        "skill_focus": skill_focus,
        "persona": persona,
        "status": "active",
    }, select="*")
    return _row_to_session(row) if row else TrainingSession(
        id="", telegram_id=telegram_id, mode=mode, skill_focus=skill_focus, persona=persona
    )


async def get_active_session(telegram_id: int) -> Optional[TrainingSession]:
    row = await rest_select(
        "tg_training_sessions",
        {"telegram_id": str(telegram_id), "status": "active"},
        order="started_at.desc",
        limit=1,
        single=True,
    )
    return _row_to_session(row) if row else None


async def get_session(session_id: str) -> Optional[TrainingSession]:
    row = await rest_select("tg_training_sessions", {"id": session_id}, single=True)
    return _row_to_session(row) if row else None


async def add_training_message(
    session_id: str, telegram_id: int, role: str, content: str, message_index: int
):
    await rest_insert("tg_training_messages", {
        "session_id": session_id,
        "telegram_id": telegram_id,
        "role": role,
        "content": content,
        "message_index": message_index,
    })


async def get_training_messages(session_id: str) -> List[TrainingMessage]:
    rows = await rest_select(
        "tg_training_messages",
        {"session_id": session_id},
        order="message_index.asc",
    )
    return [_row_to_message(r) for r in rows]


async def finish_training_session(session_id: str, score: int, summary: str = None):
    await rest_update("tg_training_sessions", {"id": session_id}, {
        "status": "completed",
        "score": score,
        "summary": summary,
        "ended_at": "now()",
    })


async def save_training_feedback(feedback: TrainingFeedback):
    await rest_insert("tg_training_feedback", {
        "session_id": feedback.session_id,
        "telegram_id": feedback.telegram_id,
        "score": feedback.score,
        "strengths": feedback.strengths,
        "weaknesses": feedback.weaknesses,
        "missed_opportunities": feedback.missed_opportunities,
        "recommended_alternative": feedback.recommended_alternative,
        "ideal_response": feedback.ideal_response,
        "next_exercise": feedback.next_exercise,
        "skill_updates": feedback.skill_updates,
    })


async def get_skill_profile(telegram_id: int) -> Optional[SkillProfile]:
    row = await rest_select("tg_skill_profiles", {"telegram_id": str(telegram_id)}, single=True)
    if not row:
        return None
    return SkillProfile(
        telegram_id=telegram_id,
        rapport=row.get("rapport", 50),
        discovery=row.get("discovery", 50),
        qualification=row.get("qualification", 50),
        objection_handling=row.get("objection_handling", 50),
        value_creation=row.get("value_creation", 50),
        persuasion=row.get("persuasion", 50),
        dialog_control=row.get("dialog_control", 50),
        closing=row.get("closing", 50),
        followup=row.get("followup", 50),
        upsell=row.get("upsell", 50),
        adaptability=row.get("adaptability", 50),
        script_selection=row.get("script_selection", 50),
    )


async def create_skill_profile(telegram_id: int) -> SkillProfile:
    await rest_upsert("tg_skill_profiles", {"telegram_id": telegram_id}, "telegram_id")
    return SkillProfile(telegram_id=telegram_id)


async def update_skill_profile(telegram_id: int, skill_updates: dict):
    profile = await get_skill_profile(telegram_id)
    if not profile:
        await create_skill_profile(telegram_id)
        profile = await get_skill_profile(telegram_id)
        if not profile:
            return

    payload = {}
    for k in SKILL_KEYS:
        current = getattr(profile, k, 50)
        delta = skill_updates.get(k, 0)
        payload[k] = max(0, min(100, current + delta))
    await rest_update("tg_skill_profiles", {"telegram_id": str(telegram_id)}, payload)


async def get_user_sessions(telegram_id: int, limit: int = 10) -> List[TrainingSession]:
    rows = await rest_select(
        "tg_training_sessions",
        {"telegram_id": str(telegram_id)},
        order="started_at.desc",
        limit=limit,
    )
    return [_row_to_session(r) for r in rows]


async def get_user_feedback(telegram_id: int, limit: int = 5) -> List[dict]:
    sessions = await rest_select(
        "tg_training_sessions",
        {"telegram_id": str(telegram_id)},
        select="id,mode",
        limit=100,
    )
    if not sessions:
        return []
    session_ids = [s["id"] for s in sessions]
    all_feedback = []
    for sid in session_ids:
        rows = await rest_select(
            "tg_training_feedback",
            {"session_id": sid},
            order="created_at.desc",
            limit=limit,
        )
        for r in rows:
            match = next((s for s in sessions if s["id"] == r.get("session_id")), None)
            r["mode"] = match["mode"] if match else None
            all_feedback.append(r)
    return all_feedback[:limit]


async def search_knowledge(query: str, limit: int = 10) -> List[KnowledgeItem]:
    result = await rest_rpc("tg_search_knowledge", {"search_query": query, "match_count": limit})
    if not result:
        return []
    return [
        KnowledgeItem(
            id=str(r.get("id", "")),
            title=r.get("title", ""),
            category=r.get("category", ""),
            content=r.get("content", ""),
            tags=r.get("tags", []),
        )
        for r in result
    ]


async def add_knowledge_item(
    title: str, category: str, content: str, tags: List[str] = None, created_by: int = None
) -> str:
    row = await rest_insert("tg_knowledge_items", {
        "title": title,
        "category": category,
        "content": content,
        "tags": tags or [],
        "created_by": created_by,
    }, select="id")
    return row["id"] if row else None


async def delete_knowledge_item(item_id: str) -> bool:
    rows = await rest_delete("tg_knowledge_items", {"id": item_id}, select="id")
    return len(rows) > 0


async def list_knowledge(category: str = None, limit: int = 20) -> List[KnowledgeItem]:
    filters = {"category": category} if category else None
    rows = await rest_select("tg_knowledge_items", filters, order="created_at.desc", limit=limit)
    return [_row_to_knowledge(r) for r in rows]


async def log_ai_error(
    telegram_id: int, provider: str, model: str, error_message: str,
    error_code: int = None, operation: str = None, latency_ms: int = None,
):
    await rest_insert("tg_ai_error_logs", {
        "telegram_id": telegram_id,
        "provider": provider,
        "model": model,
        "error_message": error_message,
        "error_code": error_code,
        "operation": operation,
        "latency_ms": latency_ms,
    })


async def get_recent_errors(limit: int = 10) -> List[dict]:
    rows = await rest_select("tg_ai_error_logs", order="created_at.desc", limit=limit)
    return rows


async def get_all_users(limit: int = 50) -> List[TgUser]:
    rows = await rest_select("tg_users", order="created_at.desc", limit=limit)
    return [_row_to_user(r) for r in rows]


async def add_search_history(telegram_id: int, query: str, results_count: int):
    await rest_insert("tg_search_history", {
        "telegram_id": telegram_id,
        "query": query,
        "results_count": results_count,
    })


async def get_user_count() -> int:
    return await rest_count("tg_users")


async def get_total_training_count() -> int:
    return await rest_count("tg_training_sessions", {"status": "completed"})


def _row_to_user(row) -> TgUser:
    return TgUser(
        telegram_id=row["telegram_id"],
        username=row.get("username"),
        first_name=row.get("first_name"),
        last_name=row.get("last_name"),
        is_admin=row.get("is_admin", False),
        training_count=row.get("training_count", 0),
        best_score=row.get("best_score", 0),
        avg_score=float(row.get("avg_score", 0)),
        total_errors=row.get("total_errors", 0),
        completed_simulations=row.get("completed_simulations", 0),
        current_level=row.get("current_level", 1),
        weak_skill=row.get("weak_skill"),
        created_at=str(row["created_at"]) if row.get("created_at") else None,
        last_active=str(row["last_active"]) if row.get("last_active") else None,
    )


def _row_to_session(row) -> TrainingSession:
    return TrainingSession(
        id=str(row["id"]),
        telegram_id=row["telegram_id"],
        mode=row.get("mode", "live_simulation"),
        skill_focus=row.get("skill_focus"),
        persona=row.get("persona"),
        status=row.get("status", "active"),
        score=row.get("score"),
        summary=row.get("summary"),
        started_at=str(row["started_at"]) if row.get("started_at") else None,
        ended_at=str(row["ended_at"]) if row.get("ended_at") else None,
    )


def _row_to_message(row) -> TrainingMessage:
    return TrainingMessage(
        id=str(row["id"]),
        session_id=str(row["session_id"]),
        telegram_id=row["telegram_id"],
        role=row["role"],
        content=row["content"],
        message_index=row["message_index"],
        created_at=str(row["created_at"]) if row.get("created_at") else None,
    )


def _row_to_knowledge(row) -> KnowledgeItem:
    return KnowledgeItem(
        id=str(row["id"]),
        title=row["title"],
        category=row["category"],
        content=row["content"],
        tags=list(row.get("tags", [])),
        created_at=str(row["created_at"]) if row.get("created_at") else None,
        updated_at=str(row["updated_at"]) if row.get("updated_at") else None,
    )
