# Fase 8 - Dashboard y BI operativo

## Objetivo

Convertir Inicio y Listados en una vista util para direccion, recepcion y doctores, con datos reales del backend y filtrado por clinica.

## Backend

Endpoints nuevos o reforzados:

- `GET /api/reportes/dashboard`
- `GET /api/reportes/citas`
- `GET /api/reportes/doctores`
- `GET /api/reportes/tratamientos`
- `GET /api/reportes/ingresos`
- `GET /api/reportes/kpis`
- `GET /api/reportes/facturacion-mensual`
- `GET /api/reportes/pacientes`
- `GET /api/reportes/faltas`

Metricas principales:

- Citas por estado, asistencia, faltas, anulaciones y no-show.
- Pacientes nuevos.
- Facturacion emitida, cobrada, deuda viva y ticket medio.
- Presupuestos por estado, tasa de aceptacion y rechazo.
- Tratamientos mas realizados y produccion asociada.
- Actividad por doctor con estimacion de ocupacion.
- Pacientes con saldo pendiente.
- Serie mensual de facturado/cobrado.

## Frontend

La pantalla `Inicio` usa `GET /api/reportes/dashboard` y muestra:

- Citas del dia.
- Alertas operativas.
- Evolucion mensual.
- Deuda prioritaria.
- Actividad por doctor.
- Tratamientos top.
- Laboratorio pendiente.

La informacion economica amplia queda condicionada por la UI de admin, manteniendo la prioridad de doctores y auxiliares en agenda/paciente.

## Seguridad y compatibilidad

- Las consultas principales aplican filtrado por `clinica_id`.
- Se mantienen las rutas antiguas usadas por `Listados`.
- No se modifica estructura de base de datos en esta fase.

## Tests

Se anade un test funcional de BI que crea datos clinicos/economicos y verifica que `/api/reportes/dashboard` agregue facturacion, cobros, citas, tratamientos, doctores y deuda.
