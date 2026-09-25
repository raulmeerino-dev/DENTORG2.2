# Toolbars de DentCore

El shell mantiene el título de módulo junto a los controles globales. `ToolbarSlots` pertenece a `Layout`: los módulos aportan contexto mediante `ToolbarContribution` al slot `module`. React conserva el contexto y los handlers del módulo en el portal; al desmontarlo desaparecen sus controles, sin copiar estado clínico al shell.

`ContextToolbar` define la fila secundaria común. `ToolbarSearch`, `FiltersPopover`, `ActiveFilterChips` y `ToolbarMenu` comparten presentación. Los filtros conservan sus handlers y parámetros URL originales. `FloatingPopover` utiliza la capa superior del navegador para evitar clipping, también con selectores anidados.

En Jornada, el slot `actions` recibe las acciones de Operativa o Agenda sin trasladar sus consultas ni mutaciones. La búsqueda de pacientes de Operativa abre fichas; el filtro de citas de ese día queda explícitamente identificado dentro de Filtros. Agenda presenta una única búsqueda de citas. Fecha y modo se muestran en la cabecera global.

Pacientes conserva acciones y alertas contextuales, con el nombre activo en la cabecera. Caja conserva su lógica de selección y totales. Registros/Archivos agrupan filtros y exportaciones. Administración/Ajustes aportan el nombre de su sección actual; Reportes utiliza la misma fila secundaria.

Validación: TypeScript/build, ESLint, tests de composición y desmontaje de slots, filtros y navegación; navegador real con los ocho módulos a 1366×768, 1440×900, 1920×1080 y 900×600, sidebar expandido/compacto. E2E real de persistencia Jornada y de consultas/exportación Registros/Archivos (incluye 390 px). No hay cambios de rutas, permisos, backend ni migraciones.
