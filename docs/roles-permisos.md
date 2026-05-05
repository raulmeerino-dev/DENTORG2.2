# Roles y permisos

## Roles

- `admin`: gestion total, configuracion, usuarios, clinicas, listados, auditoria, backups y cumplimiento fiscal.
- `doctor`: uso clinico principal, pacientes, agenda, historial, odontograma, tratamientos y consentimientos.
- `recepcion`: agenda, pacientes, citas, llamadas, cobros permitidos y flujo administrativo diario.
- `auxiliar`: apoyo clinico, pacientes, agenda, documentos y datos necesarios para asistencia.
- `paciente`: base para portal paciente futuro, acceso limitado a sus citas, documentos y consentimientos.

## Helpers backend

Los permisos se centralizan en `backend/app/core/permissions.py`:

- `CurrentUser`
- `require_admin`
- `require_doctor_or_admin`
- `require_recepcion_or_above`
- `ensure_clinic_access`
- `resolve_clinic_id`
- `scope_select_by_clinic`
- `can_view_health_data`
- `can_modify_billing`
- `ensure_can_modify_billing`

## Reglas por modulo

| Modulo | Admin | Doctor | Recepcion | Auxiliar | Paciente |
| --- | --- | --- | --- | --- | --- |
| Inicio | Si | Si | Si | Si | No |
| Agenda | Si | Si | Si | Si | Portal limitado |
| Pacientes | Si | Si | Si | Si | Solo propios futuro |
| Historia clinica | Si | Si | Limitado | Si | No |
| Facturacion/cobros | Si | No salvo permiso | Si | No | No |
| Documentos medicos | Si | Si | Segun flujo | Si | Solo publicados futuro |
| Consentimientos | Si | Si | Crear/gestionar segun flujo | Apoyo | Firmar propios |
| Inventario | Si | No | No | No | No |
| Listados | Si | Parcial si se habilita | Parcial caja | No | No |
| Configuracion | Si | No | No | No | No |
| Auditoria/backups | Si | No | No | No | No |

## Multi-clinica

Los usuarios no admin con `clinica_id` solo deben acceder a datos de su clinica. Los registros legacy sin `clinica_id` se toleran para compatibilidad, pero cualquier `clinica_id` distinto debe bloquearse.

## Auditoria obligatoria

Acciones sensibles que deben auditarse:

- Crear/editar/desactivar paciente.
- Acceso o cambio de historia clinica.
- Crear, reprogramar, cancelar o cambiar estado de cita.
- Crear/aceptar/rechazar presupuesto.
- Emitir, anular o rectificar factura.
- Registrar o anular cobro.
- Subir/descargar documento.
- Crear, firmar o revocar consentimiento.
- Cambios de usuarios, roles, clinicas y backups.

## Reglas de UI

- `Listados`, `Configuracion`, `Admin` y ajustes avanzados solo deben verse para `admin`.
- Agenda y Pacientes son las pantallas principales para doctores, auxiliares y recepcion.
- El portal paciente debe ser ruta separada y no exponer listados generales.
