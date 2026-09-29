# Presupuestos del paciente

La sección mantiene el contexto del paciente y las rutas `tab=presupuestos&presupuesto_id=…`. El selector abre presupuestos existentes o crea uno mediante el flujo actual.

## Superficie de trabajo

- Cabecera: número, fecha, paciente, estado y totales bruto, neto, aceptado y pendiente **de aceptar**. Este último no representa una deuda del paciente.
- Presentar, aceptar todo, facturar y PDF; alternativas y rechazo en Más. Los estados terminales mantienen el editor cerrado.
- Buscador instantáneo y catálogo existentes; editor único con pieza(s), caras, precio, descuento y vista previa del importe. En edición el tratamiento queda fijo, conforme al contrato de actualización existente.
- Acciones por línea: editar, aceptar, duplicar en otra pieza y eliminar con confirmación. Duplicar prepara un borrador; no guarda nada hasta Añadir.
- La aceptación se confirma y sigue creando el trabajo pendiente mediante el servicio existente. Facturar conserva su confirmación y permisos; no cobra automáticamente.
- La etiqueta Pendiente solo se muestra cuando la consulta de trabajos pendientes lo confirma. Aceptación por sí sola no implica que un tratamiento siga sin realizar. Facturado se aplica únicamente a las líneas aceptadas; las restantes son No aceptado.

## Odontograma y borradores

El odontograma se carga al abrirlo, proyecta las líneas existentes y permite seleccionar piezas/caras para el mismo editor. No modifica el diagnóstico ni guarda por seleccionar. La selección múltiple crea una línea por pieza mediante el endpoint existente. Se conservan los servicios y el PDF, que se genera desde las líneas del servidor.

El borrador se conserva en memoria de sesión por usuario, clínica y presupuesto con la infraestructura existente (hasta 30 minutos). No persiste al recargar o cerrar. Guardar o cancelar limpia el borrador. Cambiar de línea con un borrador pide resolverlo explícitamente; las transiciones de estado se bloquean mientras haya cambios sin guardar.

Las inserciones múltiples son secuenciales. Si falla una, se muestran las líneas confirmadas, el error y las piezas restantes para reintentar, sin repetir las ya guardadas. Los importes visibles se actualizan con cada respuesta confirmada y después se reconcilian con el servidor. Los conflictos de revisión conservan el borrador y su revisión original.

## Ajustes del servidor

- PATCH distingue campos omitidos de pieza/caras explícitamente nulas para poder vaciarlas.
- Las líneas se consultan por `created_at, id`, evitando saltos tras editar. No cambia el esquema ni requiere migración.

## Validación

Pruebas del editor: alta múltiple, importe con descuento, teclado, edición y vaciado, error parcial, conflicto de revisión, borrador entre secciones, aceptación parcial, duplicación, eliminación y estados bloqueados. Integración de backend: persistencia de nulos, orden estable, protección de líneas aceptadas, rechazo de duplicados y circuito presupuesto → factura → cobro.

Revisión en Chrome con paciente sintético UIQA: búsqueda, alta por dos piezas, selección en odontograma, navegación con borrador, edición, presentación y aceptación parcial; copia de 24 líneas para densidad y eliminación. Comprobación de anchos de escritorio y 1024 píxeles sin desbordamiento del workspace.
