# Procedimiento de brechas de seguridad - borrador tecnico

No sustituye asesoramiento legal ni plan corporativo. Debe adaptarse a cada despliegue.

## Implementado

- Auditoria encadenada de accesos.
- Cabeceras de seguridad.
- Autenticacion con sesiones revocables.
- Rate limit de login y subida de documentos.
- Backups cifrados verificables.
- Preflight para detectar configuracion insegura.

## Pendiente tecnico

- Alertas automaticas por patrones anormales de acceso.
- Export de auditoria para investigacion.
- Playbook de rotacion de claves y cierre de sesiones masivo.
- Registro formal de incidentes dentro del Admin.

## Pendiente de configuracion

- Contactos de emergencia.
- Inventario de proveedores y subencargados.
- Canal de notificacion a clinicas.
- Retencion de logs y sincronizacion horaria.

## Pendiente de validacion externa

- Criterios de notificacion a autoridad y afectados.
- Plazos legales y contenido minimo de comunicacion.
- Coordinacion con encargado/responsable.

## Riesgo si se lanza sin resolver

- Respuesta lenta ante exposicion de datos de salud.
- Falta de evidencias para delimitar impacto.
- Notificaciones incompletas o fuera de plazo.
