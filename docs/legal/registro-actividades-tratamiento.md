# Registro de actividades de tratamiento - borrador tecnico

No certifica cumplimiento. Debe revisarlo el responsable/asesor de cada clinica.

## Actividades identificadas

- Gestion de pacientes y ficha clinica.
- Agenda y comunicaciones de cita.
- Odontograma, diagnostico y tratamientos.
- Presupuestos, facturacion, cobros y anticipos.
- Recetas, consentimientos y documentos.
- Laboratorio/protesicos.
- Portal paciente.
- Auditoria, seguridad y backups.

## Implementado

- Modelos y endpoints para las actividades anteriores.
- Roles y permisos basicos.
- Cifrado de campos especialmente sensibles.
- Auditoria encadenada.
- Preflight tecnico.

## Pendiente tecnico

- Marcar categorias de datos por campo en el modelo.
- Exportar registro RAT desde Admin.
- Relacionar cada tratamiento con base juridica y plazo de conservacion.

## Pendiente de configuracion

- Identificar responsable, DPO si procede, encargados y subencargados.
- Definir ubicacion de tratamiento y backups.
- Definir canales de comunicacion con pacientes.

## Pendiente de validacion externa

- Base juridica exacta por actividad.
- Plazos legales sanitarios/fiscales aplicables por comunidad/autonomia si procede.
- Necesidad de EIPD.

## Riesgo si se lanza sin resolver

- Dificultad para justificar tratamientos de datos de salud.
- Falta de trazabilidad documental en una inspeccion.
