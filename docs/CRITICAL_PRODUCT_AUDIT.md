# Auditoría crítica de producto de DentCore

**Fecha:** 4 de septiembre de 2026  
**Objeto:** determinar si DentCore está realmente diseñado para ser utilizado durante una jornada completa por una clínica dental.  
**Alcance:** producto, arquitectura de información, carga cognitiva, descubribilidad, eficiencia y coherencia de los conceptos clínicos y económicos.  
**Decisión de esta fase:** no se implementa ningún cambio.

## Dictamen ejecutivo

**No. En su estado actual, DentCore no está todavía bien resuelto como producto de uso intensivo durante ocho horas al día.**

El problema principal no es la ausencia de funcionalidades. Es casi el contrario: muchas capacidades válidas se muestran a la vez, se presentan como módulos o estados que el usuario debe entender y obligan a recorrer transiciones que responden al modelo interno del sistema, no al trabajo mental de una clínica.

DentCore tiene una base funcional amplia, pero hoy se comporta más como una suma de áreas completas que como un puesto de trabajo continuo. Una recepcionista necesita resolver llamadas, llegadas, cambios, huecos, pagos y próximas citas. Un odontólogo necesita comprender al paciente, documentar lo relevante, decidir un plan y cerrar la visita. Ambos encuentran demasiada estructura intermedia.

Los problemas determinantes son:

1. **La sesión de usuario no soporta de forma fiable una jornada completa.** El token de acceso está configurado a 240 minutos y el cliente no renueva automáticamente una petición que recibe 401. Durante la inspección, Caja, Informes y Administración quedaron cargando o vacíos mientras la consola acumulaba respuestas 401. Recargar la aplicación recuperó la sesión mediante la cookie de renovación, pero la interfaz no lo hizo por sí sola.
2. **“Cobrar” no significa siempre cobrar.** Si no hay una factura pendiente, el botón principal abre “Nuevo anticipo”. Esto exige que recepción conozca de antemano la situación fiscal del paciente y puede provocar una clasificación económica incorrecta.
3. **El flujo presupuesto → tratamiento contiene una transición artificial.** Un tratamiento aceptado no aparece como trabajo operativo hasta pulsar “Preparar pendientes”. Esa operación no corresponde a una decisión clínica ni del paciente.
4. **Primera visita y odontograma duplican la captura.** Ausencias, implantes, caries y prótesis se piden como texto libre y también se registran gráficamente. Esto aumenta tiempo e inconsistencias.
5. **La Agenda dedica demasiado espacio a controles, leyendas y taxonomía de estados.** La jornada real queda subordinada a 12 estados visibles, indicadores repetidos, calendario, doctores, laboratorio, llamadas y acciones administrativas.
6. **La ficha contiene la información, pero no construye una respuesta de cinco segundos.** Alergias, odontograma, saldo, próxima cita, última visita, facturación, datos administrativos y documentos compiten con el mismo peso. No se ve de forma dominante por qué está aquí el paciente ni qué hay que hacer a continuación.
7. **Hay duplicación visual y conceptual.** Hoy/Agenda, Visitas/Historial, Caja/Facturación/Cobros/Anticipos y Listados/Reportes muestran partes solapadas del mismo trabajo.
8. **Varias capacidades avanzadas están visibles aunque no estén configuradas o no aporten una acción.** El asistente muestra proveedor y modelo “Mock” junto al aviso de que no hay motor disponible; Administración contiene pestañas informativas sin operación real; Inventario y analítica compiten con configuración básica.
9. **Faltan automatizaciones de alta frecuencia.** No existe un temporizador operativo de espera, el hueco exacto de 45 minutos no puede buscarse, no hay cierre unificado de visita y la próxima cita a tres meses no se propone desde el contexto clínico.
10. **La interfaz parece vertical incluso en escritorio.** No es principalmente un “modo móvil”: a 1440 × 1000 la aplicación utiliza diseño de escritorio, pero apila paneles completos, tarjetas altas, odontogramas y listas sin colapsar. El resultado obliga a desplazarse como si cada función fuera una página independiente.

La recomendación no es eliminar capacidades del dominio ni rehacer el backend. Es **reducir drásticamente lo visible, fusionar los puestos de trabajo y automatizar las transiciones derivables**.

## Método y evidencia

La auditoría no se basó solo en documentación.

- Se ejecutó la aplicación Docker en `http://127.0.0.1:5173`.
- Se recorrió la interfaz real con perfiles de Administrador y Recepción.
- Se utilizó una ventana de 1440 × 1000 para representar un escritorio habitual.
- Se inspeccionaron días de Agenda con datos, el paciente de prueba Juan Pérez Méndez, sus 53 eventos, 29 tratamientos no facturados, presupuestos parcialmente aceptados y las distintas áreas administrativas.
- Se abrieron, sin confirmar ni guardar, formularios de cita, búsqueda de hueco, primera visita, sesión, presupuesto, factura, cobro, anticipo, documentos y consentimiento.
- Se contrastó lo visto con la implementación de rutas, tabs, estados y acciones para distinguir un vacío de datos de una función inexistente.
- Los conteos de clics son aproximaciones del camino visible más corto. No se consideran atajos ocultos de botón derecho ni el asistente, porque un empleado nuevo no puede depender de funciones no descubribles o no configuradas.

No se creó, modificó, cobró, facturó ni canceló ningún dato real durante esta fase.

## Evaluación crítica pantalla por pantalla

En cada pantalla se responden las doce preguntas solicitadas: **1 objetivo; 2 inmediato; 3 sobra; 4 falta; 5 acciones que sobran; 6 acciones que faltan; 7 ocultar; 8 directo; 9 duplicación; 10 fusión; 11 comprensión; 12 eficiencia.**

### Hoy

1. **Objetivo:** dirigir la operación inmediata de recepción durante el día.
2. **Inmediato:** siguiente paciente, retrasos, quién ha llegado, quién espera, cambios solicitados, huecos aprovechables y cobros al terminar.
3. **Sobra:** repetir “En clínica”, “Cambios” y “Telefonear” en indicadores superiores y en la columna derecha; una gran zona vacía cuando hay pocas citas; indicadores sin decisión asociada.
4. **Falta:** minutos de espera desde la llegada, retraso del profesional, gabinete, duración restante, checkout pendiente y alerta de hueco compatible con lista de espera.
5. **Sobran:** accesos independientes a Recordatorios y “Más” cuando son filtros o excepciones de la misma jornada.
6. **Faltan:** iniciar/finalizar atención, registrar salida, completar checkout y rellenar un hueco desde una lista de candidatos.
7. **Ocultar:** contadores cero, laboratorio sin incidencias y colas vacías.
8. **Directo:** llegada, no presentado, confirmación, abrir ficha, cobrar y programar siguiente cita desde la fila.
9. **Duplicación:** reproduce gran parte de Agenda y su cola “Telefonear”.
10. **Fusión:** debe ser el modo “Operación” de una única Jornada/Agenda.
11. **Comprensión:** media; “próxima acción” se entiende, pero los bloques repetidos no indican cuál manda.
12. **Eficiencia:** aceptable en un día vacío, insuficiente con volumen porque carece de gestión de espera y cierre de visita.

### Agenda

1. **Objetivo:** asignar tiempo clínico y gestionar el estado operativo de cada cita.
2. **Inmediato:** hora, paciente, motivo, profesional/gabinete, duración, confirmación, presencia y retraso.
3. **Sobra:** leyenda permanente de 12 estados, cinco indicadores superiores, franja de laboratorio a cero, cuatro leyendas de doctor, calendario y cola de llamadas siempre abiertos.
4. **Falta:** espera acumulada, duración personalizada de 45 minutos, visualización clara de conflictos, preferencias del paciente y coincidencia de hueco con lista de espera.
5. **Sobran:** refresco manual como acción primaria, acceso diario a Horario y siete estados editables dentro del formulario ordinario.
6. **Faltan:** arrastrar para mover con confirmación clara, duplicar cita, crear serie, “siguiente disponible” desde el paciente y cambio rápido de duración.
7. **Ocultar:** leyenda, calendario mensual, laboratorio, cola de llamadas y configuración de horario cuando no se usan.
8. **Directo:** confirmar, llegada, iniciar, finalizar, cancelar/no-show, cobrar y crear próxima cita desde la cita seleccionada.
9. **Duplicación:** con Hoy, Recordatorios y Telefonear.
10. **Fusión:** Hoy debe ser un modo de la Agenda; llamadas y recordatorios, drawers o filtros.
11. **Comprensión:** baja-media sin formación. Los estados “MSG”, “Revisar”, “Solicita cambio” y “Reprogramada” mezclan comunicación, revisión y ciclo de vida.
12. **Eficiencia:** la fila de cita es rápida; el conjunto no. Antes de llegar a la parrilla ya se han consumido unos 280 px verticales y 320 px laterales.

### Pacientes

1. **Objetivo:** encontrar o crear una persona y mantenerla como contexto activo.
2. **Inmediato:** búsqueda tolerante por nombre/teléfono/DNI/historia, coincidencias, alertas de duplicado y acciones Cita/Abrir/Crear.
3. **Sobra:** cargar implícitamente un paciente anterior como selección en formularios nuevos sin una confirmación explícita.
4. **Falta:** lista reciente/favoritos, similitudes para evitar duplicados, estado de cita hoy y motivo de la última interacción en resultados.
5. **Sobran:** formularios completos cuando solo se está atendiendo una llamada nueva.
6. **Faltan:** “crear y dar cita” en un solo flujo y “paciente provisional” claramente reconciliable después.
7. **Ocultar:** dirección, profesión, póliza, pagador y datos secundarios hasta completar la ficha.
8. **Directo:** llamar/WhatsApp, crear cita, registrar llegada y ver saldo desde cada resultado.
9. **Duplicación:** el listado de pacientes de Informes repite una versión inferior de esta búsqueda.
10. **Fusión:** búsqueda y alta mínima deben formar parte del compositor global de citas.
11. **Comprensión:** encontrar un paciente es descubrible; diferenciar ficha completa de paciente temporal no lo es tanto.
12. **Eficiencia:** buena para encontrar; lenta para alta completa y cita porque son contextos separados.

### Ficha del paciente

1. **Objetivo:** permitir comprender al paciente y decidir la siguiente acción en cinco segundos.
2. **Inmediato:** identidad, edad/contacto, motivo de hoy, alergias/alertas, estado del plan activo, deuda, última actuación y próxima cita.
3. **Sobra:** odontograma completo en miniatura con 32 piezas, leyenda y cuatro contadores; datos administrativos completos; documentos vacíos; segunda tarjeta económica; alergia repetida en chip, alerta y observaciones.
4. **Falta:** “hoy viene por…”, profesional, estado de llegada/espera, próximo paso clínico concreto y resumen de plan con importe/avance.
5. **Sobran:** Cobrar cuando en realidad abre un anticipo; Emitir factura y Registrar anticipo simultáneos; varios accesos repetidos a Historial/Facturas/Documentos.
6. **Faltan:** abrir sesión de hoy, finalizar visita/checkout y crear próxima cita con intervalo sugerido.
7. **Ocultar:** datos fiscales, dirección, póliza, documentos vacíos y odontograma gráfico tras Resumen o drawer.
8. **Directo:** cambiar alerta, abrir sesión, ver/editar siguiente paso, cobrar deuda real y agendar retorno.
9. **Duplicación:** saldo aparece arriba y en Cobros/facturas; alertas se repiten; última visita se repite en Historial; mini odontograma repite Clínica.
10. **Fusión:** ficha debe ser un resumen; detalle clínico, plan e historia viven en sus áreas, no como tarjetas completas dentro del resumen.
11. **Comprensión:** parcial. Se entiende quién es, pero no se distingue con rapidez qué requiere atención ahora.
12. **Eficiencia:** baja para uso repetido; exige escaneo vertical y discriminación entre datos de igual peso.

### Primera visita

1. **Objetivo:** registrar motivo, antecedentes relevantes, exploración y primera orientación clínica.
2. **Inmediato:** motivo, alertas médicas, hallazgos generales no dentarios y odontograma diagnóstico.
3. **Sobra:** campos de texto para ausencias, implantes, prótesis/coronas y caries que ya deben residir en el odontograma.
4. **Falta:** una secuencia guiada, campos estructurados para riesgo/periodontal y una salida clara hacia plan o seguimiento.
5. **Sobran:** completar diez textos libres y después volver a introducir las piezas gráficamente.
6. **Faltan:** “guardar y crear plan”, plantillas por tipo de primera visita y marcación rápida de “sin hallazgos”.
7. **Ocultar:** campos sin relevancia para ese paciente; mostrar por excepción.
8. **Directo:** convertir hallazgo en propuesta sin volver a buscar tratamiento/pieza.
9. **Duplicación:** con datos de salud de la ficha y odontograma.
10. **Fusión:** debe ser un modo de la sesión clínica, no una pantalla larga encima del odontograma.
11. **Comprensión:** sí se entiende qué rellenar, pero no qué fuente es la oficial si texto y gráfico discrepan.
12. **Eficiencia:** baja; invita a documentar dos veces.

### Odontograma

1. **Objetivo:** representar estado dental y permitir registrar hallazgos o seleccionar objetivos clínicos.
2. **Inmediato:** dentición, leyenda del modo actual, pieza/superficie seleccionada y acción propia de ese modo.
3. **Sobra:** mostrar siempre todas las acciones, estados y controles; en diagnóstico aparecen Caries, Obturación, Endodoncia, Corona, Ausente, Pendiente y Realizado en el mismo plano semántico.
4. **Falta:** separación inequívoca entre condición existente, diagnóstico, propuesta y tratamiento realizado; selección múltiple; atajos visibles; deshacer y guardado unificado.
5. **Sobran:** tres guardados distintos (“diagnóstico”, “superficie”, “nota”) sin explicar cuál consolida el cambio.
6. **Faltan:** aplicar un hallazgo/tratamiento a varias piezas o superficies y generar plan a partir del diagnóstico.
7. **Ocultar:** panel avanzado, historial de pieza y tratamientos rápidos hasta seleccionar; odontograma completo fuera del contexto clínico.
8. **Directo:** diagnóstico → propuesta, realizado → actualización de estado e historial.
9. **Duplicación:** se repite en diagnóstico, presupuesto, pendientes y sesión con más superficie de la necesaria.
10. **Fusión:** una herramienta compartida contextual está justificada; lo que debe fusionarse es el modelo de datos/acción, no las vistas.
11. **Comprensión:** baja sin formación. El doble clic para añadir tratamiento y las diferencias entre modos no son autoevidentes.
12. **Eficiencia:** media para una pieza, baja para varias por ausencia de operación en lote y guardado claro.

### Presupuestos

1. **Objetivo:** presentar un plan económico, registrar aceptación total/parcial y producir el plan ejecutable.
2. **Inmediato:** versión/fecha, líneas, total, aceptado, pendiente de decisión, estado de firma/presentación y próxima acción.
3. **Sobra:** odontograma completo abierto por defecto, catálogo completo, barra de cinco estados y muchas acciones de transición simultáneas.
4. **Falta:** una vista compacta para explicar el plan al paciente, agrupación por fase/sesión y consecuencias de la aceptación parcial.
5. **Sobran:** “Preparar pendientes”; “Facturar” como acción equivalente a estados clínicos; catálogo exhaustivo siempre visible.
6. **Faltan:** aceptar/rechazar varias líneas con casillas claras, firmar/entregar y programar la primera fase aceptada.
7. **Ocultar:** edición de odontograma, precio unitario, caras y catálogo tras “Editar plan”.
8. **Directo:** al aceptar una línea, crear el trabajo pendiente y ofrecer cita; al rechazar, conservar trazabilidad sin contaminar la operación.
9. **Duplicación:** comparte líneas con Trabajo pendiente y estados con Sesión; el flujo visual repite entidades internas.
10. **Fusión:** Presupuesto y Plan deben ser dos modos del mismo conjunto de líneas, no dos inventarios que requieren conversión manual.
11. **Comprensión:** media-baja. “Aceptado pero por preparar” es lenguaje del sistema, no de clínica.
12. **Eficiencia:** baja para editar o aceptar parcialmente; el odontograma ocupa casi toda la primera pantalla del modal.

### Trabajo pendiente

1. **Objetivo:** mostrar lo aceptado que todavía debe programarse o realizarse.
2. **Inmediato:** tratamiento, pieza, fase, prioridad, cita asociada, laboratorio/consentimiento necesario y saldo/condición relevante.
3. **Sobra:** ocho columnas y un odontograma completo para una lista operativa; presupuesto como dato protagonista.
4. **Falta:** agrupación por plan/fase, progreso de varias sesiones, dependencia de laboratorio y próxima acción dominante.
5. **Sobran:** revisar presupuesto para “preparar” elementos ya aceptados.
6. **Faltan:** dar cita a una fase completa, priorizar y marcar “no programar todavía”.
7. **Ocultar:** identificador de presupuesto, importe y pieza cuando no condicionen la acción; odontograma bajo demanda.
8. **Directo:** dar cita, abrir sesión, pedir laboratorio y ver consentimiento faltante desde la fila.
9. **Duplicación:** es la misma realidad que líneas aceptadas del Plan y tratamientos de Sesión.
10. **Fusión:** debe ser el filtro “Por programar/En curso” del Plan del paciente y una cola global solo cuando haya trabajo sin cita.
11. **Comprensión:** baja cuando aparece vacío pese a existir trabajo aceptado.
12. **Eficiencia:** baja hasta eliminar la preparación manual; después puede ser muy eficiente como cola de excepciones.

### Sesión clínica

1. **Objetivo:** registrar de forma rápida lo previsto, realizado, pospuesto y observado en la visita actual.
2. **Inmediato:** motivo de hoy, piezas/tratamientos previstos, alertas, nota clínica, hora/duración y acciones Finalizar/Posponer/Añadir.
3. **Sobra:** buscador más un selector con todo el catálogo, nombre editable, catálogo editable, pieza, caras, observación, nota de pieza, estado, acciones secundarias y tres tarjetas laterales a la vez.
4. **Falta:** asociación automática inequívoca con la cita de hoy, cronología de sesión, firma/autor y cierre único de visita.
5. **Sobran:** añadir manualmente lo ya aceptado; volver a elegir tratamiento/pieza; guardar observación y nota de pieza como conceptos paralelos sin guía.
6. **Faltan:** “Finalizar visita” con revisión conjunta de realizados, nota, documentos, cobro y próxima cita.
7. **Ocultar:** cambio de catálogo, edición técnica de caras y eliminación bajo menú avanzado.
8. **Directo:** finalizar todos los seleccionados, dictar una nota, adjuntar foto/radiografía y enviar checkout a recepción.
9. **Duplicación:** con Trabajo pendiente, Historial, Odontograma y checklist de salida.
10. **Fusión:** la sesión debe consumir el Plan automáticamente y producir Historial; no debe mantener un inventario manual intermedio.
11. **Comprensión:** media para un tratamiento manual; baja cuando hay líneas aceptadas no preparadas.
12. **Eficiencia:** insuficiente para varias actuaciones por el trabajo administrativo requerido.

### Historial

1. **Objetivo:** ser la narración cronológica y verificable de todo lo relevante del paciente.
2. **Inmediato:** últimos eventos clínicos significativos, con filtros por fecha/tipo y búsqueda.
3. **Sobra:** 12 filtros visibles a la vez y tarjetas que repiten tipo, estado y detalle incluso para citas programadas.
4. **Falta:** rango de fechas, búsqueda textual, densidad compacta, agrupación por visita y ocultación de eventos administrativos menores.
5. **Sobran:** botón “Tratamientos y facturación” además de los filtros específicos; “Detalle” repetido en cada evento simple.
6. **Faltan:** exportar/impresión clínica por intervalo, comparación de odontograma y apertura directa del documento relacionado.
7. **Ocultar:** filtros raros en “Más filtros”; detalles de eventos triviales colapsados.
8. **Directo:** abrir documento/factura/receta o saltar a la visita desde el evento.
9. **Duplicación:** la pestaña Visitas reconstruye otra cronología con los mismos datos.
10. **Fusión:** Visitas debe ser una agrupación del Historial, no una pantalla independiente.
11. **Comprensión:** alta en intención, media en lectura por repetición y longitud.
12. **Eficiencia:** baja con 53 eventos y sin búsqueda/rango; el usuario debe recorrer una lista muy vertical.

### Facturación

1. **Objetivo:** convertir actuaciones facturables en documento fiscal trazable.
2. **Inmediato:** qué se factura hoy, importe, pagador, serie, estado fiscal y relación con pagos previos.
3. **Sobra:** mostrar 29 tratamientos históricos sin facturar en una lista de selección manual, más todos los datos fiscales y de pago en el mismo modal.
4. **Falta:** selección predeterminada de lo realizado en la visita actual, búsqueda/filtro, aviso de antigüedad, aplicación clara de anticipos y pagador.
5. **Sobran:** flechas entre dos tablas como principal mecanismo; “generar cobro y marcar pagada” binario dentro del formulario fiscal.
6. **Faltan:** factura de la visita, factura parcial/agrupada con reglas visibles y transición inmediata a pago completo/parcial.
7. **Ocultar:** serie/número automáticos, datos del paciente ya válidos y cálculo fiscal hasta revisión.
8. **Directo:** generar factura y abrir un checkout con saldo restante; aplicar anticipo automáticamente con confirmación.
9. **Duplicación:** acciones de Facturar aparecen en Presupuesto, Ficha, Historial y Caja.
10. **Fusión:** facturación debe ser una etapa del checkout y conservar una vista avanzada separada solo para administración.
11. **Comprensión:** media para personal administrativo formado; baja para recepción ocasional.
12. **Eficiencia:** baja en el caso frecuente “terminó hoy y paga ahora”.

### Cobros

1. **Objetivo:** registrar dinero recibido contra una deuda o como crédito real del paciente.
2. **Inmediato:** saldo, origen de la deuda, importe sugerido, método y saldo resultante.
3. **Sobra:** separar la entrada por “Cobrar”, “Registrar anticipo”, factura, caja y menú contextual sin una decisión inicial común.
4. **Falta:** selector explícito “paga deuda / paga parte / deja saldo a favor”, aplicación de anticipos y recibo posterior.
5. **Sobran:** mostrar “Cobrar” cuando la única operación disponible será un anticipo.
6. **Faltan:** pago dividido entre métodos, referencia de TPV/transferencia y devolución controlada.
7. **Ocultar:** concepto y notas salvo anticipo o excepción.
8. **Directo:** cobrar total o parcial desde checkout y mostrar saldo final antes de confirmar.
9. **Duplicación:** con Caja, Facturas y Anticipos.
10. **Fusión:** una sola Cuenta del paciente debe presentar cargos, facturas, pagos, anticipos y saldo con términos claros.
11. **Comprensión:** alta una vez existe factura; baja antes de ella.
12. **Eficiencia:** buena para un pago parcial ya facturado (método + importe), mala para llegar a ese punto.

### Caja

1. **Objetivo:** operar y conciliar el dinero del turno/día, además de localizar deuda pendiente.
2. **Inmediato:** caja abierta/cerrada, saldo esperado, efectivo real, diferencia, cobros de hoy y pacientes pendientes de checkout.
3. **Sobra:** seis KPI financieros, incluidos hoy/mes e ingresos brutos, antes de la tabla operativa.
4. **Falta:** apertura, movimientos manuales controlados, arqueo, cierre, diferencia, usuario/turno y acceso rápido a pacientes que acaban de salir.
5. **Sobran:** “Facturado este mes”, “Cobrado este mes” e “Ingresos mes” en la pantalla diaria de caja.
6. **Faltan:** cobrar por paciente, emitir recibo, devolución/anulación trazable y cerrar turno.
7. **Ocultar:** métricas mensuales en Informes.
8. **Directo:** buscar paciente/factura, registrar pago parcial y abrir la cuenta del paciente.
9. **Duplicación:** con Listados Caja/Facturas y Reportes administrativos.
10. **Fusión:** Caja conserva identidad propia, pero el detalle analítico se mueve a Informes y la cuenta individual al paciente.
11. **Comprensión:** la tabla se entiende; el título promete “arqueo” que la interfaz visible no proporciona.
12. **Eficiencia:** no evaluable con datos cero; estructuralmente incompleta para cierre real de caja.

### Laboratorio

1. **Objetivo:** controlar pedidos protésicos desde salida hasta recepción, revisión y entrega al paciente.
2. **Inmediato:** paciente, trabajo, laboratorio, fecha necesaria, estado, retraso/incidencia y cita dependiente.
3. **Sobra:** franja permanente en Agenda cuando no hay incidencias; directorio de laboratorios como pestaña del mismo nivel que operación administrativa.
4. **Falta:** cola operativa unificada de lo que vence o bloquea citas y acceso claro desde el menú de paciente.
5. **Sobran:** navegar a Listados/Protésicos para ver una tabla distinta del directorio en Administración.
6. **Faltan:** crear pedido desde el tratamiento/sesión de forma visible, registrar envío/recepción/revisión y advertir si hay cita sin trabajo recibido.
7. **Ocultar:** contacto del laboratorio y precios fuera de configuración; trabajos correctos lejos de la Agenda.
8. **Directo:** pedido desde línea de plan, actualización rápida desde la alerta y apertura del paciente/cita.
9. **Duplicación:** aparece en Agenda, Historial, Sesión, Listados y Administración.
10. **Fusión:** datos maestros en Configuración; operación como cola contextual y, solo en Pro, tablero global de laboratorio.
11. **Comprensión:** baja por dispersión; no hay un único lugar obvio para “trabajos que debo gestionar hoy”.
12. **Eficiencia:** baja en recepción general; mejorable mediante excepciones contextuales.

### Documentos

1. **Objetivo:** archivar y recuperar material clínico/legal ligado al paciente y al episodio correcto.
2. **Inmediato:** últimos documentos relevantes, tipo, fecha, visita/tratamiento asociado y estado de consentimiento.
3. **Sobra:** elegir entre once carpetas, etiquetas y crear nueva carpeta en cada subida básica; pestaña administrativa de Documentos que solo describe categorías.
4. **Falta:** preselección por contexto (radiografía desde sesión, factura desde caja), vista previa y asociación explícita con visita/pieza/tratamiento.
5. **Sobran:** “Ver todos”, “Documentos”, “Subir documento” y “Nuevo CI” repetidos en ficha y menú Más.
6. **Faltan:** arrastrar/pegar, captura directa, clasificación sugerida y solicitud de documento al paciente.
7. **Ocultar:** etiquetas, nueva carpeta y taxonomía completa bajo opciones avanzadas.
8. **Directo:** subir desde sesión/historial y abrir desde la línea temporal.
9. **Duplicación:** Historial filtra documentos y la Ficha mantiene otro resumen; Administración tiene un tab informativo.
10. **Fusión:** un único drawer contextual; plantillas en Configuración; eventos en Historial.
11. **Comprensión:** media; el archivo se entiende, la estructura de carpetas exige decisiones innecesarias.
12. **Eficiencia:** aceptable para un archivo, baja si se cargan varias imágenes clínicas.

### Inventario

1. **Objetivo:** evitar roturas de stock y gestionar reposición.
2. **Inmediato:** productos bajo mínimo, pedidos retrasados y acción de reponer/recibir.
3. **Sobra:** producto, proveedor y pedido con igual prominencia aunque la tabla esté vacía y no haya alertas.
4. **Falta:** consumo simple, recepción rápida, unidades, lote/caducidad para material relevante y alertas accionables.
5. **Sobran:** exponer toda la gestión a clínicas que no usarán inventario dentro del software.
6. **Faltan:** activar/desactivar módulo, importación inicial y flujo mínimo “bajo stock → pedir → recibir”.
7. **Ocultar:** proveedores y pedidos nuevos en panel avanzado; todo el módulo si no está configurado.
8. **Directo:** reponer desde una alerta y recibir pedido.
9. **Duplicación:** no hay duplicación fuerte, pero compite con configuración esencial en una barra de 13 pestañas.
10. **Fusión:** mantener como capacidad Pro/Advanced dentro de Operaciones o Configuración, no como complejidad base.
11. **Comprensión:** media; la intención es clara, la utilidad real no aparece sin datos.
12. **Eficiencia:** no demostrada; hoy es una carcasa con tres formularios colapsables.

### Informes / Listados

1. **Objetivo:** ayudar a dirección y responsables a tomar decisiones, no solo mostrar tablas.
2. **Inmediato:** periodo, clínica, profesional, indicadores con comparación y excepciones que requieren acción.
3. **Sobra:** módulo global Listados con seis tabs y un “Cuadro de control” que únicamente describe qué debería tener cada rol.
4. **Falta:** filtros de periodo en Listados, comparativas, tendencias, definición de métricas y navegación desde KPI al detalle.
5. **Sobran:** Listados global y Reportes de Administración como dos productos analíticos paralelos.
6. **Faltan:** guardar vistas, exportación coherente, metas/comparación y permisos por información económica/clínica.
7. **Ocultar:** Listados a recepción salvo reportes operativos concretos; analítica avanzada para dirección.
8. **Directo:** desde una alerta/KPI abrir los pacientes, citas o facturas que lo componen.
9. **Duplicación:** Caja/Facturas repite Caja; Pacientes repite búsqueda; Protésicos repite laboratorio; Reportes admin contiene una versión más completa.
10. **Fusión:** un solo centro de Informes en Administración/Dirección; las colas operativas vuelven a Jornada, Pacientes y Caja.
11. **Comprensión:** las etiquetas se entienden, pero no hay una decisión clara detrás de varias tablas.
12. **Eficiencia:** baja para dirección por falta de contexto temporal/comparativo; baja para recepción por exceso de alcance.

### Administración

1. **Objetivo:** configurar organización, permisos, catálogos e infraestructura sin invadir la operación diaria.
2. **Inmediato:** estado de configuración, problemas pendientes, búsqueda de ajuste y grupos lógicos.
3. **Sobra:** 13 tabs horizontales al mismo nivel; “Con conexión”; tarjetas descriptivas sin acciones; Reportes dentro de Configuración.
4. **Falta:** buscador de ajustes, agrupación Organización/Clínica/Operación/Seguridad, estado “configurado/pendiente” y ayuda contextual.
5. **Sobran:** Documentos como tab informativo; General como índice parcial; pestañas siempre visibles aunque el rol/edición sea rara.
6. **Faltan:** asistente de puesta en marcha, validación de configuración mínima y trazado de dependencias.
7. **Ocultar:** Auditoría, Importación, Backups, Inventario y detalles fiscales en grupos avanzados según rol.
8. **Directo:** resolver un problema de configuración desde el aviso que lo detecta.
9. **Duplicación:** Reportes con Listados; Protésicos/Lab con operación; Documentos con ficha; Agenda/Horarios aparece también desde Agenda.
10. **Fusión:** agrupar pestañas y mover Informes fuera de la taxonomía de configuración, aunque siga restringido a dirección.
11. **Comprensión:** baja sin formación por cantidad y mezcla de configuración, operación, analítica y seguridad.
12. **Eficiencia:** aceptable para uso ocasional experto; no debe formar parte de la carga diaria.

## Auditoría especial de la ficha del paciente

### Información existente frente a información bien presentada

| Pregunta de cinco segundos | ¿Existe? | ¿Se comprende en cinco segundos? | Evidencia observada |
|---|---:|---:|---|
| ¿Quién es? | Sí | Sí | Nombre, historia y teléfono están arriba. |
| ¿Por qué está aquí? | Parcial | No | Se ve “presupuesto aceptado sin cita”, pero no el motivo de hoy ni el episodio activo. |
| ¿Qué alertas importan? | Sí | Parcial | La alergia aparece varias veces y entra en conflicto con “Sin alergias ni contraindicaciones registradas”. |
| ¿Qué tiene pendiente? | Sí | No | El mini odontograma dice 2 pendientes; no muestra cuáles, fase, importe ni próxima acción. |
| ¿Qué se hizo recientemente? | Sí | Sí, con esfuerzo | Hay una tarjeta de última visita, pero compite con muchos bloques. |
| ¿Qué debe pagar? | Sí | Parcial | El saldo aparece dos veces; “Cobrar” puede abrir un anticipo aunque no haya deuda facturada. |
| ¿Cuándo vuelve? | Sí | Sí | “Sin cita programada” es visible, pero no hay intervalo clínico recomendado. |

La ficha no falla por falta de datos. Falla porque no los jerarquiza según el momento. Una alerta clínica crítica comparte superficie con datos administrativos, un odontograma de 32 piezas y un bloque de documentos vacío. También se observó una contradicción concreta: el encabezado/observaciones indica alergia a penicilina mientras el bloque Salud comunica “Sin alergias ni contraindicaciones registradas”. En clínica, una contradicción presentada como dos fuentes válidas es más peligrosa que un dato ausente.

### Diagnóstico

La ficha actual es **un dashboard de módulos**, no **un resumen de paciente**. Debe responder con una sola lectura:

1. contexto de hoy;
2. riesgo/alerta;
3. plan activo y siguiente acción;
4. situación económica;
5. próximo contacto.

El detalle administrativo, los documentos y el odontograma completo deben estar disponibles, pero no competir en el primer plano.

## Test de carga cognitiva

Los recuentos son aproximados a partir de la interfaz real a 1440 × 1000. “Acción visible” incluye botones, chips accionables, filtros y selects expuestos sin desplegar un menú.

| Pantalla | Elementos/datos visibles | Acciones visibles | Navegación | Estados/colores | Menús/tabs/modales | Clasificación dominante | Diagnóstico |
|---|---:|---:|---:|---:|---|---|---|
| Hoy | 15–25 | 9–13 | 2 niveles | 5–7 | menú Más; modales de cita/recordatorio | frecuente + secundario + ruido | Repite indicadores y cola lateral; falta tiempo de espera. |
| Agenda | 30–50 antes de contar citas | 15–25 | 2–3 niveles | 12 estados + 4 colores de doctor | calendario, sidebar, leyenda, 3+ modales | esencial mezclado con avanzado | La configuración visual ocupa más atención que las citas. |
| Ficha | 45–70 datos | 12–18 | 3 tabs + accesos cruzados | 6–10 chips/estados | Más acciones + 5+ modales/drawers | esencial + configuración + ruido | No existe un orden de lectura de cinco segundos. |
| Primera visita | 10 campos + 32 piezas | 10+ acciones dentales | 3 niveles | 7 estados/acciones | expansión + odontograma | esencial duplicado | Texto libre y odontograma compiten como fuentes. |
| Odontograma | 32 piezas, 6 superficies, leyenda | 10–16 | dentro de Clínica/Plan | 7+ estados semánticos | doble clic, menú contextual, panel lateral | esencial + avanzado | Potente para una pieza; pesado y ambiguo para varias. |
| Presupuesto | resumen + odontograma + catálogo + líneas | 15–25 | 3 niveles + modal | 5 pasos y estados por línea | Más, selector de presupuestos | frecuente + avanzado | La explicación al paciente queda enterrada bajo edición técnica. |
| Pendientes | hasta 8 columnas + odontograma | 2–5 por fila | 3 niveles | 3–6 | contexto de fila | frecuente + ruido | Estado interno “preparado” determina si la pantalla parece vacía. |
| Sesión | lista + formulario + checklist + 3 tarjetas | 15–25 | 3 niveles | 4 estados de sesión | Más acciones + catálogo | esencial + secundario + avanzado | Exige administración manual dentro de la atención clínica. |
| Visitas | 4 secciones por cada día | 1+ por día | 3 niveles | estado de cita/tratamiento | lista sin colapsar | secundario + ruido | Duplica Historial y muestra frases vacías repetidas. |
| Historial | 53 eventos en el caso auditado | 12 filtros + detalles | 2 niveles | 10+ tipos | tabs/filtros; sin rango visible | esencial + secundario | Longitud extrema y repetición por evento. |
| Factura | 29 líneas históricas + 10 datos | 8–12 | modal sobre ficha | 4 pasos | doble tabla y formulario | frecuente + avanzado | Demasiado trabajo para facturar la visita actual. |
| Caja | 6 KPI + 8 columnas | 3 tabs + filas | 2 niveles | 3 estados | tabs | esencial + analítica | Promete arqueo, muestra analítica mensual y facturas. |
| Administración | 13 pestañas | decenas según tab | 2–3 niveles | permisos/conexión | 13 tabs horizontales | configuración + avanzado | Mezcla configuración, analítica, operación y seguridad. |

### Clasificación de lo visible

**Esencial**

- agenda temporal y cita activa;
- identidad y alertas del paciente;
- motivo/plan de la sesión;
- tratamiento previsto/realizado;
- saldo y próxima cita;
- historial clínico reciente.

**Frecuente**

- confirmar, llegada, iniciar/finalizar;
- crear/mover/cancelar cita;
- aceptar plan parcial;
- nota, documento, consentimiento;
- factura y pago parcial.

**Secundario**

- llamadas, laboratorio sin incidencia, documentos antiguos;
- datos administrativos completos;
- odontograma de lectura en Resumen;
- histórico de comunicación.

**Avanzado**

- edición manual de serie/número, familias de tratamiento, catálogos;
- stock/proveedores/pedidos;
- comparativas e informes de dirección;
- importación, backups y auditoría técnica;
- asistente con proveedor/modelo.

**Configuración**

- horarios, gabinetes, doctores, formas de pago, plantillas, laboratorios;
- entidades sanitarias y fiscalidad.

**Ruido actual**

- contadores cero repetidos;
- leyenda permanente de 12 estados;
- mini odontograma completo en la ficha;
- frases “sin X” repetidas en cada visita;
- tab Documentos de Administración sin acciones;
- tab Control de Listados que describe el producto en vez de controlarlo;
- “Con conexión” y barra de sincronización cuando no hay una excepción;
- asistente visible anunciando que no está disponible.

## Sobreingeniería detectada

| Capacidad | Problema de producto | Decisión recomendada |
|---|---|---|
| Asistente operativo con intérpretes Mock/Ollama/OpenAI, voz, resolutores y drafts | Gran superficie técnica y visual; en la interfaz auditada estaba visible pero no disponible y mostraba términos internos. | Advanced/experimental, oculto por defecto y visible solo cuando esté configurado y aporte tareas medibles. |
| Visitas como pantalla completa | Reconstruye por fecha lo que Historial ya contiene y rellena cada día con secciones vacías. | Eliminar visualmente; convertir en agrupación “por visita” de Historial. |
| Listados globales y Reportes de Admin | Dos centros analíticos; el primero contiene tablas básicas y un tab Control descriptivo. | Unificar en Informes de Dirección; devolver colas operativas a Jornada/Caja. |
| 12 estados visibles de Agenda | Modela internamente comunicación, revisión y ciclo clínico como estados equivalentes. | Reducir estados humanos a Programada, Confirmada, En clínica, En atención, Finalizada, Cancelada/No vino; el resto como badges/eventos internos. |
| Primera visita de diez textos + odontograma | Duplicación estructural con alto riesgo de contradicción. | Simplificar a datos no derivados; condiciones dentales solo en odontograma. |
| “Preparar pendientes” | Transición técnica sin decisión humana. | Eliminar del producto; automatizar al aceptar línea. |
| Odontograma completo en Ficha, Presupuesto, Pendientes y Sesión | Herramienta valiosa usada como fondo universal; genera verticalidad y pérdida de foco. | Abrir completo solo al editar piezas; usar resumen textual/mini selectivo en el resto. |
| Inventario completo para toda clínica | No todas las clínicas gestionarán stock en DentCore; añade proveedores/pedidos y mantenimiento. | Módulo Pro opcional, desactivado hasta configuración. |
| Taxonomía documental de once carpetas + etiquetas | El usuario clasifica manualmente información que el contexto ya conoce. | Autoclasificar; opciones avanzadas solo por excepción. |
| Menús de botón derecho paralelos a Más acciones | Potencia no descubrible que duplica caminos y dificulta formación/soporte. | Mantener solo como atajo experto después de consolidar un camino visible. |
| Fichaje global | Función de RR. HH. no necesaria para todas las clínicas y ocupa el encabezado permanente. | Pro opcional; oculto si la clínica no lo usa. |
| Portal de paciente y automatizaciones extensas | Pueden aportar valor, pero no deben condicionar la claridad del núcleo. | Advanced, activación explícita y métricas de adopción. |

## Carencias reales y justificadas

Solo se incluyen carencias demostrables por un problema operativo concreto.

| Usuario → problema real | Frecuencia | Consecuencia | Solución de producto |
|---|---|---|---|
| Todo el personal → el token expira a las 4 h y las peticiones empiezan a responder 401 sin recuperación automática | Una vez por jornada larga | pantallas vacías/cargando, pérdida de confianza, posible pérdida de borrador | renovación silenciosa única, reintento de la petición y, si falla, login con retorno y borrador preservado |
| Recepción → no ve cuánto lleva esperando un paciente | diaria, varias veces | retrasos no detectados y mala experiencia | registrar hora de llegada, mostrar contador y alertas por umbral configurable |
| Recepción → no puede buscar 45 min exactos | frecuente según agenda | reservas inexactas o hueco desaprovechado | duración libre con incrementos configurables y favoritos por tratamiento |
| Recepción → “Cobrar” se convierte en “Anticipo” si no hay factura | cada checkout sin factura previa | clasificación errónea, más pasos y dudas | checkout que determine deuda, actuaciones facturables, anticipo y pago parcial antes de elegir documento |
| Odontólogo → repite ausencias/implantes/caries en texto y odontograma | cada primera visita | tiempo y discrepancias clínicas | captura única estructurada, resumen derivado y campos libres solo para excepciones |
| Clínica → aceptación parcial no produce automáticamente plan operativo | frecuente en planes medios/grandes | tratamiento aceptado que no se cita o queda invisible | línea aceptada = línea activa del plan; sugerir primera cita inmediatamente |
| Odontólogo/recepción → no existe un cierre único de visita | cada paciente tratado | actuaciones, nota, cobro o próxima cita incompletos | finalizar visita con checklist accionable y entrega a recepción |
| Recepción → retorno a tres meses exige calcular fecha y reconstruir cita | muy frecuente | seguimientos olvidados o fecha incorrecta | intervalos rápidos, recomendación clínica y tarea de recall si no se agenda |
| Recepción → un hueco liberado no se cruza con pacientes que esperan | diaria/semanal | tiempo clínico perdido | lista de espera con duración/profesional/franja y coincidencias al cancelar |
| Dirección → Listados no explica periodo ni evolución | semanal/mensual | decisiones sobre datos sin contexto | un único centro de informes con periodo, comparación, definición y drill-down |
| Personal → alergias pueden aparecer en fuentes contradictorias | cada apertura del paciente afectado | riesgo clínico | fuente canónica, normalización y bloqueo de contradicciones visibles |
| Personal nuevo → no sabe dónde está laboratorio, documentos o el cierre de visita | incorporación y tareas ocasionales | consultas, errores y baja adopción | navegación orientada a tareas y acciones contextuales consistentes |

## Producto Core, Pro y Advanced

Esta clasificación sirve para reducir complejidad visible, no obliga a crear planes comerciales.

### Core

- búsqueda, alta mínima y ficha del paciente;
- alertas médicas y antecedentes;
- Jornada/Agenda con citas, llegada, espera, atención, cancelación y no-show;
- primera visita y odontograma diagnóstico;
- plan/presupuesto con aceptación total o parcial;
- trabajo aceptado y sesiones clínicas;
- nota clínica, documentos esenciales y consentimiento;
- facturación, pago total/parcial, anticipo y saldo;
- próxima cita/recall;
- caja diaria básica e historial completo.

### Pro

- varios profesionales, gabinetes y agendas complejas;
- laboratorio operativo y dependencias con citas;
- WhatsApp, recordatorios y listas de espera avanzadas;
- inventario y reposición;
- plantillas clínicas, dictado y consentimientos avanzados;
- mutuas/pagadores y comisiones;
- informes operativos por profesional y producción;
- fichaje si la clínica lo necesita.

### Advanced

- multi-clínica y consolidación;
- permisos granulares y administración delegada;
- portal del paciente;
- integraciones y automatización avanzada;
- asistente de IA;
- analítica comparativa, exportaciones y BI;
- importaciones masivas, backups operados desde UI e inventario avanzado;
- trazabilidad/auditoría consultable a gran escala.

La seguridad, la trazabilidad y la separación por clínica **no son opcionales internamente**. Lo que cambia por nivel es cuánto de su administración se expone al usuario normal.

## Prueba del empleado nuevo

### Recepcionista con experiencia clínica, nueva en DentCore

| Tarea | ¿La descubriría? | Pregunta probable |
|---|---|---|
| Encontrar paciente | Sí | — |
| Crear paciente | Sí | “¿Tengo que rellenar todo antes de darle cita?” |
| Dar cita | Sí | “¿Por qué hay buscador y selector de paciente separados?” |
| Mover cita | Parcial | “¿La edito, la marco Solicita cambio o la marco Reprogramada?” |
| Registrar llegada | Sí | — |
| Detectar 15 min de espera | No | “¿Dónde veo desde cuándo espera?” |
| Cobrar | No de forma segura | “¿Por qué Cobrar dice Nuevo anticipo?” |
| Crear siguiente cita | Parcial | “¿Dónde indico que vuelva en tres meses?” |
| Gestionar trabajo de laboratorio | No | “¿Está en Agenda, Listados, Historial o Administración?” |
| Cerrar caja | No | “¿Dónde hago el arqueo que anuncia la pantalla?” |

### Odontólogo con experiencia clínica, nuevo en DentCore

| Tarea | ¿La descubriría? | Pregunta probable |
|---|---|---|
| Abrir paciente desde cita | Sí | — |
| Empezar visita | Parcial | “¿Entro en Diagnóstico, Sesión actual o Pendientes?” |
| Registrar diagnóstico | Parcial | “¿Caries es diagnóstico y Endodoncia es tratamiento; por qué están juntos?” |
| Diagnosticar varias piezas | No de forma eficiente | “¿Tengo que hacerlo una a una y qué botón de Guardar uso?” |
| Crear plan/presupuesto | Parcial | “¿El doble clic añade tratamiento o cambia el odontograma?” |
| Registrar aceptación parcial | Requiere aprendizaje | “¿Dónde acepto cada línea y qué significa Preparar pendientes?” |
| Trabajar en varias sesiones | Requiere aprendizaje | “¿Cuál es la diferencia entre pendiente y sesión?” |
| Escribir nota | Ambigua | “¿Observación del tratamiento, nota de pieza o nota de sesión?” |
| Adjuntar radiografía | Sí, con pasos | “¿Por qué tengo que decidir carpeta y etiquetas si vengo de la sesión?” |
| Finalizar visita | No | “¿Dónde cierro todo y aviso a recepción?” |

## Matriz de problemas

Escalas: frecuencia **D** diaria, **S** semanal, **M** mensual, **O** ocasional; severidad/carga/riesgo 1–5; prioridad P0 crítica, P1 alta, P2 media, P3 baja.

| Problema | Pantalla | Rol | Frec. | Sev. | Carga | Tiempo perdido | Riesgo error | Solución | Prioridad |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| Caducidad a 4 h sin renovación/reintento | Global | todos | D | 5 | 5 | 5–15 min/incidente | 5 | refresh silencioso y recuperación de borrador | P0 |
| Cobrar abre anticipo sin deuda facturada | Ficha/Cobros | recepción | D | 5 | 4 | 1–4 min | 5 | checkout semántico único | P0 |
| Alergia presentada de forma contradictoria | Ficha | clínico | D | 5 | 4 | variable | 5 | fuente canónica y validación | P0 |
| Aceptado requiere “Preparar pendientes” | Presupuesto/Pendientes | clínico/recepción | D | 4 | 5 | 1–3 min/plan | 4 | conversión automática | P1 |
| Sin contador de espera | Hoy/Agenda | recepción | D | 4 | 4 | vigilancia continua | 4 | llegada con temporizador/SLA | P1 |
| No admite hueco de 45 min | Agenda | recepción | D/S | 3 | 3 | 1–5 min | 3 | duración libre/configurable | P1 |
| Primera visita duplica odontograma | Primera visita | odontólogo | D | 4 | 5 | 3–10 min | 4 | captura única estructurada | P1 |
| Diagnóstico mezcla condición/propuesta/realizado | Odontograma | odontólogo | D | 5 | 5 | 1–5 min | 5 | modelo semántico por modo | P1 |
| Sin operación múltiple en odontograma | Odontograma | odontólogo | D | 3 | 4 | 2–8 min | 3 | selección múltiple/plantillas | P1 |
| Sin cierre único de visita | Sesión/Caja/Agenda | todos | D | 5 | 5 | 3–8 min | 5 | finalizar visita + checkout | P1 |
| Próxima cita no hereda intervalo | Sesión/Agenda | clínico/recepción | D | 4 | 4 | 1–3 min | 4 | chips 1/3/6 meses y recall | P1 |
| 12 estados visibles de cita | Agenda | recepción | D | 3 | 5 | 1–2 min | 4 | seis estados humanos + metadatos | P1 |
| Ficha no responde “qué toca ahora” | Ficha | todos | D | 4 | 5 | 1–3 min/apertura | 4 | resumen orientado a siguiente acción | P1 |
| Visitas duplica Historial | Clínica | clínico | D/S | 2 | 4 | 1–4 min | 2 | agrupación dentro de Historial | P2 |
| 29 tratamientos históricos en factura | Facturación | recepción/admin | D/S | 4 | 5 | 3–10 min | 5 | preselección de visita y filtros | P1 |
| Caja no muestra arqueo pese al título | Caja | recepción/admin | D | 4 | 3 | proceso externo | 5 | apertura/cierre/diferencia | P1 |
| Hoy y Agenda duplican colas | Hoy/Agenda | recepción | D | 3 | 4 | 1–3 min | 3 | Jornada unificada | P1 |
| Listados y Reportes compiten | Informes/Admin | dirección | S/M | 3 | 4 | 5–20 min | 3 | centro analítico único | P2 |
| Laboratorio disperso en cinco lugares | Varios | recepción/clínico | D/S | 3 | 5 | 2–6 min | 4 | cola de excepciones contextual | P1 |
| Subida documental pide clasificación excesiva | Documentos | clínico/recepción | D | 2 | 3 | 1–3 min/archivo | 2 | autoclasificación por contexto | P2 |
| Assistant visible pero no disponible | Global | todos | D | 2 | 3 | interrupción/confusión | 2 | ocultar hasta configuración | P2 |
| Tabs principales sin nombre en árbol accesible observado | Paciente | teclado/lector | D | 4 | 4 | variable | 4 | nombre accesible y prueba E2E | P1 |
| Configuración mezcla 13 áreas | Administración | admin | M | 2 | 5 | 5–15 min | 3 | grupos + búsqueda de ajustes | P2 |
| Contadores cero y secciones vacías permanentes | Varias | todos | D | 2 | 4 | fatiga acumulada | 2 | revelar por excepción | P2 |

## Respuestas finales

1. **¿DentCore tiene demasiadas funciones?** Tiene demasiadas funciones visibles simultáneamente. La mayoría de capacidades pueden conservarse si se vuelven contextuales, opcionales o automáticas.
2. **¿Tiene demasiados módulos visibles?** El menú global de cinco/seis áreas no es excesivo. Sí lo son los submódulos: cinco pestañas clínicas, doce filtros de historial, trece pestañas administrativas y varias rutas paralelas para dinero, laboratorio e informes.
3. **¿La navegación es correcta?** Solo en su primer nivel. La separación Hoy/Agenda y Visitas/Historial es incorrecta; Reportes/Listados duplica Reportes; la sesión clínica no es el centro natural del episodio.
4. **¿La ficha está sobrecargada?** Sí. Muestra información útil con jerarquía insuficiente y duplicaciones concretas.
5. **¿Agenda está bien planteada?** La parrilla y las acciones rápidas son una base válida, pero el conjunto no: demasiada cromática/estado/configuración y faltan espera, 45 minutos y relleno de huecos.
6. **¿El workflow clínico es natural?** No. Primera visita duplica; diagnóstico mezcla semánticas; aceptación requiere preparación; sesión exige volver a seleccionar; cierre no está unificado.
7. **¿Hay conceptos innecesariamente separados?** Sí: Hoy/Agenda/llamadas/recordatorios; Plan/presupuesto/pendiente/sesión; Visitas/Historial; Factura/cobro/anticipo/caja; laboratorio operativo/directorio/reportes.
8. **¿Qué eliminaría visualmente?** Visitas como pantalla; “Preparar pendientes”; tab Control descriptivo; tab Documentos informativo de Administración; leyenda permanente de 12 estados; contadores y franjas vacías.
9. **¿Qué ocultaría?** odontograma completo fuera de edición; datos administrativos; catálogo exhaustivo; taxonomía documental; inventario, fichaje, asistente, auditoría, backups e importación según rol/configuración.
10. **¿Qué fusionaría?** Hoy + Agenda en Jornada; Visitas dentro de Historial; Plan + Presupuesto + Pendiente como una sola vida de líneas; cobro/anticipo/factura en Cuenta/Checkout; informes en un centro único.
11. **¿Qué falta?** continuidad de sesión 8 h, temporizador de espera, duración 45/custom, checkout, recall por intervalo, lista de espera compatible, fuente única de alertas y cierre de caja real.
12. **¿Cuáles son las diez mejoras de mayor impacto?** Renovación de sesión; checkout único; ficha de cinco segundos; aceptación automática a plan; sesión centrada en la cita; Jornada unificada; temporizador de espera; semántica del odontograma; próxima cita/recall; simplificación de estados.
13. **¿Cómo sería DentCore para enseñarlo mañana?** Mostraría solo Jornada, Pacientes y Caja para recepción; Jornada y Pacientes para odontología; Resumen/Clínica/Plan/Historial dentro del paciente; ocultaría módulos no configurados; usaría un único flujo completo de cita → llegada → sesión → checkout → próxima cita. No presentaría el asistente indisponible, tabs descriptivos ni transiciones técnicas.

## Decisión recomendada

Antes de añadir nuevas funciones, DentCore necesita una fase de **reducción y consolidación del producto**. La prioridad no es rediseñar colores ni crear más pantallas. Es decidir una semántica única para cita, plan, sesión y cuenta; hacer que el sistema derive estados; y diseñar cada puesto de trabajo alrededor de la siguiente acción.

La dirección propuesta se desarrolla en `UX_WORKFLOW_AUDIT.md` y `REDESIGN_PROPOSAL.md`.
