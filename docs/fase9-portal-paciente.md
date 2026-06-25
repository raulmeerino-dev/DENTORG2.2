# Fase 9 - Portal paciente con invitacion segura

## Objetivo

Se ha creado una base estable para el portal paciente sin sustituir el flujo interno de clinica. El portal reutiliza pacientes, citas, documentos y consentimientos existentes, y mantiene aislamiento por clinica mediante las reglas de permisos actuales.

La primera version comercial usa invitaciones publicas con token aleatorio, no adivinable, asociado a `paciente_id`, `clinica_id`, proposito, expiracion y estado. El paciente no puede elegir ni modificar `paciente_id`.

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

Acceso publico por invitacion:

- `POST /api/admin/portal-invitations`: crea invitacion para admin/recepcion.
- `POST /api/admin/portal-invitations/{invitation_id}/revocar`: revoca invitacion.
- `POST /api/portal/public/validate`: valida token.
- `POST /api/portal/public/me`: resumen reducido del paciente.
- `POST /api/portal/public/citas`: proximas citas.
- `POST /api/portal/public/citas/{cita_id}/confirmar`.
- `POST /api/portal/public/citas/{cita_id}/cancelar`.
- `POST /api/portal/public/citas/{cita_id}/solicitar-cambio`.
- `POST /api/portal/public/documentos`: documentos permitidos sin rutas internas.
- `POST /api/portal/public/documentos/{doc_id}/descargar`: descarga protegida por backend.
- `POST /api/portal/public/consentimientos`: consentimientos pendientes.
- `POST /api/portal/public/consentimientos/{consentimiento_id}/firmar`.

Los endpoints publicos reciben el token en JSON, no como query param.

## Frontend

La pagina `Mis citas` funciona tambien en `/portal` para usuarios paciente autenticados.

La ruta publica `/portal/invite/:token` incluye:

- Validacion de invitacion.
- Estados de enlace invalido, caducado o revocado.
- Vista sin selector interno de paciente.
- Proximas citas.
- Documentos publicados.
- Consentimientos pendientes con firma en canvas.

La vista interna incluye:

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
- Los endpoints publicos no aceptan `paciente_id` ni devuelven rutas internas de archivo.
- El token publico se hashea en base de datos y se auditan validaciones, descargas, firmas y cambios de cita.
- Hay rate limiting basico por IP para validacion y uso de token publico.

## Pendiente

- Decidir si se mantienen invitaciones por enlace o se migra a cuentas paciente persistentes con `Usuario.paciente_id`.
- Politica operativa de envio de enlaces y revocacion.
- Canal seguro para entregar enlaces a pacientes.
- Instalacion como PWA completa con manifest/service worker especifico del portal.
