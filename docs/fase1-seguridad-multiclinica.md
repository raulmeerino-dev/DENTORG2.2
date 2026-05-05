# Fase 1: seguridad, multi-clínica y auditoría

## Arquitectura revisada

- Backend FastAPI en `backend/app/api`, con routers por módulo: auth, pacientes, citas, doctores, facturas, documentos, consentimientos, laboratorio, inventario, reportes, clínicas y administración.
- Modelos SQLAlchemy en `backend/app/models`; migraciones Alembic en `backend/alembic/versions`.
- Frontend React/TypeScript en `frontend/src`, con módulos por pantalla y una capa API central en `frontend/src/lib/api.ts`.

## Permisos

Los permisos se centralizan en `backend/app/core/permissions.py`:

- `require_admin`
- `require_doctor_or_admin`
- `require_recepcion_or_above`
- `can_view_health_data`
- `can_modify_billing`
- `ensure_clinic_access`
- `resolve_clinic_id`
- `scope_select_by_clinic`

Roles contemplados:

- `admin`
- `doctor`
- `recepcion`
- `auxiliar`
- `paciente`

## Multi-clínica

La Fase 1 refuerza aislamiento en los flujos más sensibles:

- Pacientes: listado, detalle, edición, datos de salud, citas del paciente, faltas y referencias.
- Citas: listado, creación, detalle, edición, recordatorios, videollamada, anulación, telefonear y búsqueda de huecos.
- Doctores y horarios: listado, detalle y horarios filtrados por clínica.
- Facturas: listado, creación, detalle, receta, edición, anulación, líneas y cobros.
- Clínicas: CRUD admin y lectura acotada a la clínica del usuario.

Para compatibilidad con datos legacy, los registros antiguos sin `clinica_id` siguen siendo visibles para usuarios de clínica. Los registros con `clinica_id` distinto quedan bloqueados.

## Auditoría

La tabla `audit_log` conserva el hash encadenado existente y añade:

- `clinica_id`
- `user_agent`
- `accion` ampliada a 80 caracteres
- `tabla` ampliada a 80 caracteres

El middleware sigue auditando endpoints sensibles y se añade `backend/app/services/audit.py` para registrar eventos explícitos desde servicios/routers.

Endpoint admin:

- `GET /api/admin/auditoria`

Filtros:

- `desde`
- `hasta`
- `usuario`
- `accion`
- `entidad`
- `clinica_id`
- `limit`

## Validaciones

Se añaden validaciones Pydantic para pacientes:

- Email válido.
- Teléfono con formato básico válido.
- DNI/NIE opcional validado si se informa.
- Fecha de nacimiento no futura.

Se crean enums compartidos en `backend/app/schemas/enums.py` para roles, estados de cita, presupuestos, facturas, documentos, consentimientos y tratamientos.

## Migración

Nueva migración:

- `0017_fase1_seguridad_auditoria.py`

Aplica:

- Ampliación de enum `rol_usuario` con `auxiliar` y `paciente`.
- Campos de auditoría `clinica_id` y `user_agent`.
- Índice y FK de `audit_log.clinica_id`.

## Tests añadidos

En `backend/tests/test_pacientes_citas.py`:

- Un usuario de una clínica no puede leer ni listar pacientes de otra clínica.
- Un admin puede consultar eventos de auditoría desde `/api/admin/auditoria`.
