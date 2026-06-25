# Manual de backups y restauracion

## Objetivo

Garantizar que una clinica puede recuperar datos tras error, borrado accidental, fallo de servidor o incidente de seguridad.

## Implementado

- Backup local cifrado con AES-GCM derivado de `BACKUP_ENCRYPTION_KEY`.
- Hash SHA-256 del fichero.
- Registro en `backup_registros`.
- Alcance diferenciado: `database`, `uploads` o `full`.
- El alcance `full` incluye snapshot de base de datos y ficheros bajo `uploads/`.
- Retencion registrada por backup.
- Endpoint admin para crear backup: `POST /api/admin/backups`.
- Endpoint admin para verificar: `GET /api/admin/backups/{backup_id}/verificar`.
- Endpoint admin para simulacion de restauracion: `GET /api/admin/backups/{backup_id}/simular-restauracion`.
- Endpoint admin para descarga protegida: `GET /api/admin/backups/{backup_id}/descargar`.
- Endpoint admin para registrar prueba real: `POST /api/admin/backups/{backup_id}/registrar-prueba-restauracion`.
- Copia externa automatica a `BACKUP_EXTERNAL_COPY_DIR` con verificacion de hash.
- Herramienta offline `python -m scripts.backup_tool` para verificar y extraer backups cifrados.

## Procedimiento operativo

1. Crear backup manual desde Admin o API.
2. Verificar que `estado=correcto` o `verificado`, `cifrado=true`, `alcance=full` y hay `hash_sha256`.
3. Ejecutar simulacion de restauracion.
4. Restaurar el backup en entorno aislado.
5. Registrar prueba de restauracion con resultado `ok`.
6. Confirmar que `ubicacion=local+external` y `destino_externo` contiene la etiqueta de custodia.
7. Registrar fecha, responsable, hash, ubicacion externa y resultado.

## Comprobacion por API

```bash
curl -H "Authorization: Bearer <token_admin>" \
  https://api.example.com/api/admin/backups

curl -H "Authorization: Bearer <token_admin>" \
  https://api.example.com/api/admin/backups/<backup_id>/verificar

curl -H "Authorization: Bearer <token_admin>" \
  https://api.example.com/api/admin/backups/<backup_id>/simular-restauracion

curl -X POST -H "Authorization: Bearer <token_admin>" \
  -H "Content-Type: application/json" \
  -d '{"resultado":"ok","notas":"Restaurado en entorno aislado el 2026-06-23"}' \
  https://api.example.com/api/admin/backups/<backup_id>/registrar-prueba-restauracion
```

## Configuracion de copia externa

`BACKUP_EXTERNAL_COPY_DIR` es una ruta tecnica privada: volumen montado, NAS, disco cifrado o carpeta sincronizada por un agente externo. No se devuelve al frontend.

`BACKUP_EXTERNAL_LOCATION` es una etiqueta visible para operadores, por ejemplo `NAS clinica cifrado diario`.

```env
BACKUP_ENCRYPTION_KEY=clave-larga-custodiada-fuera-del-servidor
BACKUP_EXTERNAL_COPY_DIR=/mnt/backup-dentorg2
BACKUP_EXTERNAL_LOCATION=NAS cifrado clinica
BACKUP_RETENTION_DAYS=180
```

El sistema rechaza destinos bajo `backups`, `uploads`, `public`, `static` o `dist`. Tras copiar, recalcula SHA-256 y solo marca `destino_externo` si coincide con el fichero local.

## Herramienta offline

Desde `backend`:

```bash
python -m scripts.backup_tool verify \
  --file /custodia/dentorg2-20260623.dentorg2bak \
  --expected-hash <sha256>

python -m scripts.backup_tool extract \
  --file /custodia/dentorg2-20260623.dentorg2bak \
  --expected-hash <sha256> \
  --output-dir /tmp/dentorg2-restore-kit
```

La extraccion genera:

- `database.json`: tablas serializadas para restauracion controlada.
- `uploads/`: documentos extraidos con rutas validadas.
- `restore-summary.json`: hash, alcance, fecha y conteos.

El directorio de salida debe estar vacio; la herramienta falla si detecta contenido previo para evitar mezclar restauraciones.

## Restauracion en entorno de prueba

1. Preparar servidor o contenedor aislado sin acceso publico.
2. Configurar la misma `BACKUP_ENCRYPTION_KEY` usada al crear el backup.
3. Descargar el backup desde el endpoint admin o copiarlo desde la custodia externa.
4. Ejecutar primero `python -m scripts.backup_tool verify`.
5. Ejecutar `python -m scripts.backup_tool extract` en una carpeta temporal.
6. Restaurar manualmente `database.json` en una base de datos nueva y copiar `uploads/` a una carpeta de prueba.
7. Validar login, pacientes, documentos, consentimientos, facturas PDF y auditoria.
8. Registrar el resultado en DentOrg2.

Si se pierde el servidor, recuperar primero la clave de backup custodiada fuera del servidor, luego el fichero externo mas reciente y finalmente restaurar en infraestructura limpia.

Si se pierde `BACKUP_ENCRYPTION_KEY`, los backups cifrados no son recuperables. Debe existir custodia externa segura de la clave.

## Pendiente tecnico

- Importador automatizado de `database.json` contra PostgreSQL aislado.
- Backup incremental o snapshot fisico PostgreSQL para volumen alto.
- Integracion con proveedor remoto gestionado con versionado propio.
- Prueba periodica automatizada de restauracion completa.

## Pendiente de configuracion

- Ruta segura de backups fuera de webroot.
- `BACKUP_EXTERNAL_COPY_DIR` apuntando a volumen externo o NAS cifrado.
- `BACKUP_EXTERNAL_LOCATION` como etiqueta visible, sin rutas internas.
- Custodia de `BACKUP_ENCRYPTION_KEY` fuera del servidor.
- Calendario diario y retencion.

## Pendiente de validacion externa

- RPO/RTO contractual.
- Retencion legal de backups con datos de salud.
- Procedimiento de destruccion segura.

## Riesgo si se lanza sin resolver

- Sin restauracion real probada, el backup puede dar falsa tranquilidad.
- Si se pierde `BACKUP_ENCRYPTION_KEY`, los backups cifrados no son recuperables.
