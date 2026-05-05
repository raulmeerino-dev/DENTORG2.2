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
.\.venv\Scripts\python.exe -m pytest -q
```

Si se usa Docker/CI, `TEST_DATABASE_URL` puede apuntar a `localhost:5432` o al servicio `postgres`.

Cobertura actual:

- Auth: login correcto, login incorrecto, refresh token, acceso sin token y bloqueo de fuerza bruta.
- Pacientes: crear, listar, editar y bloqueo entre clinicas.
- Citas: crear, bloquear solapamiento, buscar hueco, recordatorio, reprogramar y anulacion.
- Portal paciente: resumen, citas, documentos, consentimientos y firma.
- Tratamientos/historial: registrar tratamiento clinico y filtrar por pieza.
- Presupuestos: crear, lineas, aceptar y facturar.
- Facturas/pagos: factura, pago parcial/completo y saldo.
- Inventario: productos, movimientos, proveedores, pedidos y alertas.
- Consentimientos: plantilla, firma, PDF y revocacion.
- Dashboard BI: agregados clinicos y economicos.
- Backups: creacion cifrada y verificable.
- Auditoria: consulta admin de eventos auditados.

## Frontend

El frontend usa:

- Vitest
- React Testing Library
- jsdom

Comandos:

```powershell
cd frontend
npm exec tsc -- --noEmit
npm test -- --run
npm run build
```

`npm test` ejecuta:

1. `tsc -b && vite build`
2. `vitest run`

Cobertura actual:

- Reglas de navegacion y roles.
- Login y 2FA opcional.
- Odontograma principal.
- Estado global de aplicacion.

## CI

Workflow: `.github/workflows/ci.yml`.

Backend:

- Levanta PostgreSQL 16.
- Instala backend con dependencias dev.
- Ejecuta `alembic upgrade head`.
- Ejecuta `alembic current`.
- Ejecuta `pytest -q`.

Frontend:

- Instala Node 22.
- Ejecuta `npm ci`.
- Ejecuta `npm test`.

## Limitaciones actuales

- En Windows local, `pytest` falla si `TEST_DATABASE_URL` apunta a `postgres:5432` y ese host no existe. Usar `127.0.0.1` con el puerto real del PostgreSQL local.
- `ruff` esta disponible como dependencia dev, pero aun no bloquea CI por deuda de formato previa.
- Vite avisa de chunk frontend grande; se puede resolver con code splitting por rutas en una fase de optimizacion.
