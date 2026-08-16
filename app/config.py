import os
from dataclasses import dataclass, field
from typing import List


def _parse_admin_ids(raw: str) -> List[int]:
    if not raw:
        return []
    return [int(x.strip()) for x in raw.split(",") if x.strip().isdigit()]


@dataclass
class Config:
    bot_token: str = field(default_factory=lambda: os.getenv("BOT_TOKEN", ""))
    openrouter_api_key: str = field(default_factory=lambda: os.getenv("OPENROUTER_API_KEY", ""))
    openrouter_model: str = field(default_factory=lambda: os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"))
    mistral_api_key: str = field(default_factory=lambda: os.getenv("MISTRAL_API_KEY", ""))
    mistral_model: str = field(default_factory=lambda: os.getenv("MISTRAL_MODEL", "mistral-large-latest"))
    supabase_url: str = field(default_factory=lambda: os.getenv("VITE_SUPABASE_URL", os.getenv("SUPABASE_URL", "")).rstrip("/"))
    supabase_anon_key: str = field(default_factory=lambda: os.getenv("VITE_SUPABASE_ANON_KEY", os.getenv("SUPABASE_ANON_KEY", "")))
    supabase_service_role_key: str = field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("VITE_SUPABASE_ANON_KEY", os.getenv("SUPABASE_ANON_KEY", ""))))
    ai_provider: str = field(default_factory=lambda: os.getenv("AI_PROVIDER", "openrouter"))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    admin_ids: List[int] = field(default_factory=lambda: _parse_admin_ids(os.getenv("ADMIN_TELEGRAM_IDS", "")))
    fallback_enabled: bool = field(default_factory=lambda: os.getenv("FALLBACK_ENABLED", "true").lower() == "true")

    @property
    def has_openrouter(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def has_mistral(self) -> bool:
        return bool(self.mistral_api_key)

    @property
    def has_any_provider(self) -> bool:
        return self.has_openrouter or self.has_mistral

    @property
    def primary_provider(self) -> str:
        if self.ai_provider == "mistral" and self.has_mistral:
            return "mistral"
        if self.ai_provider == "openrouter" and self.has_openrouter:
            return "openrouter"
        if self.has_openrouter:
            return "openrouter"
        if self.has_mistral:
            return "mistral"
        return ""

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def database_url(self) -> str:
        return self.supabase_url

    @property
    def fallback_provider(self) -> str:
        if self.primary_provider == "openrouter" and self.has_mistral:
            return "mistral"
        if self.primary_provider == "mistral" and self.has_openrouter:
            return "openrouter"
        return ""


config = Config()
