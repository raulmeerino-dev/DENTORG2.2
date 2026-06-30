# Auditoria de estado actual DentCore

Fecha: 2026-06-25

## Resumen ejecutivo

DentCore esta funcionalmente muy avanzado para una clinica dental: cubre agenda, pacientes, tratamientos, presupuestos, realizados, historial, documentos, recetas, laboratorio, facturacion, caja, admin, auditoria, portal y backups. El producto ya no debe tratarse como prototipo.

La conclusion comercial es prudente: puede prepararse para piloto controlado, pero no debe venderse como SaaS general hasta cerrar preflight, restauracion real de backups, validacion legal/fiscal externa, CI completo y pruebas de flujo clinico-economico extremo a extremo.

## Ramas revisadas

- `main`: base estable, pero por debajo del nivel exigible para salida comercial completa.
- PR abierto: `codex/dentcore-security-clinic-ux` contra `main`, PR #1, draft.
- Rama de auditoria/correccion: `codex/commercial-readiness-audit`.

Comparacion del PR abierto contra `main`:

- 180 archivos modificados.
- 19.808 inserciones.
- 4.512 eliminaciones.

El PR aporta mucho valor, pero es demasiado ancho para merge directo sin separar riesgos. Mezcla seguridad, portal, backups, preflight, dictado, agenda, asistente, navegacion, CSS, tests y migraciones.

## Veredicto sobre el PR

No recomiendo mergear `codex/dentcore-security-clinic-ux` entero de una vez.

Orden recomendado:

1. Seguridad, permisos, portal, backups, preflight, migraciones y tests backend.
2. Flujo clinico: paciente activo, agenda, presupuesto, pendiente, realizado, historial, factura y cobro.
3. UX de pacientes/agenda y limpieza visual.
4. Asistente/dictado clinico, solo si el proveedor y el contrato de tratamiento de datos estan validados.

Antes de cada merge debe pasar `alembic upgrade head`, `ruff check app tests`, `pytest -q`, `npm run lint`, `npm test` y `npm run build`.

## Bloqueantes corregidos en esta rama

- Preflight comercial endurecido: ahora falla si CORS usa comodines o si produccion permite origenes HTTP.
- Preflight honesto: aunque todo lo tecnico este correcto, mantiene aviso de validacion legal/fiscal externa pendiente.
- Agenda sin exito ficticio en escrituras criticas: crear, reprogramar, cancelar y marcar falta propagan errores reales del backend.
- Cita vinculada a linea de presupuesto: `citas.presupuesto_linea_id` conserva trazabilidad entre presupuesto aceptado y agenda.
- Validacion backend de cita-presupuesto: la linea debe existir, pertenecer al mismo paciente y respetar acceso de clinica.
- Presupuestos sin lineas duplicadas activas por tratamiento, pieza y caras normalizadas.
- Test backend para cita vinculada a linea de presupuesto y rechazo de linea de otro paciente.
- Test backend para rechazo de linea duplicada en presupuesto.
- Test unitario de preflight para CORS, backups y validacion externa.
- Test frontend para cita desde paciente con linea de presupuesto y para errores reales en mutaciones criticas.
- E2E Playwright de navegador para guardar, refrescar y conservar cita vinculada a `presupuesto_linea_id`.
- Busqueda y paginacion server-side en Pacientes usando `q`, `limit` y `offset`.
- Comando offline `python -m scripts.backup_tool restore-check` probado para ensayar descifrado/extraccion/validacion de restore kit.

## Cubierto ya en el PR abierto

- Paciente activo canonicamente en URL mediante `?paciente_id=...`, con `sessionStorage` solo como apoyo de navegacion.
- Invalidaciones amplias del workspace de paciente tras cambios clinicos, economicos y documentales.
- Backups cifrados con hash, copia externa, verificacion, simulacion de restauracion y registro de prueba real.
- Portal paciente por invitacion/token con expiracion/revocacion.
- Baja logica documental y trazabilidad en acciones sensibles.
- Preflight admin expuesto en backend y UI.

## Riesgos pendientes

- La restauracion automatica de `database.json` contra PostgreSQL aislado sigue pendiente; existe verificacion/extraccion offline y registro de prueba real, pero no importador automatizado.
- Falta una prueba E2E con backend y PostgreSQL reales para "guardar, refrescar y comprobar que existe" en paciente, presupuesto, sesion realizada, factura y cobro. El flujo cita-presupuesto_linea_id ya tiene E2E de navegador con API mockeada y test backend cuando PostgreSQL esta disponible.
- El dictado/asistente debe quedar desactivado o limitado si no hay proveedor validado contractualmente para datos de salud.
- RGPD/LOPDGDD, DPA, consentimientos, SIF/VERI*FACTU, SLA y politica de backups necesitan validacion externa antes de venta.

## Prueba funcional minima antes de piloto

1. Crear paciente y comprobar que queda seleccionado tras refrescar navegador.
2. Crear primera visita y diagnostico en odontograma.
3. Crear presupuesto con una linea por pieza/caras; intentar duplicado y comprobar 409.
4. Aceptar presupuesto y pasarlo a trabajo pendiente.
5. Dar cita desde la linea pendiente y comprobar `presupuesto_linea_id`.
6. Marcar tratamiento realizado y comprobar cierre de pendiente e historial.
7. Facturar, cobrar parcial/completo y comprobar saldo.
8. Crear documento/consentimiento/receta y verificar historial.
9. Crear backup `full`, verificar, simular restauracion y registrar prueba real.
10. Ejecutar preflight y no avanzar si hay `fail`.

## Validacion ejecutada en esta auditoria

Comandos correctos:

- `python -m ruff check app tests scripts/backup_tool.py`: correcto.
- `python -m pytest tests/test_backup_tool.py tests/test_production_readiness.py -q`: 4 passed.
- `python -m pytest tests/test_assistant_llm_interpreter.py -q`: 10 passed.
- `python -m pytest -q`: 19 passed, 51 skipped por PostgreSQL de test no disponible.
- `npm run lint`: correcto.
- `npm run build`: correcto, con aviso de chunk grande.
- `npm test`: 31 test files passed, 201 tests passed, con aviso jsdom de navegacion no implementada.
- `npm run test:e2e`: 1 passed; guarda cita desde linea de presupuesto, refresca y conserva `presupuesto_linea_id`.
- `alembic heads`: una sola cabeza, `0042`.
- `alembic history -r 0038:head`: cadena lineal `0038 -> 0039 -> 0040 -> 0041 -> 0042`.
- PostgreSQL temporal Docker: `alembic upgrade 0041`, `alembic upgrade head`, `alembic current` en `0042 (head)` y `pytest tests/test_pacientes_citas.py -q`: 25 passed.
- `git diff --check`: sin errores de whitespace.
- CI actualizado para validar migracion real `0041 -> head` antes de `pytest`.

Comandos bloqueados por entorno:

- `npm ci`: Windows rechazo borrar el binario nativo de Rolldown con `EPERM`; se reparo el entorno con `npm install` y despues `npm run build`, `npm test` y `npm run test:e2e` pasaron.

## Criterio comercial

DentCore puede presentarse como piloto interno o demo profesional si el entorno no usa datos reales o si hay contrato y controles operativos. Para cobrar a clinicas reales se exige evidencia: CI verde, backup restaurado en entorno aislado, preflight sin `fail`, HTTPS, 2FA admin, roles revisados, auditoria activa y validacion legal/fiscal externa.
