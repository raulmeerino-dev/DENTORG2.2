# Preflight comercial DentOrg2

Este preflight prepara una salida comercial inicial. No sustituye abogado, asesor fiscal, pentest ni validacion sanitaria.

## Comandos tecnicos

```bash
cd backend
alembic upgrade head
ruff check app tests
pytest -q
```

```bash
cd frontend
npm ci
npm run lint
npm run build
```

## Endpoint de preflight

```bash
curl -H "Authorization: Bearer <token_admin>" \
  https://api.example.com/api/admin/produccion/preflight
```

Debe revisarse que `overall` no sea `fail` antes de enseñar la app a una clinica piloto.

## Implementado

- Checks de entorno, secretos, cifrado, hosts, HTTPS, cookies, logs, 2FA admin, portal paciente, webhook WhatsApp, auditoria, backups, restauracion simulada, restauracion real registrada y fiscalidad.
- Portal publico por invitacion con token hasheado, expiracion y revocacion.
- Backup completo `full` con base de datos y uploads/documentos.
- Copia externa automatica a `BACKUP_EXTERNAL_COPY_DIR` con verificacion SHA-256.
- CLI offline de verificacion/extraccion de backup: `python -m scripts.backup_tool`.
- Documentacion base legal/fiscal/operativa.
- Tests de portal paciente, baja logica documental y backup dry-run.

## Pendiente tecnico

- Restauracion real automatizada en BD aislada.
- Integracion directa con proveedor externo con versionado y alertas.
- Export completo de paciente/clinica.
- Registro de solicitudes RGPD.
- Alertas de seguridad.
- Prueba end-to-end presupuesto -> pendiente -> realizado -> factura -> cobro en CI ampliada.

## Pendiente de configuracion

- Produccion con HTTPS.
- Secretos fuertes.
- 2FA admin.
- Backups externos.
- `BACKUP_ENCRYPTION_KEY`, `BACKUP_EXTERNAL_COPY_DIR` y `BACKUP_EXTERNAL_LOCATION`.
- Datos fiscales reales.
- Plantillas revisadas.

## Pendiente de validacion externa

- RGPD/LOPDGDD.
- DPA/contratos.
- VERI*FACTU/SIF.
- Textos clinicos y consentimientos.
- Seguro/responsabilidad y SLA.

## Riesgo si se lanza sin resolver

- No cobrar a clinicas reales si hay `fail` en preflight.
- No usar datos reales si no hay backups restaurables, HTTPS, DPA y validacion fiscal.
