# Endurecimiento Tecnico

## Estado de calidad

- Backend: `ruff check app tests` queda como comprobacion obligatoria en CI.
- Frontend: `npm run lint` queda como comprobacion obligatoria en CI.
- Tests puros de PDF no fuerzan arranque de PostgreSQL; la base de datos de test se prepara solo cuando se solicita `db_session` o `client`.
- La generacion PDF queda centralizada en `backend/app/services/pdf_service.py`.

## Modulos grandes detectados

Estos archivos siguen funcionando, pero conviene partirlos por responsabilidad antes de seguir añadiendo funciones:

- `frontend/src/lib/api.ts`: capa API monolitica. Siguiente paso recomendado: dividir por dominio (`pacientes`, `agenda`, `facturacion`, `documentos`, `admin`).
- `frontend/src/modules/agenda/index.tsx`: agenda diaria, modal, contexto, telefono y busqueda de huecos viven juntos. Siguiente paso: extraer `AgendaGrid`, `AgendaContextMenu`, `TelefonoPanel` y hooks de disponibilidad.
- `frontend/src/modules/pacientes/index.tsx`: orquesta muchas pestañas y modales. Siguiente paso: extraer hooks `usePacienteActivo`, `usePacienteQueries` y acciones de facturacion.
- `backend/app/api/citas.py` y `backend/app/api/facturas.py`: routers largos. Siguiente paso: mover reglas de negocio a servicios (`agenda_service`, `billing_service`) y dejar routers finos.

## Reglas practicas para proximas fases

- Cada modulo nuevo debe tener al menos un test de servicio o endpoint.
- Toda generacion documental debe pasar por `pdf_service.py` o por un servicio especifico que reutilice sus helpers.
- Evitar efectos React que cambien estado sincronamente; usar callbacks o inicializadores cuando sea estado local.
- No mezclar cambios de UX con refactors tecnicos: primero extraer, despues modificar comportamiento.
- Antes de subir cambios: `ruff check`, `pytest` con PostgreSQL disponible, `npm run lint`, `npm run build`.

## Pendiente intencionado

- No se ha dividido aun `api.ts` ni los modulos grandes para evitar una refactorizacion amplia con riesgo funcional.
- No se ha activado typecheck Python estricto; `mypy` requeriria una fase separada por el tamaño actual de modelos y routers.
- No se han tocado interfaces visuales en esta fase.
