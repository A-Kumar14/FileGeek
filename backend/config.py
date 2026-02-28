import os
from dotenv import load_dotenv

load_dotenv()

class Config:

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_MAX_TOKENS = int(os.getenv("OPENAI_MAX_TOKENS", "1000"))

    SECRET_KEY = os.getenv("SECRET_KEY", "")  # Must be set via JWT_SECRET in auth.py
    DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    HOST = os.getenv("FLASK_HOST", "0.0.0.0")
    PORT = int(os.getenv("FLASK_PORT", "5001"))  # Changed from 5000 to avoid macOS AirPlay conflict

    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    ALLOWED_EXTENSIONS = {'.pdf'}

    RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "20"))
    RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

    # Redis + Celery
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", os.getenv("REDIS_URL", "redis://localhost:6379/0"))

    # Flask-Limiter (distributed rate limiting via Redis)
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "200/hour")

    # AWS S3 (optional upload storage)
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")
    AWS_S3_REGION = os.getenv("AWS_S3_REGION", "us-east-1")
    S3_ENABLED = os.getenv("S3_ENABLED", "false").lower() == "true"

    # PII masking
    PII_MASKING_ENABLED = os.getenv("PII_MASKING_ENABLED", "true").lower() == "true"

    # ChromaDB
    CHROMA_PATH = os.getenv(
        "CHROMA_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_data"),
    )
    NUM_RETRIEVAL_CHUNKS = int(os.getenv("NUM_RETRIEVAL_CHUNKS", "5"))
    DEEP_THINK_CHUNKS = int(os.getenv("DEEP_THINK_CHUNKS", "12"))

    # Audio
    ALLOWED_AUDIO_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.webm', '.ogg'}

    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://filegeek.vercel.app",
    ]

    ALLOWED_URL_PREFIXES = (
        "https://utfs.io/",
        "https://uploadthing.com/",
        "https://ufs.sh/",
        "https://4k40e5rcbl.ufs.sh/",
    )

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    @classmethod
    def validate(cls):
        import logging as _logging
        _log = _logging.getLogger(__name__)
        poe_key = os.getenv("POE_API_KEY")
        openai_key = cls.OPENAI_API_KEY
        if not poe_key and not openai_key:
            _log.warning(
                "Neither POE_API_KEY nor OPENAI_API_KEY is set. "
                "AI features will not work without at least one provider key."
            )
        return True

    @classmethod
    def get_cors_origins(cls):
        cors_origins = os.getenv("CORS_ORIGINS")
        if cors_origins:
            return [origin.strip() for origin in cors_origins.split(",")]
        return cls.CORS_ORIGINS
