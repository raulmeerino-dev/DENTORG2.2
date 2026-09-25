# Historial clínico y económico del paciente

El historial presenta actos clínicos realizados y movimientos económicos. No es
un registro general de actividad ni de auditoría. No modifica datos persistidos.

## Contenido

- Tratamientos con estado `realizado`, con pieza, profesional, observaciones y
  vínculos a sesión, presupuesto de origen y factura.
- Visitas con tratamiento realizado o nota clínica explícitamente vinculada.
  No basta el estado de la cita o una observación administrativa. No se incluyen
  citas futuras, canceladas ni ausencias.
- Facturas, rectificativas, cobros y anticipos. Las facturas en borrador no generan
  filas; las anuladas conservan su importe original y no muestran deuda activa.
- Documentos, consentimientos y presupuestos no tienen filas propias. Sus accesos
  se conservan en el detalle de los actos relacionados y en sus módulos originales.
  No se atribuye documentación a una visita solo por coincidir en fecha.
- El odontograma y la auditoría conservan su trazabilidad fuera de este índice.

Los filtros son Todo, Tratamientos, Visitas clínicas, Facturación y Cobros. La
búsqueda y los filtros de fecha, profesional, estado y pieza recorren todos los
registros cargados, con páginas de 50 filas y orden reversible.

## Economía

La franja de saldo utiliza el contrato existente `GET /pacientes/{id}/saldo`,
independientemente de los filtros: facturado, pagado (incluidos anticipos) y saldo
actual, distinguiendo deuda, cero y saldo a favor. No se almacena otro saldo.

El importe de tratamiento procede del acto clínico. Cobrado y pendiente de factura
proceden de la factura; el detalle incluye sus pagos. No se prorratean cobros entre
tratamientos ni se inventa un saldo acumulado histórico. Los anticipos del contrato
actual son pagos a cuenta sin factura vinculada; no se presentan como aplicaciones
a una factura ni como devoluciones si no existe tal movimiento. Las anulaciones
conservan importe y motivo, con cobro efectivo cero.

Las columnas y referencias económicas requieren `canManageBilling`; se mantienen
las autorizaciones existentes del servidor.

## Implementación y validación

Composición: `HistorialCompleto.tsx`; proyección y filtros: `history/historyRows.ts`;
detalle: `history/HistoryRowDetail.tsx`; visita: `clinical/history/VisitDetail.tsx`.
El workspace del paciente conserva el control del scroll vertical. En pantallas
estrechas las columnas secundarias pasan al detalle.

Pruebas unitarias de exclusión, visitas reales, notas, documentos contextuales,
rectificación, anulaciones, permisos, saldo, filtros, búsqueda, teclado y paginación.
Recorrido real de factura/presupuesto desde Registros. Validación visual con 123
registros clínicos/económicos entre 2022 y 2026, en Chromium, sin escribir los datos
de densidad en la base de datos.
