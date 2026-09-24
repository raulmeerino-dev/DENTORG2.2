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

### Controles y capas flotantes

Hover, foco y pulsación no cambian geometría: no desplazan ni escalan el control, ni alteran padding, grosor de borde, altura o peso tipográfico. El feedback usa color, fondo, borde reservado o sombra interior. El anillo de foco común se dibuja dentro del control para conservarlo en regiones con scroll. No anularlo con `outline: none` por módulo.

`design-system/FloatingPopover.tsx` posiciona menús y selectores en la [capa superior del navegador](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using), conservando su contexto DOM. Se ancla al control o al punto del menú contextual, limita tamaño al viewport, cambia de lado cuando falta espacio y se actualiza al redimensionar o desplazar. Escape cierra la capa activa y devuelve foco, sin cerrar el diálogo que la contiene; los menús admiten flechas y Home/End. Los textos `title` siguen utilizando los tooltips nativos del navegador.

No liberar indiscriminadamente el overflow de tablas, calendarios y workspaces para mostrar un menú. Usar la primitiva flotante; el scroll permanece en su región. La toolbar de paciente tiene una única fuente en `domains/patients/patient-actions.css`, con holgura vertical, etiquetas en escritorio e iconos con nombres accesibles y tooltips en móvil.

## Comportamientos conservados

- Jornada comparte fecha, profesional, gabinete, estado, búsqueda y cita seleccionada entre Operativa y Agenda. Los cambios rápidos se componen antes de actualizar la URL.
- La agenda representa tiempo y profesionales en una única parrilla, con duración proporcional, solapes en carriles y desplazamiento local. En móvil los filtros son desplegables y las columnas mantienen anchura legible.
- Pacientes mantiene Ficha, Tratamientos e Historial; los documentos, consentimientos y recetas permanecen contextualizados, sin nuevas pestañas principales.
- Caja conserva la emisión/cobro y muestra el paciente real; los saldos e informes se invalidan al cobrar. [Registros y Archivos](records-workspace.md) comparten consulta paginada, filtros, orden, detalle original y exportaciones completas. Los errores de red permanecen visibles.

## Verificación

En ventanas de hasta 600 px de altura, la cabecera y el contenido de Pacientes, tareas y Jornada pueden desplazarse dentro del workspace. Caja y Registros aplican también este comportamiento por debajo de 700 px de anchura: los resúmenes/filtros no pueden reducir la tabla a altura cero. Tablas y odontogramas conservan su desplazamiento horizontal local. Revisar siempre la llegada al último control y la paginación, no sólo la ausencia de overflow del documento. Los formularios de presupuesto se reorganizan en columnas; no obligan a desplazar campos horizontalmente.

Las pruebas reproducibles están en `frontend/e2e` y sus instrucciones en [e2e/README.md](../frontend/e2e/README.md). Incluyen un circuito con PostgreSQL y FastAPI reales: presupuesto aceptado → pendiente → cita → sesión → realizado → factura → cobro → saldo cero tras recargar.

Las capturas de revisión local se guardan en `output/playwright` (ignorado por Git). La revisión de esta entrega incluye datos densos, anchuras de 390, 768, 1024, 1280 y 1440 px, y temas claro y oscuro. El desplazamiento horizontal de una tabla o agenda densa pertenece a su región, no al documento entero.

No existía un periodontograma implementado en el frontend ni en el backend. Esta entrega reorganiza las herramientas clínicas existentes; no introduce un registro periodontal ni reglas clínicas nuevas. Cuando exista ese flujo, corresponde una tarea dedicada con paciente visible.
