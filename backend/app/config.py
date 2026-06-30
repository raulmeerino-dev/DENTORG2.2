from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DATABASE_URL = "postgresql+asyncpg://dentcore:dentcore_dev_pass@localhost:5432/dentcore"
DEFAULT_DB_ENCRYPTION_KEY = "dev-encryption-key-change-in-prod-32ch"
DEFAULT_BACKUP_ENCRYPTION_KEY = ""
DEFAULT_JWT_SECRET_KEY = "dev-jwt-secret-change-in-prod"
DEFAULT_FRONTEND_URL = "http://localhost:5173"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Base de datos
    database_url: str = DEFAULT_DATABASE_URL
    db_encryption_key: str = DEFAULT_DB_ENCRYPTION_KEY
    backup_encryption_key: str = DEFAULT_BACKUP_ENCRYPTION_KEY

    # Auth
    jwt_secret_key: str = DEFAULT_JWT_SECRET_KEY
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 240
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "dentcore_refresh_token"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    verifactu_mode: Literal["verifactu", "no_verifactu"] = "verifactu"
    sif_codigo: str = "DENTCORE-SIF"
    sif_version: str = "0.2.0"
    sif_nombre_producto: str = "DentCore Dental Suite"
    sif_productor_nombre: str = "DentCore"
    sif_productor_nif: str = "B00000000"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8011
    frontend_url: str = DEFAULT_FRONTEND_URL
    allowed_hosts: str = "localhost,127.0.0.1,::1,test"
    cors_allowed_methods: str = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    cors_allowed_headers: str = "Authorization,Content-Type,Accept,X-Request-ID"
    sql_echo: bool = False

    # Seguridad
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 900
    login_rate_limit_block_seconds: int = 900
    upload_rate_limit_per_minute: int = 30
    max_upload_size_mb: int = 50
    clinical_dictation_provider: str = ""
    clinical_dictation_endpoint: str = ""
    clinical_dictation_api_key: str = ""
    clinical_dictation_timeout_seconds: int = 45
    clinical_dictation_max_audio_mb: int = 15
    clinical_dictation_max_duration_seconds: int = 180
    clinical_dictation_allowed_mime_types: str = "audio/webm,audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/m4a"
    clinical_dictation_keep_audio: bool = False
    receta_provider: Literal["disabled", "mock", "real"] = "disabled"
    receta_provider_base_url: str = ""
    receta_provider_client_id: str = ""
    receta_provider_client_secret: str = ""
    receta_provider_cert_path: str = ""
    receta_provider_timeout: int = 20
    llm_provider: str = "auto"
    llm_fallback_order: str = "ollama,openai,mock"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_timeout_seconds: int = 12
    openai_responses_endpoint: str = "https://api.openai.com/v1/responses"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:14b-instruct"
    ollama_timeout_seconds: int = 120
    whatsapp_webhook_token: str = ""
    backup_retention_days: int = 180
    backup_external_location: str = ""
    backup_external_copy_dir: str = ""

    # Entorno
    environment: Literal["development", "production"] = "development"

    # Datos de la clínica (para PDFs, cabeceras de facturas y Verifactu)
    clinica_nombre: str = "Clínica Dental DentCore"
    clinica_direccion: str = ""
    clinica_ciudad: str = ""
    clinica_telefono: str = ""
    clinica_email: str = ""
    nif_emisor: str = "B00000000"

    @property
    def declaracion_responsable_texto(self) -> str:
        modalidad = "VERI*FACTU" if self.verifactu_mode == "verifactu" else "SIF no verificable"
        return (
            f"Declaracion responsable del productor del sistema informatico de facturacion "
            f"{self.sif_nombre_producto} {self.sif_version}. "
            f"Productor: {self.sif_productor_nombre} ({self.sif_productor_nif}). "
            f"Codigo SIF: {self.sif_codigo}. Modalidad declarada: {modalidad}. "
            "Esta version incorpora control de integridad, trazabilidad, inalterabilidad y "
            "registro fiscal encadenado segun el marco funcional definido para el producto."
        )

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]

    @property
    def cors_allowed_methods_list(self) -> list[str]:
        return [method.strip().upper() for method in self.cors_allowed_methods.split(",") if method.strip()]

    @property
    def cors_allowed_headers_list(self) -> list[str]:
        return [header.strip() for header in self.cors_allowed_headers.split(",") if header.strip()]

    @property
    def clinical_dictation_allowed_mime_types_list(self) -> list[str]:
        return [
            item.strip().lower()
            for item in self.clinical_dictation_allowed_mime_types.split(",")
            if item.strip()
        ]

    @property
    def cors_allowed_origins(self) -> list[str]:
        origins = [self.frontend_url.strip()]

        try:
            parsed = urlsplit(self.frontend_url.strip())
            if parsed.hostname in {"localhost", "127.0.0.1"}:
                alias = "127.0.0.1" if parsed.hostname == "localhost" else "localhost"
                alt_origin = urlunsplit(
                    (parsed.scheme, f"{alias}:{parsed.port}" if parsed.port else alias, "", "", "")
                )
                origins.append(alt_origin)
        except ValueError:
            pass

        seen: list[str] = []
        for origin in origins:
            if origin and origin not in seen:
                seen.append(origin)
        return seen

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.environment != "production":
            return self

        errores: list[str] = []
        if self.jwt_secret_key == DEFAULT_JWT_SECRET_KEY or len(self.jwt_secret_key) < 32:
            errores.append("JWT_SECRET_KEY debe ser unico y tener al menos 32 caracteres")
        if self.db_encryption_key == DEFAULT_DB_ENCRYPTION_KEY or len(self.db_encryption_key) < 32:
            errores.append("DB_ENCRYPTION_KEY debe ser unica y tener al menos 32 caracteres")
        if not self.backup_encryption_key or len(self.backup_encryption_key) < 32:
            errores.append("BACKUP_ENCRYPTION_KEY debe estar definida y tener al menos 32 caracteres")
        if not self.backup_external_copy_dir.strip():
            errores.append("BACKUP_EXTERNAL_COPY_DIR debe apuntar a un destino externo o volumen montado")
        if not self.allowed_hosts_list or "*" in self.allowed_hosts_list:
            errores.append("ALLOWED_HOSTS debe listar hosts explicitos en produccion")
        if not self.auth_cookie_secure:
            errores.append("AUTH_COOKIE_SECURE debe estar activo en produccion")
        if self.auth_cookie_samesite == "none" and not self.auth_cookie_secure:
            errores.append("AUTH_COOKIE_SAMESITE=none requiere AUTH_COOKIE_SECURE=true")
        if not self.sif_codigo.strip():
            errores.append("SIF_CODIGO debe informar el identificador del sistema")

        if errores:
            raise ValueError("Configuracion insegura para produccion: " + "; ".join(errores))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
