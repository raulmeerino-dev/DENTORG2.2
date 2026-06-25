# Politica de conservacion, bloqueo y borrado - borrador tecnico

No fija plazos legales definitivos. Debe revisarse con asesor sanitario/fiscal.

## Implementado

- Pacientes se desactivan; no se eliminan fisicamente desde el endpoint principal.
- Documentos se dan de baja logicamente y conservan ruta y auditoria.
- Facturas, cobros y registros SIF usan estados/anulaciones en lugar de borrado libre.
- Auditoria append-only con cadena hash.

## Pendiente tecnico

- Tabla de retencion por categoria: historia, facturas, consentimientos, recetas, documentos, logs y backups.
- Estado de bloqueo por solicitud o litigio.
- Job de purgado seguro cuando finalice plazo y no haya obligacion de conservacion.
- Evidencia de destruccion/anonimizacion.

## Pendiente de configuracion

- Plazos por jurisdiccion y tipo documental.
- Politica de backups fuera de plazo.
- Responsables de aprobacion de borrado.

## Pendiente de validacion externa

- Plazos sanitarios y fiscales aplicables.
- Equilibrio entre supresion RGPD y conservacion clinica/fiscal.
- Procedimiento para menores y representantes.

## Riesgo si se lanza sin resolver

- Borrado prematuro de documentacion clinica/fiscal.
- Conservacion indefinida sin justificacion.
- Incapacidad para responder correctamente a derechos de supresion/limitacion.
