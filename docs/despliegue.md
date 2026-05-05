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
DATABASE_URL=postgresql+asyncpg://usuario:password@host:5432/dentorg2
DB_ENCRYPTION_KEY=clave-larga-minimo-32-caracteres
JWT_SECRET_KEY=clave-jwt-larga-y-aleatoria
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=240
REFRESH_TOKEN_EXPIRE_DAYS=7
ENVIRONMENT=production
FRONTEND_URL=https://app.ejemplo.com
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
- Configurar `ALLOWED_HOSTS` si se expone a internet.
- Mantener backups fuera del mismo servidor si es posible.
- Proteger `uploads` y `backups` contra acceso publico directo.

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
- Prueba de restauracion.
- Retencion definida.
- Permisos para impedir borrado masivo por un atacante.

## Checklist antes de publicar

- HTTPS activo.
- CORS limitado al frontend real.
- `ENVIRONMENT=production`.
- `JWT_SECRET_KEY` y `DB_ENCRYPTION_KEY` fuertes.
- PostgreSQL protegido y sin exposicion innecesaria.
- Usuarios admin revisados.
- Migraciones aplicadas.
- `npm run build` correcto.
- Tests backend/frontend correctos en CI.
- Validacion legal/fiscal externa antes de comercializar.
