# DentCore.2

Software web de gestion dental orientado a clinica, con flujo operativo parecido a Eurodent/Gesdent y stack moderno:

- Backend: FastAPI, SQLAlchemy async, Alembic, PostgreSQL.
- Frontend: React, TypeScript, Vite, React Query.
- Documentos/PDF: ReportLab.
- Seguridad: JWT, roles, aislamiento multi-clinica, auditoria y cifrado parcial de datos sensibles con pgcrypto.

## Modulos principales

- Inicio: dashboard operativo diario y BI resumido.
- Agenda: citas por doctor, huecos, telefono, estados visuales y recordatorios.
- Pacientes: ficha, primera visita, odontograma, presupuestos, pendientes, realizados, historial/facturacion, documentos y consentimientos.
- Admin: listados, configuracion, clinicas, usuarios/roles, tratamientos, horarios, inventario, laboratorio, auditoria, backups y cumplimiento fiscal.
- Portal paciente: invitaciones publicas con token expirado/revocable, citas, documentos y firma de consentimientos.

## Arranque local

### Backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
$env:DATABASE_URL="postgresql+asyncpg://eurodent:eurodent_dev_pass@127.0.0.1:5434/eurodent2"
$env:JWT_SECRET_KEY="dev-secret-change-me"
$env:DB_ENCRYPTION_KEY="dev-encryption-key-min-32-chars"
$env:BACKUP_ENCRYPTION_KEY="dev-backup-key-min-32-chars-change-me"
$env:BACKUP_EXTERNAL_COPY_DIR="C:\backups-dentcore-externos"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --reload
```

API docs en desarrollo: `http://127.0.0.1:8011/api/docs`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend local: `http://127.0.0.1:5173`.

## IA local con Ollama

DentCore Voice Assistant puede usar Ollama como proveedor LLM local gratuito. Descarga Ollama desde su web oficial: [ollama.com/download](https://ollama.com/download).

Los comandos simples de navegacion y borradores rapidos pasan primero por `FastCommandRouter` en frontend. Si el router local alcanza confianza alta, ejecuta al instante sin llamar a Ollama ni a OpenAI. Ollama/OpenAI solo interpretan ordenes complejas o ambiguas.

Configura el backend en modo automatico:

```powershell
$env:LLM_PROVIDER="auto"
$env:LLM_FALLBACK_ORDER="ollama,openai,mock"
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="qwen2.5:14b-instruct"
$env:OPENAI_MODEL="gpt-4o-mini"
```

Prepara el modelo:

```powershell
ollama pull qwen2.5:14b-instruct
ollama run qwen2.5:14b-instruct
```

El estado interno se puede comprobar en `GET /api/assistant/llm-health`. En `auto`, DentCore prueba Ollama local, despues OpenAI si `OPENAI_API_KEY` existe, y finalmente muestra un error seguro si no hay motor disponible: `No hay motor de IA disponible. Revisa Ollama u OpenAI.`

## Verificacion

```powershell
cd frontend
npm exec tsc -- --noEmit
npm test -- --run
npm run build
```

```powershell
cd backend
.\.venv\Scripts\python.exe -m py_compile app\main.py
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m scripts.backup_tool verify --file <backup.dentcorebak> --expected-hash <sha256>
```

Nota: los tests backend necesitan PostgreSQL accesible segun `TEST_DATABASE_URL`. En este entorno local ha fallado cuando el host `postgres:5432` no resuelve.

## Documentacion

- [Arquitectura](docs/arquitectura.md)
- [Modelo de datos](docs/modelo-datos.md)
- [Roles y permisos](docs/roles-permisos.md)
- [Modulos](docs/modulos.md)
- [Despliegue](docs/despliegue.md)
- [Testing](docs/testing.md)
- [Comercializacion y preparacion legal](docs/comercializacion.md)

## Estado actual

Se han completado las fases principales hasta UX general:

1. Seguridad, permisos, multi-clinica y auditoria.
2. Tests y CI.
3. Odontograma profesional.
4. Agenda avanzada.
5. Inventario y pedidos.
6. Consentimientos y firma.
7. Facturacion y pagos.
8. Dashboard/BI.
9. Portal paciente con invitacion segura.
10. Limpieza UX general.

Para preparar una salida comercial, revisar `Ajustes generales > Seguridad/Backups > Preflight comercial` y cerrar los puntos legales/fiscales indicados en la documentacion.
