from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_DATABASE_URL = "postgresql+asyncpg://eurodent:eurodent_dev_pass@localhost:5432/eurodent2"
DEFAULT_DB_ENCRYPTION_KEY = "dev-encryption-key-change-in-prod-32ch"
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

    # Auth
    jwt_secret_key: str = DEFAULT_JWT_SECRET_KEY
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 240
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "eurodent_refresh_token"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    verifactu_mode: Literal["verifactu", "no_verifactu"] = "verifactu"
    sif_codigo: str = "EURODENT2-COPY"
    sif_version: str = "0.2.0"
    sif_nombre_producto: str = "Eurodent Dental Suite"
    sif_productor_nombre: str = "DentOrg"
    sif_productor_nif: str = "B00000000"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_url: str = DEFAULT_FRONTEND_URL
    allowed_hosts: str = "localhost,127.0.0.1,::1,test"
    sql_echo: bool = False

    # Seguridad
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 900
    login_rate_limit_block_seconds: int = 900
    upload_rate_limit_per_minute: int = 30
    max_upload_size_mb: int = 50

    # Entorno
    environment: Literal["development", "production"] = "development"

    # Datos de la clínica (para PDFs, cabeceras de facturas y Verifactu)
    clinica_nombre: str = "Clínica Dental Eurodent"
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
        if not self.allowed_hosts_list or "*" in self.allowed_hosts_list:
            errores.append("ALLOWED_HOSTS debe listar hosts explicitos en produccion")
        if not self.sif_codigo.strip():
            errores.append("SIF_CODIGO debe informar el identificador del sistema")

        if errores:
            raise ValueError("Configuracion insegura para produccion: " + "; ".join(errores))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
