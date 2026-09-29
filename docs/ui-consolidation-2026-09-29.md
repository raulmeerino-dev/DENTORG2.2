# Consolidación de UI e interacción — 29/09/2026

## Alcance ejecutado

Se conserva el shell, las rutas y las áreas existentes. Jornada y Agenda permanecen separadas en el lateral; la ficha mantiene Ficha, Clínica, Presupuestos e Historial, con una sola identidad en su cabecera. No se modifican modelos, contratos, permisos ni reglas clínicas/económicas.

- Menús compartidos con identidad del objeto, selección visible, acciones derivadas de los datos actuales, teclado, límites de ventana y devolución del foco. Inputs, textareas y selección de texto conservan el menú nativo. Abrir el menú no ejecuta servicios.
- Integración en citas/huecos, Jornada, salidas, cuentas/facturas/pagos, pacientes, pendientes, líneas presupuestarias, historial, documentos, Registros/Archivos e inventario. Se reutilizan los flujos de acción y confirmación existentes; las alternativas visibles permanecen.
- Odontograma contextual: hallazgos en diagnóstico, propuesta en presupuesto y preparación del formulario en sesión. Seleccionar una pieza o abrir su menú no registra un realizado. No se ofrece eliminar tratamientos consolidados.
- Menús de facturación del paciente consolidados, sin capturar el clic derecho de zonas vacías. Estilos anteriores sin consumidores retirados; menús de toolbar y objeto comparten tokens.
- Resumen de salud legible: no muestra `[object Object]` ni registros internos de valoración. Los datos originales se conservan y las valoraciones se consultan en Diagnóstico.

## Entorno

Frontend local en `127.0.0.1:5174`, API local en `127.0.0.1:8012/api`, PostgreSQL aislado `dentcore_realtime_test`. Datos sintéticos `REGQA`, `UIQA` y pacientes de cada circuito E2E; ninguna prueba contra producción. Se conservan las operaciones y trazas sintéticas de los circuitos.

## Recorridos de navegador

| Área | Comprobación realizada |
| --- | --- |
| Jornada y Agenda | Agenda densa, citas cortas/solapadas, menús de cita y hueco, formulario con fecha/hora/profesional correctos; filtros y recarga; llegada, atención, finalización y salida reales. |
| Paciente | Nombre largo único, cuatro pestañas, lateral expandido/compacto, búsqueda y selección por teclado. |
| Clínica y diagnóstico | Consulta de primera valoración y posteriores, pendiente vinculado a presupuesto, sesión y odontograma; preparación de realizado con pieza y sin guardado implícito. |
| Presupuestos | 23 líneas, acciones sobre la fila pulsada, teclado y botón de acciones, borrador conservado al cambiar de área, cancelación de edición. Circuito real de aceptación, programación y realizado. |
| Historial | 60 registros, detalle contextual y navegación relacionada; diferencias entre doctor y recepción. Circuito E2E verifica tratamiento, visita, pago y factura relacionados. |
| Documentos y recetas | 16 PDFs con nombres largos, apertura desde menú, pantalla documental y regreso con filtros; apertura y cancelación de formulario de receta y pedido de laboratorio. |
| Caja | Cuatro vistas, listados poblados y búsqueda sin resultados, menú por cuenta/factura, cobro de cargos sin factura y posterior emisión en el circuito sintético. |
| Registros y Archivos | Filtros combinados, orden, paginación, retorno al mismo presupuesto/consulta, CSV/XLSX comparados con la API, documentos y separación de permisos/clínicas. |
| Administración e inventario | Reportes cargados, listado denso, menú de producto abre sus movimientos sin registrarlos; Ajustes general y navegación secundaria. |
| Asistente | Panel, carga, respuesta a búsqueda del paciente sintético, entrada de texto y controles; tema claro/oscuro sin recarga. |
| Concurrencia | Dos sesiones reales: llegada remota, borrador conservado, rechazo de revisión obsoleta, reconexión y aislamiento de clínica. |

## Pruebas

- Suite Vitest completa: **80 archivos, 474 pruebas**. Después se añadieron **2 comprobaciones de permisos del menú de facturación**, ambas correctas; los 18 tests relevantes de menú, popover, facturación y Registros se repitieron correctamente.
- **16 casos E2E correctos** en las ejecuciones finales por suite: 12 existentes (incluido multiusuario) y 4 nuevos de interacción/viewport. Se corrigieron selectores anteriores al editor de presupuestos actual, la etiqueta de llegada y la URL fija del test con HTTP simulado. No se retiraron aserciones de datos, importes, relaciones ni persistencia.
- TypeScript/build y ESLint correctos. `git diff --check` sin errores de whitespace.
- Los nuevos E2E miden exactamente **1366×768, 1440×900, 1920×1080 y 1366×600** a escala normal. Verifican menú contenido en la ventana, ausencia de desbordamiento horizontal del documento, cabecera única y ausencia de escrituras al navegar/abrir menús. Capturas guardadas en `frontend/test-results/` (ignorado por Git).
- La inspección adicional con la extensión del navegador se hizo a 1365×768, 1440×900, 1920×1080 y 1365×600. El primer ancho se redondeaba por el zoom previo del perfil; no se interpretaron las franjas de captura remota como defectos del producto.

## Límites de la revisión

- El zoom aumentado del navegador no pudo verificarse de forma fiable con la extensión. Las resoluciones exactas y la ventana baja sí quedan cubiertas por Chromium E2E a escala normal.
- No se ejecutó impresión física, envío de recordatorios, firma de consentimientos, envío de recetas a proveedor, recepción de pedidos ni edición de usuarios/permisos. Se revisaron sus entradas y los componentes compartidos, sin afirmar validación integral de esas operaciones.
- No se forzaron fallos de red de cada pantalla ni todas las combinaciones de estados y roles. Errores/conflictos relevantes, permisos clínicos/económicos y reconexión están cubiertos por tests y recorridos indicados.
- No se ejecutó una suite backend separada: no hay cambios en backend ni contratos; los E2E sí utilizan FastAPI/PostgreSQL reales y comprueban respuestas y persistencia.
