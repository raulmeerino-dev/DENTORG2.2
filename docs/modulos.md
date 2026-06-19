# Modulos funcionales

## Inicio

Dashboard operativo:

- Citas de hoy.
- Pacientes en clinica.
- Citas sin confirmar.
- Facturacion, cobros y deuda.
- Laboratorio pendiente.
- Top tratamientos y actividad por doctor para admin.

## Agenda

Flujo diario de recepcion y doctores:

- Vista diaria con slots segun horario real.
- Filtro por doctor o todas las agendas.
- Estados visuales: sin confirmar, mensaje enviado, confirmada, en clinica, en tratamiento, finalizada, cancelada y falta.
- Crear cita desde hueco libre.
- Click para editar/ver cita.
- Doble click para abrir ficha paciente.
- Click derecho con acciones rapidas.
- Buscar hueco por doctor/general, paciente, turno, rango y duracion.
- Telefonear/reubicar.
- Linea de hora actual.

## Pacientes

Pantalla principal clinica:

- Busqueda externa a la ficha para cambiar rapido de paciente.
- Ficha con datos en modo lectura y boton para editar.
- Primera visita para registrar estado inicial de boca.
- Odontograma visual.
- Presupuestos y planes.
- Tratamientos pendientes.
- Tratamientos realizados.
- Historial clinico/facturacion.
- Documentos/enlaces.
- Consentimientos.
- Laboratorio del paciente.

## Odontograma

- Denticion adulta FDI.
- Estado por pieza y superficie.
- Estados como sano, caries, obturacion, endodoncia, corona, implante, ausente, extraccion indicada, fractura, movilidad, pendiente y realizado.
- Historial de cambios.
- Conversion de planificaciones a presupuesto.

## Presupuestos y facturacion

- Presupuestos con estados: borrador, presentado, aceptado, rechazado y caducado.
- Lineas por tratamiento, pieza, caras, cantidad, descuento y total.
- Facturas con numeracion por clinica/serie.
- Pagos parciales.
- Deuda del paciente.
- PDFs de presupuesto/factura.
- RF/SIF/Verifactu con cadena, hash y PDF archivado.

## Consentimientos y circulares

- Plantillas versionadas.
- Generacion desde ficha del paciente.
- Edicion previa.
- Firma en pantalla/tablet.
- PDF firmado archivado.
- Revocacion con motivo.
- Circulares personalizadas para justificantes e informes administrativos.

## Documentos

- Subida y consulta desde ficha del paciente.
- Categorias: radiografias, escaneres, CBCT, fotos, informes, consentimientos, presupuestos, facturas, circulares y otros.
- Metadatos: fecha, tratamiento, doctor, notas y etiquetas.

## Laboratorio

- Trabajos por paciente, doctor, laboratorio y tratamiento.
- Estados desde pendiente hasta finalizado/corregir/cancelado.
- Fechas de envio, prevista y recepcion.
- Coste laboratorio, precio paciente, margen y estados de pago/cobro.

## Inventario

- Productos, proveedores, movimientos y pedidos.
- Alertas de stock bajo.
- Ajustes de stock con historico.

## Admin

- Clinicas.
- Usuarios, roles y permisos.
- Doctores, colores, porcentajes y horarios.
- Tratamientos y precios.
- Listados/reportes.
- Auditoria.
- Backups.
- Cumplimiento SIF/Verifactu.

## Portal paciente

Base actual:

- Ver proximas citas.
- Confirmar, cancelar o solicitar posponer.
- Ver documentos.
- Ver consentimientos.
- Firmar consentimiento en canvas.

Pendiente:

- Token publico seguro con expiracion o vinculacion directa de usuario paciente.
- Manifest/service worker PWA especifico.
