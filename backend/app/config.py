from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://pharma:pharma@localhost:5432/pharma"
    redis_url: str = "redis://localhost:6379/0"
    osrm_url: str = "http://localhost:5001"
    hq_lat: float = 46.9480
    hq_lon: float = 7.4474
    hq_name: str = "HQ_Bern"
    data_dir: str = "/app/data"

    # TomTom Traffic API — empty = no file key (falls back to DB key / simulation).
    # When set here (via .env), this takes precedence over any website-entered key.
    tomtom_api_key: str = ""

    model_config = {"env_file": ".env"}


settings = Settings()
