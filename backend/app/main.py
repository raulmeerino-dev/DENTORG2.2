from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.config import get_settings
from app.core.audit import AuditLogMiddleware
from app.core.http_security import SecurityHeadersMiddleware
from app.api import auth, pacientes, citas, doctores, tratamientos, presupuestos, facturas, reportes, admin, pdf, documentos, laboratorio, consentimientos, clinicas, inventario, sync_import

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="Eurodent 2.0 API",
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
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.allowed_hosts_list:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

app.add_middleware(SecurityHeadersMiddleware)

# Audit log middleware (registra accesos a datos sensibles)
app.add_middleware(AuditLogMiddleware)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(pacientes.router, prefix="/api/pacientes", tags=["pacientes"])
app.include_router(citas.router, prefix="/api/citas", tags=["citas"])
app.include_router(doctores.router, prefix="/api/doctores", tags=["doctores"])
app.include_router(tratamientos.router, prefix="/api/tratamientos", tags=["tratamientos"])
app.include_router(presupuestos.router, prefix="/api/presupuestos", tags=["presupuestos"])
app.include_router(facturas.router, prefix="/api/facturas", tags=["facturas"])
app.include_router(reportes.router, prefix="/api/reportes", tags=["reportes"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(pdf.router, prefix="/api/pdf", tags=["pdf"])
app.include_router(documentos.router, prefix="/api/pacientes", tags=["documentos"])
app.include_router(laboratorio.router, prefix="/api", tags=["laboratorio"])
app.include_router(consentimientos.router, prefix="/api", tags=["consentimientos"])
app.include_router(clinicas.router, prefix="/api/clinicas", tags=["clinicas"])
app.include_router(inventario.router, prefix="/api/inventario", tags=["inventario"])
app.include_router(sync_import.router, prefix="/api/sync", tags=["sync"])
app.include_router(sync_import.import_router, prefix="/api/import", tags=["import"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
