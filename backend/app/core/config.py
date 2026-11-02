from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"
    gemini_fallback_model: str = "gemini-flash-lite-latest"
    openrouter_timeout_seconds: float = 45.0
    gemini_timeout_seconds: float = 20.0
    secret_key: str = "dev-secret-change-in-production"
    database_url: str = "sqlite:///./study_planner.db"
    cors_origins: str = "http://localhost:5173"
    access_token_expire_minutes: int = 60 * 24 * 7
    trial_hours: int = 24
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    algorithm: str = "HS256"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
