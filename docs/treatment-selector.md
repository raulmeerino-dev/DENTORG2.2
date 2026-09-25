# Selección de tratamientos

`domains/clinical/treatment-selection/TreatmentSelector` reúne autocomplete y
catálogo fijo. `CatalogTreatmentSelector` adapta `TratamientoCatalogo`; odontograma
reutiliza la misma base mediante su adaptador `QuickTreatment` conservando el ID
real, el código, la pieza y la superficie.

El índice se prepara en memoria sobre el catálogo que carga cada flujo. El filtro
tolera tildes, mayúsculas, fragmentos, orden de palabras y separadores de códigos;
prioriza nombre/código frente a coincidencias de familia. El desplegable presenta
hasta 30 sugerencias; el catálogo fijo contiene todas las coincidencias y permite
filtrar por familia con el mismo motor. Escribir no genera peticiones ni modifica
el catálogo.

Flechas, Enter, Escape, Tab y clic funcionan desde el campo. Las sugerencias usan
`FloatingPopover` en la capa superior del navegador, ajustadas al ancho del input
y al espacio visible, incluso dentro de diálogos. Escape cierra primero las
sugerencias. La selección invalida el valor anterior al editar una entrada nueva
para evitar añadir silenciosamente un tratamiento distinto del buscado.

La planificación de sesión y el motivo de cita admiten conceptos manuales. Se
identifican expresamente y no crean entradas del catálogo. Presupuestos y registro
de realizados conservan el requisito existente de un tratamiento del catálogo;
no cambian los contratos clínicos ni económicos. El nombre personalizado y la
asociación al catálogo de un elemento de sesión se guardan por las vías existentes.

Validación: pruebas unitarias del motor, teclado y texto libre; integración de
sesión; circuito de presupuesto a cobro; revisión con catálogo real de prueba,
selección desde odontograma y modales, y resoluciones de escritorio.
