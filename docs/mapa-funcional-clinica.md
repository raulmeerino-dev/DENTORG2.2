# DentOrg2 - Mapa funcional de gestion dental

Este documento organiza la aplicacion como programa clinico operativo, inspirado en flujos tipo Eurodent/Gesdent.

## Principio de producto

La ficha del paciente es el centro de trabajo. Desde ella se accede a:

- Datos administrativos y clinicos.
- Tratamientos realizados.
- Trabajo pendiente.
- Presupuestos y planes.
- Primera visita.
- Historial de facturacion.
- Documentos clinicos y fiscales.

La normativa fiscal queda integrada en la emision, archivo y trazabilidad, pero no como apartado visible para el trabajo diario.

## Roles

| Rol | Enfoque | Puede ver | Puede operar |
| --- | --- | --- | --- |
| Admin | Direccion, configuracion y control | Todo | Usuarios, ficheros maestros, caja, clinica, auditoria |
| Doctor | Trabajo clinico | Pacientes, agenda, historia, planes, laboratorio | Registrar clinica, presupuestos, trabajos y documentos clinicos |
| Recepcion | Agenda, pacientes y caja | Pacientes, agenda, cobros, listados operativos | Citas, llamadas, cobros, documentos administrativos |

La UI oculta o limita acciones por rol, pero la seguridad real debe estar siempre en backend.

## Modulos principales

### Pacientes

- Ficha administrativa densa.
- Alertas clinicas y observaciones.
- Tratamientos realizados.
- Trabajo pendiente.
- Presupuestos/planes con odontograma.
- Primera visita.
- Historial de facturacion.
- Documentos.

### Agenda

- Doctor/auxiliar.
- Calendario mensual.
- Vista diaria por slots.
- Pacientes pendientes de telefonear.
- Cambiar horario, buscar hueco, ocupacion e impresion.

### Listados

- Caja y facturas.
- Pacientes y saldos.
- Agenda por doctor.
- Actividad clinica.
- Trabajos de laboratorio.
- Cuadro de control diario.

### Ficheros

- Doctores y auxiliares.
- Gabinetes.
- Horarios y excepciones.
- Tratamientos y familias.
- Laboratorios/protesicos.
- Formas de pago.
- Entidades sanitarias.
- Documentos y plantillas.
- Usuarios y roles.

## Privacidad y seguridad

- Token de frontend en almacenamiento de sesion, no persistente.
- Descarga de documentos con `Cache-Control: no-store`.
- Respuestas API sensibles sin cache.
- Roles visibles en UI y reforzados en endpoints.
- Documentos y facturas emitidas se deben tratar como archivo no mutable.
- Accesos a historia, documentos, facturas y cobros deben quedar auditados.

## Flujo diario recomendado

1. Recepcion abre Agenda: confirma, reubica, busca huecos y revisa llamadas.
2. Doctor trabaja desde Pacientes: historia, odontograma, realizados y planes.
3. Recepcion cobra desde Historial Facturacion o Listados/Caja.
4. Admin revisa Ficheros y Listados: produccion, caja, saldos, actividad y permisos.

## Pendientes estructurales

- Agenda Fase 1 iniciada:
  - Clic en hueco libre abre modal de nueva cita.
  - Clic en cita abre modal de detalle/edicion.
  - Doble clic en cita abre la ficha del paciente.
  - Clic derecho en cita muestra acciones rapidas de estado, recordatorio, cancelacion y no asistencia.
  - Telefonear permite arrastrar paciente a un hueco de agenda.
  - Estados visuales actuales se apoyan en el enum existente: `programada`, `confirmada`, `en_clinica`, `atendida`, `anulada`, `falta`.
- Editor completo de ficheros maestros desde UI.
- Panel de auditoria visible solo para admin.
- Exportacion clinica separada de exportacion fiscal.
- Consentimientos con version y firma.
- Soft delete/anulacion para documentos no fiscales cuando aplique.
