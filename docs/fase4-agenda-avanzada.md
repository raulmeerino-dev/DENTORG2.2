# Fase 4 - Agenda avanzada

## Objetivo

Se consolida la agenda para recepción y clínica real: acciones explícitas, reprogramación segura, cancelaciones trazables, faltas/no-show y disponibilidad por horario del doctor.

## Backend

Nueva tabla:

- `cita_cambios`: historial append-only de acciones sobre cada cita.

Nuevos endpoints:

- `GET /api/citas/disponibilidad`
- `PATCH /api/citas/{cita_id}/reprogramar`
- `PATCH /api/citas/{cita_id}/estado`
- `POST /api/citas/{cita_id}/confirmar`
- `POST /api/citas/{cita_id}/cancelar`
- `POST /api/citas/{cita_id}/marcar-falta`
- `GET /api/citas/{cita_id}/cambios`

Mejoras:

- Validación de solape de doctor y gabinete.
- Validación de horario del doctor salvo urgencia u override admin.
- Cancelación y falta registran `historial_faltas`.
- Cancelación por reprogramación puede crear entrada en `citas_telefonear`.
- Cada cambio genera entrada en `cita_cambios` y en `audit_log`.

## Frontend

La agenda usa endpoints explícitos para:

- Confirmar cita.
- Cancelar cita con motivo.
- Marcar falta/no asistió.
- Refrescar llamadas pendientes si una cancelación crea reubicación.

La UI existente de clic, doble clic, clic derecho, estados visuales, búsqueda de hueco y paciente temporal se mantiene.

## Validación

- Tests backend amplían el flujo de cita: disponibilidad, reprogramación, confirmación, cancelación y consulta de cambios.
- El build y los tests frontend siguen pasando.
