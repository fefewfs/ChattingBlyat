from dataclasses import dataclass, field
from typing import List, Optional
import uuid


@dataclass
class TgUser:
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_admin: bool = False
    training_count: int = 0
    best_score: int = 0
    avg_score: float = 0.0
    total_errors: int = 0
    completed_simulations: int = 0
    current_level: int = 1
    weak_skill: Optional[str] = None
    created_at: Optional[str] = None
    last_active: Optional[str] = None


@dataclass
class TrainingSession:
    id: str
    telegram_id: int
    mode: str = "live_simulation"
    skill_focus: Optional[str] = None
    persona: Optional[str] = None
    status: str = "active"
    score: Optional[int] = None
    summary: Optional[str] = None
    started_at: Optional[str] = None
    ended_at: Optional[str] = None


@dataclass
class TrainingMessage:
    id: str
    session_id: str
    telegram_id: int
    role: str
    content: str
    message_index: int
    created_at: Optional[str] = None


@dataclass
class SkillProfile:
    telegram_id: int
    rapport: int = 50
    discovery: int = 50
    qualification: int = 50
    objection_handling: int = 50
    value_creation: int = 50
    persuasion: int = 50
    dialog_control: int = 50
    closing: int = 50
    followup: int = 50
    upsell: int = 50
    adaptability: int = 50
    script_selection: int = 50


@dataclass
class TrainingFeedback:
    session_id: str
    telegram_id: int
    score: int = 0
    strengths: List[str] = field(default_factory=list)
    weaknesses: List[str] = field(default_factory=list)
    missed_opportunities: List[str] = field(default_factory=list)
    recommended_alternative: Optional[str] = None
    ideal_response: Optional[str] = None
    next_exercise: Optional[str] = None
    skill_updates: dict = field(default_factory=dict)


@dataclass
class KnowledgeItem:
    id: str
    title: str
    category: str
    content: str
    tags: List[str] = field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


SKILL_KEYS = [
    "rapport", "discovery", "qualification", "objection_handling", "value_creation",
    "persuasion", "dialog_control", "closing", "followup", "upsell", "adaptability", "script_selection",
]

SKILL_LABELS_RU = {
    "rapport": "Установление контакта",
    "discovery": "Выявление потребностей",
    "qualification": "Квалификация",
    "objection_handling": "Работа с возражениями",
    "value_creation": "Создание ценности",
    "persuasion": "Убеждение",
    "dialog_control": "Контроль диалога",
    "closing": "Закрытие",
    "followup": "Follow-up",
    "upsell": "Upsell",
    "adaptability": "Адаптивность",
    "script_selection": "Выбор подходящего скрипта",
}

LEVELS = {
    1: "FOUNDATION",
    2: "CONVERSATION",
    3: "OBJECTION HANDLING",
    4: "PERSUASION",
    5: "ADVANCED",
    6: "ELITE",
}
