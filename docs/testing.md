# Testing y CI

## Backend

Los tests backend usan:

- `pytest`
- `pytest-asyncio`
- `httpx`
- PostgreSQL de test

Comando local:

```powershell
cd backend
$env:DATABASE_URL="postgresql+asyncpg://eurodent:eurodent_dev_pass@127.0.0.1:5434/eurodent2_test"
$env:TEST_DATABASE_URL="postgresql+asyncpg://eurodent:eurodent_dev_pass@127.0.0.1:5434/eurodent2_test"
.\.venv\Scripts\alembic.exe upgrade 0041
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m pytest -q
```

Si se usa Docker/CI, `TEST_DATABASE_URL` puede apuntar a `localhost:5432` o al servicio `postgres`.

Cobertura actual:

- Auth: login correcto, login incorrecto, refresh token, acceso sin token y bloqueo de fuerza bruta.
- Pacientes: crear, listar, editar y bloqueo entre clinicas.
- Citas: crear, bloquear solapamiento, buscar hueco, recordatorio, reprogramar y anulacion.
- Portal paciente: resumen, citas, documentos, consentimientos y firma.
- Tratamientos/historial: registrar tratamiento clinico y filtrar por pieza.
- Dictado clinico: permisos, multi-clinica, tamano de audio, proveedor no configurado, transcripcion y guardado como nota.
- Presupuestos: crear, lineas, aceptar y facturar.
- Presupuestos/agenda: rechazo de lineas duplicadas y cita vinculada a linea de presupuesto del mismo paciente.
- Facturas/pagos: factura, pago parcial/completo y saldo.
- Inventario: productos, movimientos, proveedores, pedidos y alertas.
- Consentimientos: plantilla, firma, PDF y revocacion.
- Dashboard BI: agregados clinicos y economicos.
- Backups: creacion cifrada y verificable.
- Backups offline: `python -m scripts.backup_tool restore-check` descifra, extrae y valida un kit de restauracion en seco.
- Preflight comercial: CORS, backups y aviso de validacion externa.
- Auditoria: consulta admin de eventos auditados.

## Frontend

El frontend usa:

- Vitest
- React Testing Library
- jsdom

Comandos:

```powershell
cd frontend
npx playwright install chromium
npm run lint
npm exec tsc -- --noEmit
npm test -- --run
npm run build
npm run test:e2e
```

`npm test` ejecuta:

1. `tsc -b && vite build`
2. `vitest run`

Cobertura actual:

- Reglas de navegacion y roles.
- Login y 2FA opcional.
- Odontograma principal.
- Estado global de aplicacion.
- Dictado clinico: modal, estados de grabacion, error de microfono, transcripcion editable, guardado y descarte.
- Agenda: creacion desde Pacientes con paciente, tratamiento y linea de presupuesto precargados.
- API frontend: mutaciones criticas sin fallback demo de escritura.
- E2E Playwright: guardar una cita desde una linea de presupuesto, refrescar navegador y comprobar que existe conservando `presupuesto_linea_id`.

## CI

Workflow: `.github/workflows/ci.yml`.

Backend:

- Levanta PostgreSQL 16.
- Instala backend con dependencias dev.
- Ejecuta `ruff check app tests scripts/backup_tool.py`.
- Ejecuta `alembic upgrade 0041`.
- Ejecuta `alembic upgrade head`.
- Ejecuta `alembic current`.
- Ejecuta `pytest -q`.

Frontend:

- Instala Node 22.
- Ejecuta `npm ci`.
- Instala Chromium de Playwright con dependencias.
- Ejecuta `npm run lint`.
- Ejecuta `npm test`.
- Ejecuta `npm run test:e2e`.

El job backend valida migraciones como delta real: primero `alembic upgrade 0041` y despues `alembic upgrade head`.

## Limitaciones actuales

- En Windows local, `pytest` falla si `TEST_DATABASE_URL` apunta a `postgres:5432` y ese host no existe. Usar `127.0.0.1` con el puerto real del PostgreSQL local.
- Vite avisa de chunk frontend grande; se puede resolver con code splitting por rutas en una fase de optimizacion.
- Falta suite E2E de navegador con backend real para "guardar, refrescar y comprobar que existe" en paciente, presupuesto, cita, sesion realizada, factura y cobro.
