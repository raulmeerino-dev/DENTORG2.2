# Cierre de trabajo retomado — 25 de septiembre de 2026

Se recuperaron las peticiones interrumpidas y se contrastaron con los cambios ya presentes. Las correcciones posteriores del usuario prevalecen: el historial es clínico/económico, el lateral no repite etiquetas al pasar el ratón y no se reaplica la compactación global que se pidió deshacer.

## Entregado

- Sidebar: control de contracción solo con icono y nombre accesible, preferencia local, estado activo visible y navegación inferior accesible con scroll independiente a poca altura.
- Historial: tabla de tratamientos realizados, visitas con contenido clínico y movimientos económicos reales; detalle contextual, filtros, búsqueda y paginación. Documentación y auditoría conservan sus destinos. Ver [historial](patient-history.md).
- Tratamientos: diagnóstico, presupuestos, pendientes, sesión y visitas. Presupuestos manuales o por odontograma, alternativas, aceptación parcial y selección persistente en URL. Registro explícito de actos no presupuestados, importe real e integración con facturación sin emitir automáticamente. Ver [tratamientos](treatment-workspace.md).
- Asistente: inferencia real y llamadas nativas a herramientas, contexto validado, fuentes, revisión previa de escrituras, permisos y recibos idempotentes. Se conserva el dictado especializado. Ver [copilot](copilot.md).
- Las mejoras anteriores de Agenda, horarios, Jornada y cabeceras ya estaban implementadas en los commits anteriores; no se vuelven a rediseñar.

## Comprobaciones locales

- Frontend: 387 pruebas aprobadas con `npx vitest run --maxWorkers=2`. La concurrencia se limita para evitar saturación del equipo de revisión; no se aumentaron los timeouts ni se eliminaron comprobaciones.
- Backend: 224 pruebas aprobadas sobre PostgreSQL aislado, incluidas permisos, multi-clínica, confirmación del asistente, rollback, reintentos clínicos e importes cero/reales.
- Playwright: 11 recorridos aprobados, incluidos el circuito presupuesto → cita → realizado → confirmación de factura → cobro, Jornada, Agenda, Registros y Archivos. Diez usan API y PostgreSQL reales; uno valida el contrato de cita con respuestas controladas.
- TypeScript y build Vite, ESLint, Ruff y `git diff --check` correctos. Alembic tiene una sola cabeza, `0048`; la base local de revisión está en esa revisión.
- Chromium: 1366×768, 1440×900 y 1920×1080; además, sidebar a 1024×400 y 1024×240. Se revisaron los ocho destinos del lateral, persistencia, ancho ganado y ausencia de desbordamiento horizontal del documento.
- Primera visita, presupuestos, pendientes, sesión e historial: contenido inferior accesible. Historial denso de 123 registros sintéticos y visitas reales de prueba con y sin información dental. El odontograma solo aparece en el detalle pertinente.
- Modelo local Ollama: navegación a Agenda/Ajustes, búsqueda de paciente, continuidad hacia su historial, fecha lejana, ambigüedad y preparación de nota clínica. Las consultas ambiguas presentan candidatos y no eligen uno automáticamente.

## Límites de la comprobación

Los datos utilizados son sintéticos y pertenecen a bases locales separadas de la base de tests destructivos. No se han migrado ni borrado datos clínicos de producción. La migración nueva añade estado cifrado del asistente y conserva sus recibos si se retrocede la aplicación.

El modelo local puede tardar decenas de segundos y su comprensión no es infalible. La integración Responses se comprueba mediante pruebas de transporte, sin una llamada a una cuenta remota configurada. No se ha probado un micrófono físico. Estos límites no se presentan como funcionalidades verificadas en producción.

Los artefactos locales de revisión están bajo `output/qa` y `output/playwright` (ignorados por Git). La subida al repositorio no equivale a un despliegue en producción.
