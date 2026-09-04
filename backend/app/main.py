from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api import (
    admin,
    assistant,
    auth,
    citas,
    clinicas,
    consentimientos,
    dictado,
    doctores,
    documentos,
    facturas,
    fichajes,
    inventario,
    laboratorio,
    notificaciones,
    odontograma,
    pacientes,
    pdf,
    portal,
    presupuestos,
    recetas,
    reportes,
    sync_import,
    tratamientos,
    whatsapp,
)
from app.config import get_settings
from app.core.audit import AuditLogMiddleware
from app.core.http_security import SecurityHeadersMiddleware
from app.core.permissions import RequireStaff
from app.services.backup_scheduler import start_backup_scheduler

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_backup_scheduler()
    yield
    # Shutdown


app = FastAPI(
    title="DentCore API",
    description="Sistema de gestión integral para clínica dental",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.environment == "development" else None,
    redoc_url="/api/redoc" if settings.environment == "development" else None,
)

# CORS — solo permitir el frontend local
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=settings.cors_allowed_methods_list,
    allow_headers=settings.cors_allowed_headers_list,
)

if settings.allowed_hosts_list:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

app.add_middleware(SecurityHeadersMiddleware)

# Audit log middleware (registra accesos a datos sensibles)
app.add_middleware(AuditLogMiddleware)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
staff_only = [RequireStaff]
app.include_router(assistant.router, prefix="/api/assistant", tags=["assistant"], dependencies=staff_only)
app.include_router(pacientes.router, prefix="/api/pacientes", tags=["pacientes"], dependencies=staff_only)
app.include_router(citas.router, prefix="/api/citas", tags=["citas"], dependencies=staff_only)
app.include_router(doctores.router, prefix="/api/doctores", tags=["doctores"], dependencies=staff_only)
app.include_router(tratamientos.router, prefix="/api/tratamientos", tags=["tratamientos"], dependencies=staff_only)
app.include_router(presupuestos.router, prefix="/api/presupuestos", tags=["presupuestos"], dependencies=staff_only)
app.include_router(facturas.router, prefix="/api/facturas", tags=["facturas"], dependencies=staff_only)
app.include_router(fichajes.router, prefix="/api/fichajes", tags=["fichajes"], dependencies=staff_only)
app.include_router(reportes.router, prefix="/api/reportes", tags=["reportes"], dependencies=staff_only)
app.include_router(admin.router, prefix="/api/admin", tags=["admin"], dependencies=staff_only)
app.include_router(pdf.router, prefix="/api/pdf", tags=["pdf"], dependencies=staff_only)
app.include_router(documentos.router, prefix="/api/pacientes", tags=["documentos"], dependencies=staff_only)
app.include_router(dictado.router, prefix="/api/dictado", tags=["dictado"], dependencies=staff_only)
app.include_router(laboratorio.router, prefix="/api", tags=["laboratorio"], dependencies=staff_only)
app.include_router(notificaciones.router, prefix="/api/notificaciones", tags=["notificaciones"], dependencies=staff_only)
app.include_router(consentimientos.router, prefix="/api", tags=["consentimientos"], dependencies=staff_only)
app.include_router(recetas.router, prefix="/api/recetas", tags=["recetas"], dependencies=staff_only)
app.include_router(odontograma.router, prefix="/api", tags=["odontograma"], dependencies=staff_only)
app.include_router(clinicas.router, prefix="/api/clinicas", tags=["clinicas"], dependencies=staff_only)
app.include_router(inventario.router, prefix="/api/inventario", tags=["inventario"], dependencies=staff_only)
app.include_router(sync_import.router, prefix="/api/sync", tags=["sync"], dependencies=staff_only)
app.include_router(sync_import.import_router, prefix="/api/import", tags=["import"], dependencies=staff_only)
app.include_router(portal.router, prefix="/api/portal", tags=["portal"])
app.include_router(whatsapp.router, prefix="/api/whatsapp", tags=["whatsapp"])


@app.get("/api/health")
async def health_check():
    return {
        "ok": True,
        "service": "DentCore backend",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
