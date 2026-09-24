# Registros y Archivos

Jornada, Pacientes y Caja ocupan la navegación diaria. Registros, Archivos, Administración y Ajustes forman el grupo secundario. Las rutas antiguas `/listados`, `/admin-extras`, `/configuracion` y `/dashboard` mantienen redirecciones compatibles. Inventario, clínicas, indicadores e importación pertenecen a Administración; usuarios, catálogos, horarios, documentos y seguridad, a Ajustes.

## Consulta y detalle

`frontend/src/domains/reporting` contiene un único workspace con dos perspectivas: consulta de registros y archivos. El catálogo del servidor determina vistas, columnas, filtros y exportaciones disponibles. Fecha, paciente, profesional y estado aparecen cuando corresponden; los filtros adicionales se abren en un diálogo breve. Búsqueda remota y paginación SQL evitan cargar todos los pacientes en el navegador. La URL conserva búsqueda, periodo, selección, orden y página, también tras abrir un detalle y regresar.

Los resultados llevan destinos tipados: cita en Jornada con fecha y profesional; paciente en su ficha; presupuesto concreto en su tarea; factura/cobro/realizado/laboratorio en el grupo original del historial; pendiente en su área clínica; producto en Inventario. Documentos, consentimientos y recetas se consultan en una tarea de lectura dentro del shell, con paciente visible y acceso al archivo original. El detalle de auditoría usa un overlay de consulta y requiere administrador.

## Fuente canónica y permisos

`backend/app/domains/reporting/application/registros*.py` reúne proyecciones SQL de las tablas existentes. No crea tablas clínicas, copias financieras, migraciones ni SQL generado por IA. El vocabulario de vistas y filtros es cerrado. Búsqueda tolerante a mayúsculas, acentos y espacios; `%` y `_` se buscan literalmente. La identificación personal se utiliza únicamente en búsquedas autorizadas y no se añade indiscriminadamente a las columnas exportables.

- Personal: pacientes, citas y datos de planes según permisos.
- Administrador, doctor y auxiliar: datos clínicos y documentación clínica.
- Administrador y recepción: facturas, cobros, anticipos, saldos y archivos de categoría factura.
- Administrador: inventario global y auditoría.
- Recepción: archivos administrativos permitidos; sin acceso directo a recetas, consentimientos clínicos ni archivos clínicos.

El ámbito de clínica se aplica en las consultas y en los endpoints originales de detalle y descarga. Un identificador de otra clínica no concede acceso. El backend rechaza ordenar o exportar columnas ajenas a la proyección autorizada. Los saldos expresan saldo **actual**, siguiendo la fórmula canónica de facturas, cobros y anticipos; no ofrecen un filtro de fechas que sugiera un saldo histórico inexistente.

## Exportación

`GET /api/registros/{vista}/export?format=csv|xlsx|pdf` usa exactamente la consulta, permisos, filtros y orden de la tabla. `columns` admite únicamente columnas autorizadas en el orden solicitado. El cursor SQL recorre todas las filas coincidentes, sin aplicar la página visible ni truncar un máximo oculto. Los archivos se generan con almacenamiento temporal acotado y se cierran después de enviarlos.

- CSV UTF-8 con BOM y separador `;`; neutraliza fórmulas que procedan de texto introducido por usuarios.
- XLSX nativo con importes numéricos, cabecera fija y autofiltro; nunca interpreta texto clínico como fórmula. Si una celda no cabe en Excel, rechaza la exportación e indica usar CSV para conservarla completa.
- PDF paginado, cabeceras repetidas y texto largo repartido entre páginas. Para más de 10.000 filas exige acotar la consulta o usar Excel/CSV; nunca entrega un PDF parcial. Imprimir abre ese mismo PDF completo.

Las respuestas llevan `Cache-Control: no-store`. La auditoría registra vista, formato, columnas y número de filas exportadas, sin almacenar el texto de búsqueda ni DNI en la URL de auditoría.

## Verificación reproducible

Véase [frontend/e2e/README.md](../frontend/e2e/README.md). `seed_records.py` solo admite una base local identificada como prueba y carga datos sintéticos idempotentes: 1.040 pacientes, 3.120 citas, varios meses, dos clínicas y documentos PDF reales. Los recorridos de navegador contrastan todas las filas de CSV/XLSX contra la consulta paginada, prueban regresar al filtro original y comprueban permisos en endpoints reales. La misma suite se ejecuta en CI junto al circuito clínico y económico.

Las pruebas unitarias de exportación verifican fórmulas, tipos numéricos, textos extensos y paginación PDF. La revisión visual incluye 390, 1024, 1280, 1440 y 1920 px, claro/oscuro, filtros, errores, listados densos y visor documental. Los artefactos locales están en `output/playwright` y `frontend/test-results` (ignorados por Git).

Durante esta validación se corrigió también la discrepancia entre fecha UTC y día clínico cerca de medianoche: sesión, agenda y reportes comparten la zona configurada por el servidor. Las fechas clínicas sin hora conservan su día, sin conversión de zona.
