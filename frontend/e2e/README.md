# Pruebas de navegador

`cita-presupuesto-linea.spec.ts` verifica el contrato de la pantalla con respuestas HTTP controladas. `jornada-real.spec.ts` usa Chromium, FastAPI y PostgreSQL reales, sin interceptar las peticiones del circuito.

La suite real crea pacientes y citas sintéticos, conserva el historial de cambios y selecciona huecos libres para admitir repeticiones. Nunca debe apuntar a una base clínica. Se activa explícitamente con `DENTCORE_REAL_E2E=1` y rechaza una URL de API no local.

## Runtime aislado

Usar PostgreSQL 16 local con una base independiente terminada en `_test`. No usar la base de `backend/.env`, ni la misma base que `pytest` (sus fixtures reconstruyen el esquema).

Ejemplo de servidor aislado con Docker, cuando el puerto 55434 esté libre:

```powershell
docker run --name dentcore-jornada-e2e -e POSTGRES_USER=dentcore -e POSTGRES_PASSWORD=dentcore_e2e_only -e POSTGRES_DB=dentcore_jornada_test -p 127.0.0.1:55434:5432 -d postgres:16
```

Desde `backend`, en una consola dedicada:

```powershell
$env:DATABASE_URL='postgresql+asyncpg://dentcore:dentcore_e2e_only@127.0.0.1:55434/dentcore_jornada_test'
$env:DB_ENCRYPTION_KEY='dentcore-e2e-db-key-local-only-32-chars'
$env:BACKUP_ENCRYPTION_KEY='dentcore-e2e-backup-key-local-only-32-chars'
$env:JWT_SECRET_KEY='dentcore-e2e-jwt-local-only'
$env:ENVIRONMENT='development'
$env:FRONTEND_URL='http://127.0.0.1:5173'
$env:CLINIC_TIMEZONE='Europe/Madrid'
./.venv/Scripts/python.exe -m alembic upgrade head
./.venv/Scripts/python.exe -m scripts.seed_demo
./.venv/Scripts/python.exe -m scripts.seed_jornada
./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Las claves anteriores son únicamente de desarrollo. Mantener la misma `DB_ENCRYPTION_KEY` al sembrar y al arrancar la API; cambiarla hace ilegibles los campos cifrados. Con un PostgreSQL local ya disponible, adaptar solo usuario, contraseña, puerto y nombre de la base aislada.

`seed_jornada` solo admite entorno `development`, servidor local y base con sufijo `_test`. Añade 48 pacientes y citas para el día actual, horarios de 09:00 a 20:00, nombres largos, cinco esperas, cuatro atenciones, tres salidas pendientes y una urgencia con solape. Repetirlo no reinicia visitas ni sobrescribe datos existentes.

Desde `frontend`, en otra consola:

```powershell
$env:DENTCORE_REAL_E2E='1'
node node_modules/@playwright/test/cli.js test --workers=1
```

Playwright arranca Vite en `127.0.0.1:5173` o reutiliza el servidor local. La API debe estar arrancada previamente. `DENTCORE_E2E_API_URL` permite cambiar la URL de las peticiones de preparación; la configuración de transporte de Vite debe apuntar a la misma API.

La zona de prueba predeterminada es `Europe/Madrid`, tanto para Node como para Chromium. Si se cambia `CLINIC_TIMEZONE` en la API, usar el mismo valor en `DENTCORE_E2E_TIMEZONE` al ejecutar Playwright.

Credenciales sintéticas: `recepcion / recep123`, `doctor / doctor123`, `admin / admin1234`.

## Cobertura real

- Llegada desde recepción sin navegación automática; hora persistida, reintento idempotente y una sola notificación al profesional.
- Abrir ficha desde En sala sin iniciar atención; iniciar desde Atender, finalizar clínicamente y resolver salida como recepción.
- Persistencia al recargar, marcas temporales e historial de cambios.
- Filtros de profesional, estado y búsqueda compartidos entre Operativa y Agenda y conservados al recargar.
- Paciente provisional sin teléfono; rechazo de solape ordinario; urgencia autorizada con motivo y persistencia del conflicto.
- Creación desde hueco real, conservando profesional y hora sin volver a pedirlos; gabinete mostrado cuando existe.

Los datos y trazas de cada ejecución quedan en la base aislada y `frontend/test-results/` (ignorado por Git). La suite de Jornada no sustituye al recorrido de navegador completo de presupuesto, acto clínico, factura y cobro.

El job `jornada-e2e` de CI levanta su propio PostgreSQL 16, aplica todas las migraciones, siembra datos sintéticos y arranca FastAPI. Activa expresamente la suite real y conserva trazas y log de API si falla; no usa secretos ni servicios de producción.

## Revisión visual

Abrir `/jornada` con los datos densos y revisar Operativa, Agenda y En sala en escritorio y móvil. Comprobar que los nombres largos, las acciones, la cola de salida y el formulario de cita quedan accesibles; la parrilla puede desplazarse dentro de su panel sin desbordar el documento.

## Ensayo de restauración

Crear una segunda base vacía llamada `dentcore_restore_<identificador>_test`. En `backend`, con la clave del backup disponible:

```powershell
./.venv/Scripts/python.exe -m scripts.backup_tool restore-isolated --file <backup.dentcorebak> --expected-hash <sha256> --output-dir <directorio-nuevo-del-kit> --database-url <postgresql+asyncpg://usuario:clave@127.0.0.1:55434/dentcore_restore_ensayo_test>
```

El comando verifica y extrae el backup, aplica migraciones a la base vacía e importa las tablas conocidas. Compara todos los valores, los recuentos y las claves foráneas; restaura las secuencias y conserva las restricciones. Los uploads quedan en el kit y se verifican por SHA-256. Rechaza bases remotas, la base configurada de la aplicación, destinos con tablas y kits con otro esquema. No cambia la base de la aplicación ni despliega los uploads restaurados.
