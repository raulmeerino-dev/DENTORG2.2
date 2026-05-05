# Fase 9 - Portal paciente PWA basico

## Objetivo

Se ha creado una base estable para el portal paciente sin sustituir el flujo interno de clinica. El portal reutiliza pacientes, citas, documentos y consentimientos existentes, y mantiene aislamiento por clinica mediante las reglas de permisos actuales.

## Backend

Nuevo router `backend/app/api/portal.py`, montado en `/api/portal`:

- `GET /api/portal/me`
- `GET /api/portal/citas`
- `POST /api/portal/citas/{cita_id}/confirmar`
- `POST /api/portal/citas/{cita_id}/cancelar`
- `GET /api/portal/documentos`
- `GET /api/portal/consentimientos`
- `POST /api/portal/consentimientos/{consentimiento_id}/firmar`

En esta fase se usa `paciente_id` como selector seguro para previsualizacion desde usuarios autenticados de la clinica. Queda preparado para sustituirlo por invitaciones con token o vinculo directo `Usuario.paciente_id` cuando se active acceso real de pacientes externos.

## Frontend

La pagina `Mis citas` ahora funciona tambien en `/portal` e incluye:

- Selector de paciente para previsualizacion interna.
- Resumen compacto de citas, documentos y consentimientos pendientes.
- Confirmacion, cancelacion y solicitud de posponer cita.
- Lista de documentos con apertura/descarga.
- Lista de consentimientos con PDF y firma en pantalla mediante canvas.

## Seguridad

- Todos los endpoints requieren usuario autenticado.
- Se valida que la cita, documento o consentimiento pertenezca al paciente seleccionado.
- Se aplica `ensure_clinic_access` para evitar cruces entre clinicas.
- Las acciones sensibles quedan en auditoria y cambios de cita cuando aplica.

## Pendiente

- Login publico de paciente o invitaciones con token de expiracion.
- Campo relacional `Usuario.paciente_id` si se decide crear usuarios paciente persistentes.
- Instalacion como PWA completa con manifest/service worker especifico del portal.
