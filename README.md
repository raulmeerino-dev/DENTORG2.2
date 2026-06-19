# DentOrg2.2

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
- Portal paciente: base para citas, documentos y firma de consentimientos.

## Arranque local

### Backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
$env:DATABASE_URL="postgresql+asyncpg://eurodent:eurodent_dev_pass@127.0.0.1:5434/eurodent2"
$env:JWT_SECRET_KEY="dev-secret-change-me"
$env:DB_ENCRYPTION_KEY="dev-encryption-key-min-32-chars"
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
9. Portal paciente basico.
10. Limpieza UX general.

Para preparar una salida comercial, revisar `Ajustes generales > Seguridad/Backups > Preflight comercial` y cerrar los puntos legales/fiscales indicados en la documentacion.
