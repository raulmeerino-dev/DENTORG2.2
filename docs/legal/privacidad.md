# Politica de privacidad tecnica - borrador para revision

Este documento no es asesoramiento legal ni certifica cumplimiento RGPD/LOPDGDD. Es una base tecnica para que un asesor la revise antes de uso comercial.

## Alcance

DentOrg2 trata datos identificativos, contacto, agenda, historia clinica dental, odontograma, tratamientos, presupuestos, facturas, cobros, documentos, consentimientos, recetas, laboratorio, auditoria y portal paciente.

## Implementado

- Autenticacion con JWT de acceso y refresh token en cookie HttpOnly.
- Roles: admin, doctor, recepcion, auxiliar y paciente.
- Aislamiento multi-clinica mediante `clinica_id` en endpoints principales.
- Cifrado servidor para DNI/NIE, telefonos, email y datos de salud del paciente.
- Auditoria encadenada de accesos y operaciones sensibles.
- Documentos de paciente con baja logica y trazabilidad.
- Portal paciente vinculado a `Usuario.paciente_id`.
- Preflight tecnico de produccion en `/api/admin/produccion/preflight`.

## Pendiente tecnico

- Pantalla/flujo de exportacion de datos del paciente para derecho de acceso/portabilidad.
- Flujo especifico de bloqueo de tratamiento durante reclamacion o conservacion obligatoria.
- Evidencia tecnica de retencion y purgado controlado por categoria documental.
- Politica formal de minimizacion de logs con pruebas automatizadas.

## Pendiente de configuracion

- `ENVIRONMENT=production`.
- `FRONTEND_URL` HTTPS real.
- `ALLOWED_HOSTS` sin hosts locales.
- `AUTH_COOKIE_SECURE=true`.
- `JWT_SECRET_KEY` y `DB_ENCRYPTION_KEY` aleatorios y custodiados fuera del repo.
- 2FA activado para todos los administradores.
- Backups cifrados recientes y restauracion simulada correcta.

## Pendiente de validacion externa

- Textos finales de privacidad, base juridica, legitimacion por tipo de tratamiento y cesiones.
- Contratos con proveedores: hosting, correo, WhatsApp/SMS, pasarela de pago, laboratorio y soporte.
- Transferencias internacionales si hay proveedores fuera del EEE o subencargados.
- Evaluacion de impacto si el asesor la considera necesaria por datos de salud.

## Riesgo si se lanza sin resolver

- Informacion insuficiente al paciente o clinica cliente.
- Falta de evidencia ante ejercicio de derechos o brecha.
- Riesgo elevado por datos de salud si no se valida el ciclo de conservacion/bloqueo.
