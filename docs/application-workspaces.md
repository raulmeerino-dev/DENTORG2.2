# Superficies de trabajo de DentCore

La composición de la aplicación vive en `frontend/src/app/shell`. La navegación, clínica, usuario, asistente, En sala y estado de sincronización permanecen montados al cambiar de sección. El contenido central dispone de toda la altura restante; cada workspace gestiona su desplazamiento.

## Elegir una superficie

| Duración y contexto | Superficie | Implementación |
| --- | --- | --- |
| Horas de trabajo | Workspace | Jornada, Pacientes, Caja, Registros, Archivos, Administración y Ajustes |
| Minutos con paciente activo | Tarea dentro del shell | `TaskSurface`: consentimiento, receta y presupuesto; primera visita y odontograma en el área clínica |
| Segundos, una acción concreta | Overlay | `Dialog`, popover o drawer: cobro, dato del paciente, cita sencilla, documento adjunto |

Una tarea ocupa el área central, mantiene el paciente visible y vuelve a su ficha. No monta un backdrop ni atrapa el foco como un modal. Los diálogos rápidos sí retienen el foco, responden a Escape y lo devuelven al disparador.

## Sistema visual

- `design-system/tokens.css`: fuente canónica de color semántico claro/oscuro, spacing 4/8/12/16/24, radios 4/6/8, controles de 32 px y tamaños de texto.
- `design-system/foundation.css`: viewport, tipografía, controles y foco comunes.
- `design-system/components.css`: primitivas reutilizables. `task-surface.css` define la tarea dedicada.
- `design-system/compatibility-tokens.css`: nombres antiguos enlazados a tokens canónicos mientras existan consumidores.
- Los estilos de cada dominio viven junto a su flujo. No añadir una nueva capa global de overrides para modificar una superficie.

Las superficies migradas usan paneles continuos, divisores, tabs, toolbars y tablas. Las sombras quedan para overlays; las tarjetas se reservan para elementos realmente independientes. Rojo indica alerta/deuda, verde finalización/cobro, naranja planificación/espera y azul acción/información.

## Comportamientos conservados

- Jornada comparte fecha, profesional, gabinete, estado, búsqueda y cita seleccionada entre Operativa y Agenda. Los cambios rápidos se componen antes de actualizar la URL.
- La agenda representa tiempo y profesionales en una única parrilla, con duración proporcional, solapes en carriles y desplazamiento local. En móvil los filtros son desplegables y las columnas mantienen anchura legible.
- Pacientes mantiene Ficha, Tratamientos e Historial; los documentos, consentimientos y recetas permanecen contextualizados, sin nuevas pestañas principales.
- Caja conserva la emisión/cobro y muestra el paciente real; los saldos e informes se invalidan al cobrar. [Registros y Archivos](records-workspace.md) comparten consulta paginada, filtros, orden, detalle original y exportaciones completas. Los errores de red permanecen visibles.

## Verificación

Las pruebas reproducibles están en `frontend/e2e` y sus instrucciones en [e2e/README.md](../frontend/e2e/README.md). Incluyen un circuito con PostgreSQL y FastAPI reales: presupuesto aceptado → pendiente → cita → sesión → realizado → factura → cobro → saldo cero tras recargar.

Las capturas de revisión local se guardan en `output/playwright` (ignorado por Git). La revisión de esta entrega incluye datos densos, anchuras de 390, 768, 1024, 1280 y 1440 px, y temas claro y oscuro. El desplazamiento horizontal de una tabla o agenda densa pertenece a su región, no al documento entero.

No existía un periodontograma implementado en el frontend ni en el backend. Esta entrega reorganiza las herramientas clínicas existentes; no introduce un registro periodontal ni reglas clínicas nuevas. Cuando exista ese flujo, corresponde una tarea dedicada con paciente visible.
