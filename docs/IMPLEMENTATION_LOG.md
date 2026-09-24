# Registro de implementación de DentCore

Este documento registra lo realizado. El estado y el trabajo pendiente se consultan en `IMPROVEMENT_BACKLOG.md`.

## 2026-09-25 — Altura del shell y contexto clínico

El sidebar ocupa exactamente el viewport, conserva el logo y divide navegación diaria/secundaria. Los grupos no se contraen: cuando falta altura, toda la navegación se recorre dentro del sidebar sin mover el workspace. Agenda tiene acceso directo y comparte filtros con Jornada. Caja no aparece para doctor/auxiliar; Administración y Ajustes mantienen sus permisos existentes.

Primera visita utiliza un único scroll clínico, contexto compacto y navegación entre valoración, exploración y plan/guardar. El odontograma se abre bajo demanda, también en presupuestos. Historial pasa a cronología con resumen y detalle de visita; muestra piezas sólo a partir de vínculos reales. Los documentos coincidentes en fecha se distinguen de los registros vinculados. Se retira un panel histórico sin consumidores que montaba el odontograma completo.

La revisión real comprueba 1366×768, 1440×900 y 1920×1080, llegada al final de Primera visita y visitas con/sin información dental. El sidebar se prueba con administrador, recepción y doctor, además de alturas de 400, 256 y 240 px: todos los enlaces son alcanzables y el scroll central permanece independiente. Evidencias locales: `output/playwright/sidebar-*` y `clinical-*`.

TypeScript, build y ESLint correctos; 347 pruebas unitarias pasan con dos workers. Los once E2E existentes pasan entre la ejecución principal y las repeticiones dirigidas. Las regresiones detectadas y corregidas incluyen una transición de URL atrasada que perdía filtros de Jornada y la apertura automática de Primera visita al entrar en Tratamientos. Los fixtures E2E consultan límites de día con zona horaria explícita y eligen huecos dentro del horario para que las repeticiones no fallen por citas sintéticas de madrugada. Sin migraciones ni cambios de datos productivos.

## 2026-09-25 — Adaptación a zoom y ventanas pequeñas

Pacientes y tareas dedicadas permiten desplazar la cabecera junto al contenido cuando la ventana tiene poca altura. Caja, Registros y Archivos mantienen tablas y paginación accesibles aunque los filtros/resúmenes ocupen varias filas. Jornada conserva el acceso al calendario tras desplegar filtros. No se reduce la tipografía ni se ocultan funciones para simular que todo cabe.

Presupuestos reorganiza el editor en dos columnas en móvil, muestra nombres completos del catálogo y conserva una tabla legible con scroll propio. Los botones del pie de cita se reorganizan sin desbordarse. En sala usa FloatingPopover y respeta los límites de la ventana. El shell evita solapes en el perfil de doctor, que incorpora notificaciones adicionales.

Validación en Chromium real: 70 combinaciones de siete secciones y diez tamaños (1920×1080 hasta 320×256, incluyendo tamaños CSS equivalentes a zoom de escritorio del 125–400 %; no automatización del zoom nativo del navegador). Revisión adicional de agenda, presupuesto, consentimiento, cita, En sala y shell de doctor en claro/oscuro. Capturas locales `output/playwright/responsive-*`. Pasan 344 tests unitarios, TypeScript, build y lint; los once recorridos E2E pasan contando la repetición corregida del caso de presupuesto. Ese test ahora identifica el presupuesto sembrado por UUID, sin asumir que el paciente nunca tendrá otros borradores. Datos exclusivamente sintéticos del entorno local; sin cambios de backend ni migraciones.

## 2026-09-25 — Hover estable y overlays sin recorte

Corregidos desplazamientos de 1 px en acciones del paciente y elevaciones/escalados en controles de IA y odontograma. Las pestañas mantienen peso tipográfico estable; se conserva la posición anatómica de los dientes. El foco común queda dentro del control, retirando anulaciones y anillos exteriores heredados.

La toolbar de paciente se consolida en su dominio y elimina 50 reglas repetidas de CSS global. Dispone de 4 px de holgura vertical; en móvil sus cinco acciones caben como controles de 32 px con nombres accesibles. Se corrige el conflicto que dejaba visible el texto de Cobrar dentro de un botón de ancho de icono.

La primitiva `FloatingPopover` sustituye posicionamientos duplicados en acciones y búsqueda de paciente, historial/facturas, agenda, odontograma, fichaje, notificaciones y filtros de Registros. La capa superior evita el recorte por ancestros y las colisiones de z-index; tamaño y posición se ajustan al viewport. Se conserva el scroll de los workspaces. Escape cierra sólo el popover activo y restaura foco; se añade cobertura de teclado y selección dentro de un diálogo.

Verificado en navegador real con datos densos, escritorio/móvil y temas claro/oscuro, comparando geometría antes/durante hover y visibilidad de menús. Pasan 344 pruebas unitarias frontend y 11 E2E existentes sin cambiar aserciones; TypeScript, build y ESLint correctos. Evidencias locales: `output/playwright/hover-*` y `output/qa/hover-frontend-final.json`. Sin cambios de backend, datos clínicos ni operaciones económicas.

## 2026-09-25 — Registros, Archivos y consulta transversal

La navegación distingue Jornada, Pacientes y Caja del grupo secundario Registros, Archivos, Administración y Ajustes. Registros sustituye Listados con trece vistas SQL autorizadas, búsqueda tolerante, filtros por contexto, orden y paginación en servidor. Archivos reutiliza esa consulta para localizar documentación sin duplicar los originales del paciente. Las rutas antiguas mantienen redirecciones compatibles.

Cada resultado abre su registro original: cita con horario/profesional, presupuesto concreto, movimiento del historial, pendiente o producto. Los documentos se leen en una pantalla dedicada dentro del shell. Al regresar se conservan búsqueda, filtros, orden y página. Administración y Ajustes separan gestión del negocio y configuración; auditoría dispone de detalle individual restringido.

Excel, CSV, PDF e impresión comparten la consulta autorizada y exportan todas sus filas, sin limitarse a la página visible. Se comprueban tipos numéricos, texto que podría interpretarse como fórmula y documentos extensos. Los límites propios de Excel/PDF se comunican explícitamente sin truncar información. La auditoría registra la exportación sin almacenar búsquedas ni identificadores personales en su URL.

Se han alineado los permisos de consulta, descarga y previsualización del portal; la firma del propio paciente continúa disponible. No se crean tablas ni migraciones. La zona de la clínica llega desde autenticación y se comparte entre agenda, historial y reportes, incluyendo medianoche, días de 23/25 horas y la hora repetida del cambio de invierno. Los formularios rechazan una hora inexistente con un error visible.

La validación usa PostgreSQL aislado y datos sintéticos: 1.040 pacientes, 3.120 citas, planes, realizados, facturas, cobros, laboratorio, inventario y 208 PDFs en dos clínicas. Los recorridos reales comparan las 695 filas de una exportación filtrada contra la consulta y prueban permisos, navegación de regreso y detalle documental. Revisión visual en claro/oscuro y anchos de 390 a 1920 px. Los E2E se incorporan a CI; evidencias locales en `output/qa/records-final`, `output/playwright` y `frontend/output/playwright`.

Validación final: 342 pruebas frontend, 208 pruebas backend y 11 E2E de navegador correctos; TypeScript/Vite, ESLint, Ruff y `git diff --check` sin errores. Los E2E incluyen el circuito completo presupuesto → cita → acto clínico → factura → cobro. La API local queda ejecutándose con el código final y la base de pruebas aislada.

Arquitectura, reglas, límites y reproducción: [Registros y Archivos](records-workspace.md).

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
