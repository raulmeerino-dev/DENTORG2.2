# Checklist RGPD/LOPDGDD antes de produccion

No certifica cumplimiento. Es una lista tecnica y documental para revision externa.

## Implementado

- [x] Roles y autenticacion.
- [x] Aislamiento multi-clinica en endpoints principales.
- [x] Cifrado de campos sensibles de paciente.
- [x] Auditoria encadenada.
- [x] Portal paciente vinculado a `Usuario.paciente_id` o invitacion publica con token hasheado, expiracion y revocacion.
- [x] Backups cifrados con clave dedicada, hash, alcance completo, copia externa y simulacion de restauracion.
- [x] Herramienta offline de verificacion/extraccion para pruebas de recuperacion.
- [x] Registro tecnico de prueba de restauracion.
- [x] Baja logica documental.
- [x] Preflight tecnico de produccion.

## Pendiente tecnico

- [ ] Export completo del expediente del paciente.
- [ ] Registro interno de solicitudes de derechos.
- [ ] Bloqueo/limitacion de tratamiento.
- [ ] Alertas de seguridad.
- [ ] Automatizacion de restauracion real en BD aislada.
- [ ] Revision de logs para evitar datos sensibles.

## Pendiente de configuracion

- [ ] `ENVIRONMENT=production`.
- [ ] HTTPS real.
- [ ] `AUTH_COOKIE_SECURE=true`.
- [ ] `ALLOWED_HOSTS` cerrado.
- [ ] `FRONTEND_URL` real.
- [ ] Secretos fuertes fuera del repo.
- [ ] 2FA en admins.
- [ ] `BACKUP_EXTERNAL_COPY_DIR` en volumen externo/NAS cifrado y probado.
- [ ] `BACKUP_EXTERNAL_LOCATION` como etiqueta visible sin rutas internas.
- [ ] Custodia externa de `BACKUP_ENCRYPTION_KEY`.
- [ ] Procedimiento de entrega/revocacion de enlaces del portal.

## Pendiente de validacion externa

- [ ] Politica privacidad final.
- [ ] DPA/encargo tratamiento.
- [ ] Registro de actividades.
- [ ] Procedimiento derechos.
- [ ] Procedimiento brechas.
- [ ] Plazos de conservacion.
- [ ] Subencargados y transferencias.

## Riesgo si se lanza sin resolver

- Alto si no hay contrato/DPA, 2FA admin, backups restaurables o HTTPS.
- Medio si falta automatizacion de derechos pero existe procedimiento manual controlado.
