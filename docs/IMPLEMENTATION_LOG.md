# Registro de implementación de DentCore

Este documento registra lo realizado. El estado y el trabajo pendiente se consultan en `IMPROVEMENT_BACKLOG.md`.

## 2026-09-24 — Workspaces y cierre de la transformación visual

El checkpoint `486f588` conserva el estado de la reorganización arquitectónica al retomar el trabajo. La entrega visual posterior establece un shell permanente, contexto compartido de Jornada, calendario proporcional por profesionales, ficha continua de paciente y superficies de tarea dentro del shell para consentimiento, receta, presupuesto y primera visita/odontograma. Caja, Listados, Ajustes, Reportes y WhatsApp usan toolbars, paneles y tablas con desplazamiento propio.

Los tokens y primitivas comunes viven en `frontend/src/design-system`; los estilos de cada flujo se encuentran en su dominio. Se han retirado más de 1.300 reglas obsoletas de las superficies migradas. El CSS global compilado baja de aproximadamente 483 a 299 kB, manteniendo únicamente la compatibilidad todavía consumida. [Detalle de las superficies](application-workspaces.md).

La validación con datos densos detectó y permitió corregir: coordenadas de la agenda sin estilos correspondientes, pérdida de filtros al alternar perspectivas, solapamientos sobre acciones de Pendientes/Sesión, selección de pacientes limitada a los primeros 50, contexto de hora UTC en la ficha y aislamiento de tareas por paciente. No se modifican tablas ni se ejecutan migraciones de datos como parte de la transformación visual.

Comprobaciones reproducibles: build TypeScript/Vite, ESLint, 321 pruebas unitarias frontend, 178 pruebas backend y Ruff; seis E2E de navegador, incluidos cinco recorridos reales contra FastAPI/PostgreSQL. El nuevo circuito comprueba presupuesto → aceptación → pendiente → cita → acto clínico → factura vinculada → cobro → saldo cero tras recargar. CI ejecuta también ese recorrido. Restauración ensayada en otra base aislada: 58 tablas, valores, claves foráneas y SHA-256 del adjunto verificados.

Revisión visual: temas claro/oscuro, escritorio de 1440/1280, tablet de 1024/768 y móvil de 390 px; agenda densa, listados con más de 50 pacientes y caja con 64 facturas sintéticas. Las capturas locales están bajo `output/playwright` y `frontend/output/playwright`, ignoradas por Git.

El repositorio no incluía un periodontograma. No se introduce un nuevo registro clínico periodontal en esta entrega. Las limitaciones de proveedores de receta y la validación legal de plantillas existentes se mantienen explícitas; esta entrega no certifica esos servicios.

## 2026-09-04 — Línea base de auditoría

**IDs completados:** ninguno; esta entrada establece la línea base previa a la implementación.  
**Cambios realizados:**

- creación de `PRODUCT_AUDIT.md`, `UX_AUDIT.md`, `ARCHITECTURE_AUDIT.md`, `FEATURE_GAP_ANALYSIS.md`, `IMPROVEMENT_BACKLOG.md` e `IMPLEMENTATION_LOG.md`;
- inventario funcional de backend, frontend, 254 operaciones API, 46 migraciones y documentación;
- recorrido real como administrador y recepción por Hoy, Agenda, Ficha, Tratamientos, Presupuestos, Historial, Caja, Reportes y Administración/Seguridad;
- registro de los P0/P1/P2/P3 con IDs estables, dependencias y criterios verificables;
- no se modificó código ni se alteraron datos clínicos durante esta fase.

**Decisiones tomadas:**

- conservar la navegación global de seis módulos; mejorar búsqueda y agrupación antes de considerar nuevas áreas;
- priorizar autorización, sesión, tenant, auditoría y recuperación sobre funciones nuevas;
- marcar la migración de `clinica_id=NULL` como `BLOCKED` hasta validar pertenencia de datos;
- no equiparar borrado, fiscalidad, consentimiento o receta con cumplimiento legal automático;
- usar `LEGAL_REVIEW_REQUIRED` en decisiones que necesiten validación externa;
- no ejecutar un refactor masivo de CSS/routers/componentes: extraer solo junto a cambios funcionales.

**Tests y comprobaciones ejecutados:**

- `backend/.venv/Scripts/python.exe -m ruff check app tests scripts` — correcto;
- `pytest -q` contra `dentcore_test` aislada — 152 passed;
- `pytest -q --cov=app` — 152 passed, 65% total;
- `npm run lint` — correcto;
- `npm test` — build TypeScript/Vite correcto, 40 test files y 250 tests passed;
- `npm run test:e2e` — 1 passed (API simulada);
- `npm audit --omit=dev --json` — 0 vulnerabilidades de producción reportadas;
- `pip check` — sin requisitos rotos;
- `alembic current` / `alembic heads` — `0045 (head)`;
- Docker: DB, backend y frontend saludables durante la revisión.

**Problemas encontrados:**

- autorización crítica incompleta en historial clínico legacy;
- logout/revocación no corta access tokens activos;
- registros sanitarios `clinica_id=NULL` compartidos por compatibilidad;
- fuga semántica de salud a recepción mediante observación general;
- posible bifurcación concurrente de la cadena de auditoría;
- preflight con restauración real no demostrada;
- E2E real del circuito clínico-económico inexistente;
- hotspots frontend/backend y cargas completas que limitan escala.

**Deuda técnica introducida:** ninguna conocida; solo documentación y artefactos diagnósticos ignorados bajo `output/`.

**Siguiente paso:** cambiar P0-001 a `IN_PROGRESS` antes de corregir el historial clínico y añadir sus pruebas de autorización.

## 2026-09-04 — Inicio de P0-001

**ID:** P0-001  
**Estado al iniciar:** `IN_PROGRESS`  
**Alcance:** cerrar lectura/escritura horizontal de los endpoints legacy de historial clínico, validar relaciones y añadir pruebas por rol/clínica. No incluye todavía rediseñar la visibilidad resumida del historial para recepción ni sustituir el borrado físico; esos trabajos permanecen separados en P1-001 y P0-005.

## 2026-09-05 — Fase A aprobada: fiabilidad y seguridad operativa

La petición aprobada de implementación sustituye el orden de selección anterior para esta entrega. Se limita a A1 (sesión), A2 (alertas clínicas) y A3 (cuenta del paciente), en ese orden. Las fases B–L permanecen pendientes. Se conservan los cambios locales previos de autorización de historial; no se atribuyen a esta entrega.

**Criterio actualizado durante A1:** terminar y estabilizar el bloque en ejecución; desde A2 evaluar cada área como KEEP / REFACTOR / REDESIGN / REBUILD / REMOVE. El workflow clínico correcto es la especificación. Se permite sustituir decisiones históricas justificadamente, con compatibilidad temporal, integridad, pruebas y eliminación de duplicados; no reiniciar lo completado ni realizar una reescritura global.

### A1 — Renovación de sesión — IN_PROGRESS

**Antes:** existe refresh con cookie HttpOnly rotatoria en el backend, pero el cliente solo lo usa al arrancar. Una petición con access token caducado termina en 401, sin recuperar la operación ni actualizar el estado de autenticación. Login tampoco conserva toda la ruta de retorno.

**Cambio previsto:** renovación silenciosa compartida entre peticiones concurrentes y arranque, un único reintento de la petición, exclusión de login/refresh/logout del bucle de renovación, limpieza de identidad/caché al expirar definitivamente y retorno seguro a ruta interna. La renovación conserva formularios montados; una nota clínica sin guardar podrá recuperarse en memoria únicamente para la misma identidad y clínica.

**Validación prevista:** regresiones de cookie/rotación/revocación en backend; concurrencia, error definitivo, ausencia de bucles y retorno en frontend; E2E de sesión y revisión en navegador. Ejecutar suites backend/frontend, Ruff, ESLint, TypeScript y build antes de abrir A2.
