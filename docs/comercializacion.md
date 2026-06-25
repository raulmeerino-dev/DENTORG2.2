# Comercializacion y preparacion legal

Este documento resume el camino minimo para pasar de una aplicacion funcional a un producto comercializable para clinicas dentales.

## Estado objetivo

Antes de vender o desplegar en una clinica real debe existir evidencia de:

- Seguridad tecnica revisada.
- Aislamiento multi-clinica verificado.
- Auditoria de acciones sensibles.
- Dictado clinico configurado solo con proveedor validado contractualmente para datos de salud, o desactivado.
- Backups cifrados y restaurables.
- Copia externa y restauracion real registrada.
- Portal paciente por invitacion segura o usuario vinculado.
- Flujo fiscal SIF/VERI*FACTU validado por asesor fiscal.
- Documentacion RGPD/LOPDGDD validada por asesor juridico.
- Manual de usuario y soporte operativo.

## Preflight tecnico

El sistema incorpora un informe admin:

- `GET /api/admin/produccion/preflight`
- Frontend: `Ajustes generales > Seguridad/Backups > Preflight comercial`

El informe revisa:

- Entorno de ejecucion.
- Secretos JWT y cifrado.
- Hosts/CORS.
- Cookies de autenticacion.
- Eventos de auditoria.
- Backups.
- Portal paciente e invitaciones.
- Dictado clinico por IA: proveedor, limites, politica de no conservacion de audio y auditoria.
- Modo VERI*FACTU, datos fiscales, RF y eventos SIF.

Estados:

- `ok`: correcto para el entorno actual.
- `warn`: revisable antes de produccion.
- `fail`: bloqueante para salida comercial.

## Validacion legal externa

La aplicacion puede implementar controles tecnicos, pero la comercializacion requiere validacion externa:

- Contrato SaaS o licencia.
- Contrato de encargado de tratamiento.
- Politica de privacidad.
- Registro de actividades de tratamiento.
- Procedimiento de derechos de pacientes.
- Procedimiento de brechas de seguridad.
- Politica de conservacion y borrado/bloqueo.
- Acuerdo de soporte y nivel de servicio.

## Fiscal / SIF / VERI*FACTU

Antes de emitir facturas reales:

- Configurar NIF real de emisor y productor.
- Versionar producto y declaracion responsable.
- Probar alta, anulacion y rectificacion.
- Validar QR, huella, cadena y exportacion.
- Documentar remision y estados.
- Conservar registros y eventos fiscalmente relevantes.

## Producto sanitario

Si el software se limita a gestion administrativa, agenda, historia, documentos y facturacion, el riesgo regulatorio como producto sanitario suele ser menor.

Si se anaden funciones que recomienden diagnostico, pronostico o decisiones terapeuticas, debe revisarse MDR/Reglamento (UE) 2017/745 con especialista porque el software podria requerir clasificacion, expediente tecnico y marcado CE.

## Go-live minimo

Checklist recomendado:

- Preflight sin `fail`.
- Backup cifrado reciente y restauracion probada.
- Backup de alcance `full` con uploads/documentos incluidos.
- Copia externa verificada mediante `BACKUP_EXTERNAL_COPY_DIR` y hash coincidente.
- Extraccion offline probada con `python -m scripts.backup_tool extract`.
- Portal por invitacion probado con enlace valido, caducado y revocado.
- HTTPS/TLS configurado.
- 2FA activo para admin.
- Usuarios reales con roles revisados.
- Proveedor de dictado clinico revisado como encargado/subencargado de tratamiento si se activa IA externa.
- Migraciones aplicadas en copia de datos.
- Prueba de importacion de pacientes.
- Prueba completa de agenda, presupuesto, tratamiento, factura, cobro y PDF.
- Prueba de recuperacion ante perdida de sesion o caida del servidor.
- Manual de usuario entregado.
