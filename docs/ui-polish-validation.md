# Revisión UI/UX de DentCore — septiembre de 2026

Pasada de acabado visual sobre el shell y los workspaces existentes. Se consolidaron tablas, menús, superficies de diálogo, formularios y estados de carga; se retiraron estilos legacy trasladados a sus dominios. No hay migraciones ni cambios de reglas clínicas, económicas o de permisos.

## Cambios principales

- Design system: tablas compactas con importes alineados, estados semánticos, menús consistentes, diálogos y placeholders de carga compartidos.
- Jornada y Agenda: cabeceras compactas, calendario y formularios alineados, citas largas legibles y acceso al hueco libre junto a una cita cancelada/no presentada sin perder acceso al histórico.
- Paciente: nombre completo, historial con textos largos, presupuesto con catálogo desplegable y acciones secundarias agrupadas, visitas continuas y odontograma adaptable a ventanas reducidas.
- Documentos: gestión en una pantalla dedicada dentro del shell; subida breve en el diálogo común. Nombres de archivo completos.
- Caja: título, métricas, pestañas y pacientes alineados a 12 px del borde del workspace; separación vertical compacta y filas de salida adaptadas al ancho disponible, sin una card adicional.
- Registros: el popover se cierra al abrir filtros avanzados, evitando dos capas que compitan por el foco.
- Administración y Ajustes: formularios compactos, importes alineados, alertas de inventario visibles y acciones de backups agrupadas. Laboratorio usa el diálogo compartido.

## Revisión en navegador

Se hicieron dos recorridos por Jornada, Agenda, ficha, diagnóstico/primera visita, odontograma, presupuestos, pendientes, sesión, visitas, historial, documentos, consentimientos, recetas, Caja (cuatro vistas), Registros, Archivos, Administración, Ajustes y asistente IA. Se comprobaron overlays, menús, foco, vacíos, carga y errores disponibles en el runtime de prueba.

Resoluciones: 1366×768, 1440×900 y 1920×1080; además 1000×700 con navegación expandida y compacta. Se revisaron muestras en tema oscuro y se restauró el tema claro. El odontograma mantiene las 16 piezas de cada arcada visibles a 1000 px.

Datos sintéticos en PostgreSQL aislado: agenda densa, más de mil pacientes, miles de citas, facturas y documentos. `seed_ui_density.py` añade un paciente con nombre largo, 24 líneas de presupuesto, 60 entradas clínicas y 16 PDFs. La preparación se describe en `frontend/e2e/README.md`.

Las capturas locales están en `output/playwright/ui-polish/` (ignorado por Git). Evidencia final de Caja: `caja-margenes-1366-final.png` y `caja-margenes-1000-final.png`. Al recargar `/caja` directamente, el borde del workspace está en x=168 y título/pestañas/contenido en x=180; el documento no desborda horizontalmente.

## Validación automatizada

Desde `frontend`:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers 2
npm run build
npm run lint
```

- 76 archivos y 445 tests unitarios aprobados. Se limitó la concurrencia a dos workers para evitar saturación del entorno local.
- TypeScript y build de Vite aprobados; ESLint sin errores.
- Ruff aprobado para `frontend/e2e/fixtures/seed_ui_density.py`; `git diff --check` correcto.
- E2E con Chromium, API y PostgreSQL reales: circuito clínico/económico, Jornada, multiusuario y Registros/Archivos. La ejecución conjunta obtuvo 10 aprobados y detectó un hueco tapado por una cita cancelada. Tras corregirlo, se repitieron los cuatro E2E de Jornada y aprobaron. Quedan cubiertos los 11 escenarios distintos; no se presenta como una única ejecución conjunta de 11 aprobados.

Para repetir los E2E con el runtime local ya arrancado:

```powershell
$env:DENTCORE_E2E_URL='http://127.0.0.1:5174'
$env:DENTCORE_E2E_API_URL='http://127.0.0.1:8012/api'
$env:DENTCORE_REAL_E2E='1'
$env:DENTCORE_RECORDS_E2E='1'
$env:DENTCORE_MULTIUSER_E2E='1'
node node_modules/@playwright/test/cli.js test clinical-billing-real jornada-real multiuser-real records-real --workers=1
```

Los resultados corresponden al entorno local de pruebas. Esta revisión no certifica despliegue productivo ni sustituye pruebas fiscales o clínicas de aceptación.

## Jerarquía visual compartida — 29 de septiembre de 2026

Segunda pasada centrada en jerarquía y consistencia, sobre los mismos workspaces:

- Escala común: contexto de módulo/paciente de 18 px, secciones de 14 px, cuerpo de 13 px, información secundaria de 12 px y métricas de 20 px; pesos diferenciados en lugar de negrita uniforme.
- Controles compactos de 32 px y acciones auxiliares de 28 px. Nueva cita destaca en Pacientes; las utilidades documentales y de recepción usan un tratamiento secundario. Se conservan handlers, permisos y datos.
- Pestañas compartidas con indicador inferior en Pacientes, Tratamientos, Caja y configuración. Se eliminan las reglas anteriores sustituidas, incluidas las de botones y vacíos en hojas legacy.
- Encabezados de tabla más legibles, separadores suaves, fechas secundarias y nombres de paciente destacados. Los iconos de ordenación y apertura mantienen su ancho incluso en tablas densas.
- Cabecera adaptable a nombres largos, separación en la ficha, formularios de ajustes y resúmenes de Jornada, Caja, reportes, documentos y asistente. Se mantienen colores de deuda, advertencia y estado.

Validación de esta pasada: TypeScript/build y ESLint aprobados; 76 archivos / 445 tests unitarios aprobados con `node node_modules/vitest/vitest.mjs run --maxWorkers 2`. Tras los ajustes finales de CSS se repitieron build y lint; `git diff --check` correcto.

En Chrome se recorrieron Jornada (todos y una profesional), Agenda densa y diálogo de cita, ficha con nombre largo, historial de 60 entradas, presupuesto de 24 líneas, las cuatro vistas de Caja, Registros, Archivos con 224 resultados, reportes, ajustes de profesionales y panel del asistente. En Jornada el filtro mostró 12 citas activas, 9 sin confirmar y 2 pacientes en clínica para la profesional seleccionada; se restauró Todos. No se guardaron formularios ni se ejecutaron cobros o cambios clínicos.

Se comprobó la cabecera del paciente a 1024 px: el nombre ocupa dos líneas con 8 px de margen superior dentro de una cabecera de 64 px. A 520 px no existe desbordamiento horizontal del documento y el workspace queda debajo de la cabecera. El contraste de los tokens se comprobó también en oscuro y se restauró el tema claro y el tamaño normal del navegador. Capturas locales de esta pasada en `tmp/screenshots/ui-hierarchy/` (ignoradas por Git); la captura completa de Chrome fue intermitente y se usaron capturas de región para las evidencias disponibles.

## Navegación del paciente — 29 de septiembre de 2026

- Cuatro áreas principales: Ficha, Clínica, Presupuestos e Historial. Clínica conserva Diagnóstico, Pendientes, Sesión actual y Visitas; Presupuestos reutiliza su editor, catálogo y odontograma en un área independiente.
- Cabecera con breadcrumb pequeño y nombre del paciente como título principal. Historia, edad, teléfono y próxima cita se muestran junto al nombre cuando hay datos. Se retira el título redundante del módulo.
- Se conservan los enlaces existentes, incluido el alias `tab=tratamientos`, la selección de presupuesto y la última sección clínica al alternar entre áreas. Diagnóstico mantiene visibles las cuatro pestañas principales.
- No se modifican contratos API, permisos, reglas clínicas o económicas, ni los handlers del editor de presupuestos.

Validación automatizada: 6 archivos / 51 tests aprobados de PacientesPage, PacientesFlow, FichaPaciente, ClinicalWorkspace, TrabajoPendiente y recordTargets. Cubren los cuatro accesos principales, alias, enlace a presupuesto, Atrás/Adelante y creación de presupuesto con APIs simuladas. TypeScript/build y ESLint aprobados; diff sin errores de espacios. Se actualizó el selector de Clínica en el E2E existente; no se repitió el circuito económico real para este cambio de navegación.

En Chrome con API y datos sintéticos reales se revisaron Ficha, Diagnóstico, Pendientes, Sesión actual, Visitas, Presupuestos e Historial. El presupuesto de 24 líneas conserva su estado rechazado y sus acciones bloqueadas; el borrador permite abrir catálogo y odontograma de planificación. Se verificó la recarga del enlace directo a un presupuesto y la vuelta a Visitas después de alternar entre Clínica y Presupuestos. Historial mantiene sus 60 registros. No se guardaron cambios clínicos ni económicos.

Cabecera y pestañas comprobadas con nombre largo a 1365 y 520 px de ancho CSS, sin desbordamiento horizontal del documento; a 520 px las cuatro pestañas caben en una fila. Se restauró el viewport normal. Evidencia local: `tmp/screenshots/patient-navigation/ficha.png` (ignorada por Git); la captura de Chrome sigue siendo intermitente con viewport sobrescrito.
