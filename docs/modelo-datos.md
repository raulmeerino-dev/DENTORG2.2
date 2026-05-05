# Modelo de datos

## Nucleos principales

### Clinicas y usuarios

- `clinicas`: sedes/clinicas.
- `usuarios`: cuentas, rol, estado, `clinica_id`, 2FA.
- `audit_log`: eventos sensibles con usuario, clinica, accion, entidad y cambios.

### Pacientes

- `pacientes`: datos administrativos, contacto, observaciones generales y datos de salud.
- Campos sensibles como DNI, telefono y email se almacenan cifrados cuando aplica.
- Relaciones principales: citas, historial, presupuestos, facturas, documentos, consentimientos.

### Agenda

- `citas`: paciente, doctor, fecha/hora, duracion, estado, recordatorio y cancelacion.
- `cita_cambios`: historial append-only de cambios.
- `citas_telefonear`: cola de pacientes pendientes de llamar/reubicar.
- `historial_faltas`: faltas y anulaciones relevantes.
- `horarios_doctor` y excepciones: disponibilidad semanal y dias especiales.

### Clinica dental

- `doctores`: profesionales, color de agenda, porcentaje, activo.
- `tratamientos_catalogo`: tratamientos editables, precio, IVA, familia, flags por pieza/caras.
- `historial_clinico`: entradas cronologicas vinculadas a tratamiento, doctor, pieza, estado, importe y factura.
- `odontograma`, `odontograma_pieza`, `odontograma_superficie`: estado visual y versionado de boca del paciente.

### Presupuestos y facturacion

- `presupuestos`: cabecera por paciente y doctor, estado y odontograma planificado.
- `presupuesto_lineas`: tratamiento, pieza, caras, precio, descuento, aceptado.
- `facturas`: serie/numero, estado, totales, huella, Verifactu/SIF.
- `factura_lineas`: conceptos, cantidad, base, IVA y subtotal.
- `cobros`/pagos: importes, forma de pago, anulaciones auditadas.
- `registros_facturacion`: RF append-only, secuencia, hash y cadena fiscal.
- `documentos_fiscales`: PDF fiscal emitido, hash y version de plantilla.

### Documentos, consentimientos y laboratorio

- `documentos_paciente`: archivos medicos y administrativos asociados a paciente.
- `consentimientos`: documentos generados, estado, firmas, hash y PDF resultante.
- `consentimiento_plantillas`: plantillas versionadas.
- `laboratorios` y `trabajos_laboratorio`: trabajos, estados, fechas, costes y cobros asociados.

### Inventario y backups

- `producto_inventario`, `proveedor`, `movimiento_stock`, `pedido_proveedor`, `pedido_linea`.
- `backup_registros`: historico de copias, estado, hash, tamano y ubicacion.

## Reglas de consistencia

- Facturas emitidas no se borran fisicamente; se anulan o rectifican.
- Cobros no deben borrarse sin contramovimiento o anulacion auditada.
- RF y auditoria son append-only.
- Los datos clinicos y fiscales se exportan separados salvo vinculos necesarios.
- Todo registro con `clinica_id` debe filtrarse por clinica activa del usuario.

## Migraciones relevantes

- `0017_fase1_seguridad_auditoria.py`: seguridad, auditoria y multi-clinica.
- `0018_odontograma_profesional.py`: odontograma profesional.
- `0019_agenda_avanzada_cambios.py`: agenda avanzada e historial de cambios.
- `0020_inventario_pedidos.py`: inventario, proveedores y pedidos.
- `0021_consentimientos_versionados.py`: consentimientos/firma.
- `0022_facturacion_flujo_clinico.py`: flujo de presupuestos, pagos y facturacion.
