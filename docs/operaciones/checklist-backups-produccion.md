# Checklist de backups para produccion

No certifica continuidad de negocio. Es una lista tecnica para revisar antes de usar DentCore con datos reales.

## Implementado

- [x] Backup cifrado con AES-GCM.
- [x] Clave dedicada mediante `BACKUP_ENCRYPTION_KEY`.
- [x] Hash SHA-256 e integridad verificable.
- [x] Alcance `database`, `uploads` y `full`.
- [x] Backup `full` con base de datos y documentos/uploads.
- [x] Descarga solo por endpoint admin.
- [x] Auditoria de creacion, descarga, verificacion, simulacion y restauracion registrada.
- [x] Estado de backup: creado/correcto, verificado, restauracion_probada o fallido.
- [x] Retencion registrada.
- [x] Preflight con bloqueo si no hay backup reciente/restauracion probada.
- [x] Copia externa automatica a `BACKUP_EXTERNAL_COPY_DIR` con hash coincidente.
- [x] CLI offline para verificar y extraer: `python -m scripts.backup_tool`.

## Pendiente tecnico

- [ ] Restauracion automatizada completa contra PostgreSQL aislado.
- [ ] Integracion directa con proveedor cloud/NAS con versionado gestionado.
- [ ] Alertas proactivas por backup fallido o antiguo.
- [ ] Prueba periodica programada de restauracion completa.
- [ ] Backups incrementales o snapshot fisico para volumen alto.

## Pendiente de configuracion

- [ ] `BACKUP_ENCRYPTION_KEY` fuerte, unica y fuera del repo.
- [ ] `BACKUP_EXTERNAL_COPY_DIR` configurado y probado contra volumen externo.
- [ ] `BACKUP_EXTERNAL_LOCATION` definido como etiqueta visible, sin ruta interna.
- [ ] Carpeta de backups fuera de `uploads`, `public`, `static` o `dist`.
- [ ] Permisos de filesystem restringidos al usuario del backend.
- [ ] Copia externa diaria con comprobacion de hash.
- [ ] Retencion aprobada por clinica.

## Pendiente de validacion externa

- [ ] RPO/RTO contractual.
- [ ] Politica de custodia de claves.
- [ ] Retencion y destruccion segura con asesor.
- [ ] Plan de continuidad ante perdida total del servidor.

## Riesgo si se lanza sin resolver

- Critico si no hay restauracion real probada.
- Critico si la clave de backup solo vive en el servidor.
- Alto si los backups no salen del servidor principal.
- Alto si los documentos/uploads no entran en la copia completa.
