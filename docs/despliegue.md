# Despliegue

## Requisitos

- Python 3.11 o superior.
- Node 22.
- PostgreSQL 16 recomendado.
- Extensiones PostgreSQL:
  - `uuid-ossp`
  - `pgcrypto`
- HTTPS/TLS delante del backend en produccion.

## Variables de entorno backend

Minimas:

```env
DATABASE_URL=postgresql+asyncpg://usuario:password@host:5432/dentcore
DB_ENCRYPTION_KEY=clave-larga-minimo-32-caracteres
JWT_SECRET_KEY=clave-jwt-larga-y-aleatoria
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=240
REFRESH_TOKEN_EXPIRE_DAYS=7
ENVIRONMENT=production
FRONTEND_URL=https://app.ejemplo.com
ALLOWED_HOSTS=api.ejemplo.com
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
CORS_ALLOWED_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Authorization,Content-Type,Accept,X-Request-ID
BACKUP_ENCRYPTION_KEY=clave-backup-larga-y-aleatoria
BACKUP_EXTERNAL_COPY_DIR=/mnt/backup-dentcore
BACKUP_EXTERNAL_LOCATION=NAS cifrado clinica
```

Clinica/PDF:

```env
CLINICA_NOMBRE=Clinica Dental
CLINICA_DIRECCION=Direccion
CLINICA_CIUDAD=Ciudad
CLINICA_TELEFONO=Telefono
CLINICA_EMAIL=email@clinica.com
NIF_EMISOR=B00000000
```

Seguridad:

- No usar secretos de ejemplo.
- No dejar CORS abierto.
- Configurar `ALLOWED_HOSTS` con el host real del backend.
- En produccion `AUTH_COOKIE_SECURE=true` es obligatorio porque el refresh token viaja en cookie HttpOnly.
- Definir `BACKUP_ENCRYPTION_KEY` fuerte y diferente de `DB_ENCRYPTION_KEY`.
- Mantener backups fuera del mismo servidor mediante `BACKUP_EXTERNAL_COPY_DIR`.
- Configurar `BACKUP_EXTERNAL_LOCATION` como etiqueta visible de custodia externa, sin exponer rutas internas.
- Proteger `uploads` y `backups` contra acceso publico directo.
- El portal paciente debe activarse mediante invitaciones con token expirado/revocable o usuarios `paciente` con `paciente_id` vinculado.

## Backend produccion

```powershell
cd backend
python -m pip install -e .
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

En produccion se recomienda ejecutar Uvicorn detras de un proxy inverso con HTTPS, logs y reinicio automatico.

## Frontend produccion

```powershell
cd frontend
npm ci
npm run build
```

El resultado queda en `frontend/dist`. Debe servirse con un servidor estatico o proxy.

Si el backend no esta en `http://127.0.0.1:8011/api`, definir:

```env
VITE_API_BASE_URL=https://api.ejemplo.com/api
```

## Base de datos

Antes de desplegar:

```powershell
cd backend
python -m alembic upgrade head
python -m alembic current
```

Para restauraciones, validar primero en entorno de pruebas.

## Backups

El sistema tiene registro de backups, pero la estrategia de produccion debe incluir:

- Backup diario automatico.
- Backup completo periodico.
- Copia cifrada fuera del servidor.
- Verificacion offline con `python -m scripts.backup_tool verify`.
- Extraccion de prueba con `python -m scripts.backup_tool extract`.
- Simulacion y prueba real de restauracion registradas.
- Retencion definida.
- Permisos para impedir borrado masivo por un atacante.

## Checklist antes de publicar

- HTTPS activo.
- CORS limitado al frontend real.
- `ENVIRONMENT=production`.
- `AUTH_COOKIE_SECURE=true`.
- `JWT_SECRET_KEY`, `DB_ENCRYPTION_KEY` y `BACKUP_ENCRYPTION_KEY` fuertes.
- `BACKUP_EXTERNAL_COPY_DIR` apuntando a volumen/NAS externo y probado.
- Portal paciente probado con invitacion caducada, revocada e invalida.
- Backup `full` reciente con base de datos y uploads.
- Restauracion probada en entorno aislado y registrada.
- PostgreSQL protegido y sin exposicion innecesaria.
- Usuarios admin revisados.
- Migraciones aplicadas.
- `npm run build` correcto.
- Tests backend/frontend correctos en CI.
- Validacion legal/fiscal externa antes de comercializar.
