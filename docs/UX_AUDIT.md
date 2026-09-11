# Auditoría UX de DentCore

**Fecha:** 2026-09-04  
**Base:** aplicación real en `http://127.0.0.1:5173`, perfiles administrador y recepción, viewport de escritorio.

## Diagnóstico

La experiencia principal ya sigue una idea correcta: poca navegación global, paciente activo persistente, tres áreas internas y acciones contextuales. La sobrecarga no está repartida por toda la aplicación; se concentra en Agenda, Presupuestos, Visitas/Historial y Administración. Por eso no se recomienda un rediseño general, sino intervenciones localizadas con progressive disclosure.

## Lo que funciona bien

- La ficha responde en una sola vista quién es el paciente, qué alerta tiene, qué debe, cuándo vuelve y qué ocurrió recientemente.
- El mini odontograma de Ficha resume sin convertir la pantalla en editor clínico.
- Las acciones principales son Nueva cita, Cobrar y Más acciones; las secundarias no dominan la cabecera.
- Tratamientos organiza diagnóstico, pendiente, sesión, visitas y presupuesto bajo un solo contexto de paciente.
- La sesión actual incluye checklist de salida: tratamiento, caja y próxima cita.
- Los estados vacíos de Agenda, Caja y documentos explican qué falta.
- El presupuesto muestra el estado del proceso y conecta líneas aceptadas con pendiente/facturación.
- El preflight comercial traduce configuración técnica en acciones comprensibles.

## Hallazgos de sobrecarga

### UX-01 — Presupuesto como modal kilométrico

El panel reúne selector de presupuestos, stepper, acciones, odontograma completo, catálogo completo, edición y tabla de líneas en una misma superficie (`frontend/src/modules/pacientes/index.tsx:961` y `Presupuestos.tsx:179`). Un presupuesto con pocas líneas ya exige mucho scroll; con catálogo grande, la tarea primaria pierde foco.

**Clasificación:** A estado/total/acciones; B líneas; C odontograma y catálogo; E mostrar B+C simultáneamente.  
**Propuesta:** shell estable con resumen y líneas; añadir tratamiento y odontograma en drawers/pasos contextuales.

### UX-02 — Visitas e Historial se solapan

Visitas agrupa todos los días de actividad y vuelve a presentar realizados, previstos, comentarios, recetas, documentos y laboratorio (`ClinicalWorkspace.tsx:1104`). Historial compone otra vez todos esos eventos (`HistorialCompleto.tsx:207`) con 12 filtros y sin paginación. En los datos auditados se mostraron 35 días y 53 eventos.

**Clasificación:** A historial reciente; B búsqueda/filtrado; E dos recorridos casi equivalentes.  
**Propuesta:** Visitas como resumen clínico por sesión/fecha; Historial como ledger completo paginado. Evitar cargar/renderizar todo en ambas vistas.

### UX-03 — Administración tiene 13 destinos de igual peso

General, Clínicas, Usuarios/Roles, Doctores, Agenda/Horarios, Tratamientos, Protésicos/Lab., Inventario, Documentos, Reportes, Auditoría, Importación y Seguridad/Backups compiten en una sola franja.

**Clasificación:** D configuración; E jerarquía plana.  
**Propuesta:** cuatro grupos: Organización, Clínica, Operaciones y Seguridad; conservar URLs/tabs internas para no romper enlaces.

### UX-04 — Agenda muestra demasiada estructura antes de necesitarla

KPIs, leyenda de 11 estados, doctor/mes, llamadas, filtros y lienzo aparecen simultáneamente. En un día sin horario, la mayor parte del espacio queda vacío mientras la configuración necesaria está en Administración.

**Clasificación:** A agenda del día y acciones; B filtros/llamadas; C leyenda completa; D horarios.  
**Propuesta:** leyenda resumida, panel lateral plegable y estado vacío con acción contextual para quien tenga permisos.

### UX-05 — Modal de cita con demasiadas decisiones equivalentes

Paciente, fecha, hora, duración, profesional, gabinete, siete estados, tratamiento, notas e historial WhatsApp conviven en el mismo diálogo. Es potente, pero no diferencia crear/reprogramar de documentar una cita existente.

**Clasificación:** A paciente/hora/profesional/duración; B gabinete/tratamiento; C estados especiales e historial.  
**Propuesta:** creación compacta; edición con sección avanzada; estados como acciones contextuales según transición válida.

### UX-06 — Estados internos visibles

El historial muestra cadenas como `en_clinica` y textos sin normalizar como `Clinico`. El modelo de cita mezcla estados españoles e ingleses (`backend/app/models/cita.py:11`).

**Clasificación:** F exposición técnica.  
**Propuesta:** catálogo único de estados, etiquetas localizadas y transición centralizada.

### UX-07 — Carga completa y error agregado del workspace

`PacientesPage` inicia más de una docena de queries del paciente, incluso de módulos no visibles (`frontend/src/modules/pacientes/index.tsx:226-336`). El error de unas pocas queries se combina en `hasPatientError`, aumentando el riesgo de que una función secundaria contamine la vista principal.

**Clasificación:** E carga y feedback acoplados.  
**Propuesta:** cargar el resumen imprescindible primero y diferir recursos por pestaña/drawer; aislar fallos por bloque.

### UX-08 — Datos clínicos escritos en observaciones generales

En el perfil Recepción, `datos_salud` se ocultó correctamente, pero la cabecera siguió mostrando “Alérgico a la penicilina” porque el texto estaba en `Paciente.observaciones`. El componente usa salud o, en su defecto, observación general como alerta (`FichaPaciente.tsx:342`).

**Clasificación:** E duplicación semántica y riesgo de privacidad.  
**Propuesta:** separar alerta clínica, alerta administrativa y nota general; migración asistida, no automática.

### UX-09 — Caja promete un workflow inexistente

La pantalla se presenta como “Cobros, facturas y arqueo diario” (`frontend/src/modules/caja/index.tsx:128`), pero solo contiene KPIs, filtros y facturas. El usuario no puede abrir/cerrar turno, introducir recuento ni explicar diferencias.

**Clasificación:** F promesa no cumplida; A cierre diario faltante.  
**Propuesta:** hasta implementar el dominio, cambiar el texto; después añadir cierre como flujo guiado separado de la tabla de facturas.

## Clasificación global A–F

| Clase | Contenido |
|---|---|
| A — imprescindible/frecuente | buscar/identificar paciente, alertas, cita, llegada, pendiente, sesión, cobro, próxima cita |
| B — importante/ocasional | documentos, consentimiento, receta, laboratorio, anticipo, reprogramación, filtros |
| C — avanzado | odontograma contextual completo, rectificación fiscal, cadenas de integridad, importación, asistente |
| D — configuración | clínicas, usuarios, roles, catálogos, horarios, proveedores, backups |
| E — redundante | Visitas vs Historial completo; observación general usada como alerta clínica; cargas duplicadas |
| F — prescindible o engañoso | estados técnicos sin traducir; mención de arqueo sin workflow; métricas sin acción contextual |

## Simulaciones por rol

### Recepcionista: alta y cita

El camino actual es corto si se crea primero paciente y luego cita, y el contexto se conserva. Las mejoras necesarias son responsable/tutor, lista de espera y búsqueda normalizada por teléfono. No debe pedir antecedentes clínicos completos durante una llamada.

### Recepcionista: llegada, cobro y siguiente cita

Agenda permite estado y edición; la ficha permite Cobrar; la sesión clínica expone el checklist. El punto roto es el cierre de caja, no el cobro individual. La recepción tampoco debería recibir diagnósticos o notas completas por endpoints directos.

### Odontólogo: abrir y comprender

La cabecera, alertas, mini odontograma y última visita cumplen el objetivo de segundos. Diagnóstico → odontograma → presupuesto → pendiente → sesión está conectado. Visitas e Historial deben diferenciarse mejor para no obligar a elegir entre dos cronologías similares.

### Auxiliar/higienista

El rol auxiliar puede ayudar en sesión y odontograma, pero “higienista” no tiene configuración, agenda, producción ni límites propios. Antes de crear otra navegación debe modelarse como perfil/permiso, no como módulo.

### Administración/dirección

Los datos existen, pero los informes se presentan principalmente como tablas. Cada KPI debería responder: qué cambió, por qué importa y qué lista accionable abre. Cierre de caja y restauración de backup son vacíos más graves que nuevos gráficos.

## Arquitectura de información recomendada

No se recomienda reemplazar las seis entradas globales actuales. Son más simples que la hipótesis de ocho módulos. Mantener:

1. Hoy
2. Agenda
3. Pacientes
4. Caja
5. Reportes
6. Administración

WhatsApp debe aparecer como bandeja contextual desde Hoy/Agenda y como destino global solo si el volumen lo justifica. Laboratorio, recetas, consentimientos y documentos deben seguir integrados en el paciente y ofrecer listados administrativos, no nuevas pestañas principales.

La mejora estructural prioritaria es una búsqueda global de paciente, teléfono, DNI, cita, factura, presupuesto y profesional. Debe abrir el objeto en su contexto, no crear un séptimo módulo.

## Accesibilidad y responsive

La aplicación usa labels, roles, nombres accesibles y foco en muchas superficies; Playwright pudo operar formularios y botones por nombre. Quedan riesgos:

- algunos botones de tabs del paciente aparecen sin nombre en el snapshot accesible;
- no existe evidencia de auditoría WCAG automatizada/teclado completa;
- grandes tablas y barras horizontales dependen de scroll;
- color comunica estado, aunque suele acompañarse de texto;
- los modales largos necesitan foco inicial, retorno de foco y recorrido de teclado verificados.

## Principios para la implementación

- No cambiar la navegación global antes de cerrar búsqueda y permisos.
- Cargar primero el resumen; diferir el detalle.
- Una acción principal por estado del workflow.
- No usar `observaciones` como contenedor universal.
- No crear nuevas pantallas para funciones que pertenecen a paciente/agenda/caja.
- Medir cada mejora con un recorrido verificable y pruebas por rol.

Las tareas ejecutables y sus criterios están en `IMPROVEMENT_BACKLOG.md`.
