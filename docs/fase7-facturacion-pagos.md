# Fase 7 - Facturacion clinica y pagos

## Objetivo

Refuerzo del flujo economico real de la clinica sin sustituir el modulo fiscal existente:

- Presupuesto clinico con estados de trabajo: `borrador`, `presentado`, `aceptado`, `rechazado`, `caducado`.
- Aceptacion completa o parcial de lineas.
- Paso de lineas aceptadas a trabajo pendiente.
- Conversion de presupuesto aceptado a factura emitida.
- Factura emitida sellada con RF/SIF, huella, QR/PDF fiscal archivado y documento fiscal persistido.
- Pagos registrados como movimientos, con alias `/pagos` sobre el flujo de cobros existente.
- Saldo del paciente calculado desde facturas no anuladas y cobros no anulados.

## Cambios backend

- Nueva migracion `0022_facturacion_flujo_clinico.py`.
- `presupuestos.clinica_id` para filtrado multi-clinica.
- Nuevos valores de estado:
  - `estado_factura`: `borrador`, `pagada`.
  - `estado_presupuesto`: `caducado`.
- Endpoints reforzados:
  - `POST /api/presupuestos/{id}/presentar`
  - `POST /api/presupuestos/{id}/aceptar`
  - `POST /api/presupuestos/{id}/rechazar`
  - `POST /api/presupuestos/{id}/convertir-a-factura`
  - `POST /api/facturas/{id}/emitir`
  - `POST /api/facturas/{id}/pagos`
  - `GET /api/pacientes/{id}/saldo`

## Cambios frontend

- La pestaña de presupuestos permite presentar, aceptar, rechazar y facturar lineas aceptadas.
- La ficha del paciente consulta el saldo consolidado del backend cuando esta disponible.
- Al facturar o cobrar se invalidan presupuestos, facturas y saldo para mantener la pantalla actualizada.

## Criterios cubiertos

- Facturas emitidas siguen siendo inalterables por el flujo SIF/VERI*FACTU existente.
- Los pagos parciales dejan estado `parcial`; el pago completo deja estado `pagada`.
- El saldo del paciente ignora facturas anuladas y cobros anulados.
- Se mantiene compatibilidad con el estado historico `cobrada`.

## Pendiente recomendado

- Pantalla dedicada de finanzas con filtros y recibos por tratamiento.
- Aceptacion parcial visual por seleccion multiple de lineas.
- Auditoria especifica de presentar/aceptar/rechazar presupuesto si se quiere un rastro granular independiente del RF/SIF.
