# Acuerdo de encargado de tratamiento (DPA) - borrador tecnico

No es contrato legal. Es una matriz tecnica para preparar el DPA de DentCore.

## Implementado

- DentCore puede operar como encargado para una clinica responsable del tratamiento.
- Aislamiento por `clinica_id`.
- Auditoria de accesos y cambios.
- Cifrado de campos personales y de salud seleccionados.
- Backups cifrados.
- Baja logica de documentos.

## Pendiente tecnico

- Export completo por clinica en formato portable.
- Bloqueo selectivo de datos por requerimiento legal.
- Registro de subencargados versionado en la app.
- Procedimiento tecnico de borrado final tras terminacion contractual.

## Pendiente de configuracion

- Identificar hosting, correo, almacenamiento, mensajeria y soporte.
- Definir ubicacion de datos y backups.
- Definir personal con acceso administrativo a produccion.
- Rotacion y custodia de claves.

## Pendiente de validacion externa

- Instrucciones documentadas del responsable.
- Clausulas de confidencialidad, subencargados, transferencias, auditorias y asistencia al responsable.
- Anexo de medidas tecnicas y organizativas.

## Riesgo si se lanza sin resolver

- Falta de contrato adecuado entre SaaS y clinica.
- Incertidumbre sobre subencargados y transferencias.
- Dificultad para demostrar cumplimiento ante inspeccion o reclamacion.
