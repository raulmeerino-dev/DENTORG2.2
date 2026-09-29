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
