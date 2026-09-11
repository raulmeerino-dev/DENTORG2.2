# Auditoría UX y de workflows de DentCore

**Fecha:** 4 de septiembre de 2026  
**Objetivo:** medir la fricción operativa real de Recepción y Odontología y contrastar la navegación actual con una arquitectura orientada a tareas.  
**Estado:** análisis y decisiones; no contiene implementación.

## Cómo interpretar los cálculos

- **Pantalla** es un cambio de puesto de trabajo principal: Hoy, Agenda, Paciente, Caja, etc.
- **Modal/drawer** se cuenta por separado porque mantiene el fondo, pero obliga a un nuevo contexto de decisión.
- **Clics** es una estimación del camino visible y descubrible más corto. No se emplea botón derecho ni el asistente.
- **Campos** cuenta datos que el usuario debe introducir o seleccionar; no cuenta valores ya precargados si son correctos.
- No se confirmaron operaciones reales. Los flujos se recorrieron hasta el paso previo a guardar.

## Test de recepcionista

### Resumen cuantitativo

| Caso | Pantallas | Clics aprox. | Campos | Modales | Cambios de contexto | Información que debe recordar | Automatización posible |
|---|---:|---:|---:|---:|---:|---|---|
| A. Paciente nuevo quiere cita | 1–2 | 8–12 | 7–9 en alta rápida; 12+ en alta completa | 1–2 | 1–2 | nombre, teléfono, motivo, duración, preferencia y hueco hablado | búsqueda de duplicado, alta mínima y cita en un compositor |
| B. Paciente existente cambia cita | 1 | 5–9 | 2–4 | 1–2 | 1 | cita original y nueva preferencia mientras busca | abrir desde búsqueda, conservar duración/profesional y mostrar huecos |
| C. Paciente llega | 1 | 1–2 | 0 | 0 | 0 | nada | registrar hora de llegada automáticamente |
| D. Lleva 15 min esperando | 1 | no existe acción/alerta | 0 | 0 | 0 | hora de llegada y hora actual | contador y alerta por umbral |
| E. Hueco inesperado de 45 min | 1 | 4–7 | 3–5 | 1 | 0–1 | duración exacta, profesional, pacientes pendientes | casar hueco con lista de espera; admitir 45 min |
| F. Termina y paga todo | 2 | 8–14 | 4–6 | 1–2 | 2 | qué se realizó, qué facturar y si existe factura | checkout desde visita con factura/pago en una secuencia |
| G. Paga solo una parte | 2 | 10–16 | 5–7 | 2 | 2–3 | total, anticipo previo, factura seleccionada y saldo resultante | saldo calculado y propuesta de pago parcial |
| H. Debe volver en tres meses | 2 | 6–10 | 4–6 | 1–2 | 1–2 | fecha calculada, motivo, duración y profesional | intervalo +3 meses y recall si no reserva |
| I. Cancela | 1 | 3–5 | 1–2 | 1 | 0–1 | si cancela o quiere reprogramar | motivo rápido, liberar hueco y buscar sustituto |
| J. No aparece | 1 | 3–4 | 0–1 | 1 | 0 | política de la clínica | registrar falta, crear seguimiento y aplicar regla de reincidencia |

### A. Llama un paciente nuevo y quiere cita

#### Recorrido actual

1. Entrar en Agenda o pulsar Nueva cita.
2. Abrir el formulario de cita.
3. El formulario puede venir con el paciente previamente activo seleccionado, incluso si la llamada es de otra persona.
4. Abrir “Crear paciente temporal”.
5. Introducir nombre y teléfono.
6. Pulsar “Apuntar”.
7. Seleccionar fecha, inicio, fin/duración, profesional, gabinete y tratamiento/motivo.
8. Guardar.

Si se decide crear una ficha completa antes de citar, el flujo cambia a Pacientes → nueva ficha con nombre, apellidos, nacimiento, NIF, dos teléfonos, email, dirección, código postal, población, provincia y observaciones → Agenda → nueva cita.

#### Fricción concreta

- La alta rápida y la completa son dos modelos distintos sin una reconciliación visible durante la llamada.
- Buscar paciente y seleccionar paciente son dos controles separados.
- El paciente activo anterior puede convertirse en valor predeterminado de una nueva cita. Es un riesgo mayor que un campo vacío.
- El usuario debe decidir demasiados estados y datos antes de reservar.
- No hay una comprobación de duplicado presentada como parte del alta rápida.

#### Flujo deseado

Un solo compositor global:

`Buscar nombre/teléfono → coincidencia o “Crear Ana 612…” → elegir motivo/duración → elegir uno de los mejores huecos → Guardar cita`

La ficha queda en estado “mínima” y se completa en recepción o mediante enlace al paciente.

### B. Paciente existente quiere cambiar su cita

#### Recorrido actual

Si la cita no está visible, hay que abrir Buscar cita, localizarla, abrir Editar cita y modificar fecha/hora. El formulario expone simultáneamente fecha, inicio, fin, duración, profesional, gabinete, siete estados, tratamiento previsto, observaciones y comunicación por WhatsApp.

#### Fricción concreta

- “Solicita cambio”, “Reprogramada” y editar directamente la fecha parecen tres caminos válidos.
- Hora de fin y duración son dos representaciones editables del mismo dato.
- La búsqueda de hueco es otra herramienta separada, por lo que el usuario recuerda la cita original mientras cambia de modal.
- Se mezclan reprogramación, seguimiento de comunicación y edición clínica.

#### Flujo deseado

`Buscar paciente/cita → Cambiar → conservar duración, profesional y motivo → mostrar huecos compatibles → elegir → confirmar comunicación`

El cambio genera el evento “reprogramada”; no debe ser un estado actual que el usuario seleccione.

### C. El paciente llega

#### Recorrido actual

La cita visible permite “En clínica”. Es una de las pocas operaciones cotidianas con una acción directa clara.

#### Fricción concreta

La hora de llegada no se convierte en información operativa visible. El cambio de estado existe, pero la clínica no obtiene el dato necesario para gestionar la espera.

#### Flujo deseado

Un clic registra llegada, hora y lugar. La fila pasa a una cola de espera con contador y color solo cuando se supera el umbral.

### D. Lleva 15 minutos esperando

#### Recorrido actual

No existe un contador ni una alerta específica. Hoy agrupa “En clínica”, pero el usuario debe recordar la hora de llegada o compararla manualmente con la hora de la cita.

#### Fricción concreta

El sistema almacena un estado, pero no resuelve el problema humano. La recepcionista sigue haciendo vigilancia mental.

#### Flujo deseado

`En espera · 15 min` con umbral por clínica/profesional. A los 10/15 minutos, la fila sube en prioridad y puede avisar al gabinete sin cambiar de pantalla.

### E. Queda libre un hueco de 45 minutos

#### Recorrido actual

Buscar hueco permite doctor, paciente, turno, fecha inicial, rango y duración. Las duraciones disponibles son 10, 20, 30, 40, 50, 60, 90 y 120 minutos. **45 minutos no está disponible.**

Aunque se use 40 o 50, el resultado solo muestra espacios; no propone a quién llamar ni qué tratamientos pendientes encajan.

#### Fricción concreta

- El caso solicitado no puede expresarse exactamente.
- La cola Telefonear está separada del buscador de huecos.
- No se cruzan duración, profesional, tratamiento, disponibilidad del paciente y prioridad.

#### Flujo deseado

Al liberarse la cita:

`Hueco 16:00–16:45 → 4 candidatos compatibles → llamar/WhatsApp → reservar con un clic`

La duración admite valor libre y favoritos configurables.

### F. Termina tratamiento y tiene que pagar

#### Recorrido actual

La sesión dispone de un checklist que puede indicar “Debe pasar por caja”. Sin embargo, esa acción llama al mismo flujo de “Cobrar” de la ficha. Si no existe factura pendiente, se abre “Nuevo anticipo”, aunque el paciente acabe de recibir un tratamiento facturable.

Para facturar correctamente, recepción debe cerrar ese modal, abrir Emitir factura, seleccionar manualmente el tratamiento dentro de una lista que en el paciente auditado contiene 29 actuaciones no facturadas, completar/revisar datos y marcar “Generar cobro y marcar como pagada” o facturar primero y cobrar después.

#### Fricción concreta

- El camino sugerido por la sesión conduce a un concepto económico distinto.
- Se pierde el contexto de “lo realizado hoy”.
- La lista histórica aumenta el riesgo de facturar la línea equivocada.
- La factura y el cobro son pasos coordinados manualmente.

#### Flujo deseado

`Paciente termina → Checkout pendiente en Recepción → hoy: Limpieza 60 € → Facturar y cobrar → método → recibo → siguiente cita`

### G. Paga solo una parte

#### Recorrido actual

El modal de cobro de una factura sí permite introducir un importe inferior al pendiente. El problema está en llegar a una factura correcta. El checkbox del creador de factura solo representa el caso binario “generar cobro y marcar pagada”; para pago parcial hay que crear la factura, volver a localizarla y abrir otro modal.

#### Fricción concreta

- El flujo frecuente de pago parcial requiere dos operaciones y dos contextos.
- Anticipo, pago parcial y crédito a favor son caminos diferentes sin un selector semántico común.
- No se presenta antes de confirmar el saldo final ni la aplicación de anticipos existentes.

#### Flujo deseado

En el mismo checkout:

`Total 600 € · Anticipo aplicado 100 € · Pendiente 500 € → Cobra ahora [200] → Restará 300 €`

### H. Debe volver dentro de tres meses

#### Recorrido actual

La sesión muestra “Próxima cita” y abre Agenda. No transporta una recomendación “3 meses”, tratamiento, duración ni profesional. El usuario calcula la fecha, navega y vuelve a construir la cita. Si el paciente no decide en ese momento, no hay un recall clínico explícito como resultado del cierre.

#### Fricción concreta

- Se pierde la intención clínica al cruzar de Sesión a Agenda.
- La recepcionista necesita recordar la indicación verbal.
- “No cita ahora” equivale fácilmente a “no seguimiento”.

#### Flujo deseado

El odontólogo deja `Revisión · 3 meses · 30 min · Dr. X`. Recepción ve esa recomendación en checkout y puede reservar o crear automáticamente una tarea de recall para la ventana indicada.

### I. El paciente cancela

#### Recorrido actual

Cancelar abre un modal con tipo y motivo. Los tipos incluyen cancelada por paciente, por clínica, reprogramada, no vino y otro.

#### Fricción concreta

- Reprogramar es una acción, no un motivo de cancelación.
- “No vino” ocurre después de la cita, no es una modalidad equivalente de cancelación.
- Liberar el hueco no dispara una propuesta para cubrirlo.

#### Flujo deseado

`Cancelar → motivo breve → ¿buscar otra fecha ahora?`  
El hueco liberado genera una excepción operativa y candidatos si aún es aprovechable.

### J. El paciente no aparece

#### Recorrido actual

El menú contextual ofrece “No asistió” y un modal con motivo “No vino” precargado. La operación es razonablemente corta, pero el camino más rápido depende de descubrir el menú/contexto de la cita.

#### Fricción concreta

Registrar el hecho no crea de forma evidente una tarea de contacto, aplica una política de reincidencia ni ofrece reprogramación.

#### Flujo deseado

`No asistió → registrar → [Enviar mensaje] [Llamar después] [No reprogramar]`  
La ficha muestra el patrón de faltas sin convertirlo en otro estado permanente de Agenda.

## Test de odontólogo

### Resumen cuantitativo

| Caso | Pantallas | Clics aprox. | Campos/entradas | Modales | Trabajo administrativo impuesto |
|---|---:|---:|---:|---:|---|
| A. Primera visita | 2 | 8–15 + 3–5 por pieza | 10 textos + hallazgos dentales | 0–1 | duplicar ausencias, implantes, prótesis y caries |
| B. Revisión | 2 | 4–7 | 1–3 | 0 | elegir entre Diagnóstico, Pendientes y Sesión |
| C. Diagnóstico de varias piezas | 1 | 12–25 para 3–5 piezas | 1 acción por pieza/superficie | 0–varios | repetir selección y decidir entre tres guardados |
| D. Creación de tratamiento | 1–2 | 4–8 por línea | tratamiento, pieza, caras, precio/descuento | 0–1 | traducir diagnóstico a catálogo manualmente |
| E. Presupuesto | 1 | 10–25 según líneas | 4–5 por línea | 1 de gran tamaño | gestionar odontograma, catálogo, estados y economía juntos |
| F. Acepta solo parte | 1 | 3 por línea + transición | 0 | 1 | seleccionar línea, abrir Más, aceptar y luego preparar |
| G. Varias sesiones | 3 | 10–18 iniciales + citas | 2–5 por sesión | 1–2 | preparar, dar citas y volver a añadir/relacionar trabajo |
| H. Registrar realizado | 1 | 2–4 por actuación | observación opcional | 0 | confirmar catálogo/pieza antes de finalizar |
| I. Nota clínica | 1 | 2–5 | 1 texto/dictado | 0–1 | elegir entre observación, nota de pieza y nota de sesión |
| J. Radiografía/documento | 1 | 5–9 | archivo + 3–5 metadatos | 1 drawer/modal | clasificar carpeta/etiquetas que el contexto podría inferir |
| K. Consentimiento | 1 | 6–12 | plantilla + datos/firma | 1 | localizar plantilla y asociarla manualmente |
| L. Próxima visita | 2 | 6–10 | 4–6 | 1–2 | recordar y transmitir intervalo, motivo, duración y profesional |

### A. Primera visita

La valoración inicial despliega fecha, motivo, dientes ausentes, implantes existentes, prótesis/coronas/puentes, caries/reconstrucciones, estado periodontal, higiene/mucosa, plan recomendado y observaciones. Debajo permanece el odontograma completo.

**Respuesta a la pregunta administrativa:** sí. El odontólogo documenta dos veces el mismo estado y después debe convertirlo de nuevo en líneas de plan.

**Dirección correcta:** una sesión “Primera visita” con motivo, alertas, exploración general y odontograma como fuente estructurada. El resumen textual se deriva automáticamente y el profesional solo redacta excepciones e impresión clínica.

### B. Revisión

El profesional llega al paciente y encuentra cinco destinos clínicos: Diagnóstico, Pendientes, Sesión actual, Visitas y Presupuestos. Para una cita que hoy es una revisión, el sistema debería abrir directamente la sesión correspondiente a esa cita.

**Trabajo administrativo impuesto:** decidir qué módulo representa el encuentro actual.

### C. Diagnóstico de varias piezas

El odontograma permite seleccionar una pieza/superficie y aplicar acciones. No existe una selección múltiple visible. Caries, Obturación, Endodoncia, Corona, Ausente, Pendiente y Realizado se muestran juntos pese a representar categorías distintas.

**Trabajo administrativo impuesto:** repetir el ciclo por pieza y entender una semántica que el sistema debería separar por modo.

### D. Creación de tratamiento

El diagnóstico no genera una propuesta clínica. El usuario vuelve a abrir Presupuesto o Sesión, selecciona catálogo, pieza y caras. En Presupuesto, el doble clic es parte del mecanismo, pero no una affordance clara para un empleado nuevo.

**Trabajo administrativo impuesto:** traducir manualmente un hallazgo ya estructurado a una línea que repite la pieza.

### E. Presupuesto

El modal de Presupuestos comienza con selector, aviso, estado, acciones y flujo; después muestra un odontograma completo y, más abajo, edición/catálogo/líneas. La primera pantalla se dedica a elegir piezas, no a comprender o presentar el plan.

**Trabajo administrativo impuesto:** operar un editor técnico incluso cuando solo se quiere explicar o aceptar un presupuesto.

### F. El paciente acepta solo parte

La aceptación por línea existe, pero está en “Más” y exige seleccionar una línea. Después, las aceptadas permanecen “por preparar”.

**Trabajo administrativo impuesto:** confirmar dos veces una decisión que ya tomó el paciente: aceptar y preparar.

### G. Tratamiento en varias sesiones

El flujo conceptual actual es:

`Presupuesto aceptado → Preparar pendientes → Pendientes → Dar cita → Sesión → Finalizar línea → Historial`

Cada etapa es técnicamente coherente, pero el profesional gestiona el estado de la máquina. Además, una línea como ortodoncia, endodoncia o implante puede necesitar varias sesiones; una relación binaria pendiente/realizado no expresa bien el progreso.

**Trabajo administrativo impuesto:** crear/seleccionar unidades de sesión y mantener su relación con el plan.

### H. Registro de tratamiento realizado

“Finalizar como realizado” crea el evento de historial. Esta transición debe conservarse, pero el elemento debería venir precargado desde la cita/plan y permitir finalizar varios elementos juntos.

**Trabajo administrativo impuesto:** confirmar de nuevo catálogo, nombre, pieza y caras si el plan no llegó preparado.

### I. Nota clínica

La sesión ofrece observación clínica del tratamiento, nota rápida de pieza y dictado de nota de sesión. Los tres pueden ser legítimos internamente, pero no se explica cuál debe usar el odontólogo para una nota habitual.

**Trabajo administrativo impuesto:** elegir la clase de persistencia antes de escribir.

La interfaz debería ofrecer una única nota de sesión con bloques opcionales por tratamiento/pieza. El sistema reparte y relaciona la información internamente.

### J. Radiografía o documento

El acceso existe desde acciones secundarias. La subida pide archivo, nombre, fecha, carpeta, etiquetas y permite crear otra carpeta. Si se inicia desde una sesión y el usuario pulsa “Radiografía”, tipo, paciente, fecha y episodio deberían venir dados.

**Trabajo administrativo impuesto:** catalogación repetitiva.

### K. Consentimiento

Existen plantillas por Implantes, Extracciones, Endodoncia, Ortodoncia, Blanqueamiento, Limpieza y Personalizado. La función es contextual, pero también aparece mezclada con Documentos y en múltiples menús.

**Trabajo administrativo impuesto:** volver a seleccionar un tipo que puede derivarse del plan y decidir desde qué pantalla abrirlo.

### L. Próxima visita

El odontólogo puede abrir Agenda, pero no entregar una instrucción estructurada a recepción. Para una clínica real, “volver en tres meses” es un resultado clínico, no una conversación efímera.

**Trabajo administrativo impuesto:** calcular fecha, recordar motivo/duración y comunicarlo fuera del sistema.

## ¿Dónde hace el odontólogo trabajo que debería hacer el sistema?

| Trabajo actual del profesional | Lo que debería hacer DentCore |
|---|---|
| repetir ausencias, implantes, caries y prótesis | derivar resumen desde odontograma |
| convertir diagnóstico a tratamiento copiando pieza/caras | proponer líneas de plan editables |
| aceptar una línea y después “prepararla” | activar automáticamente la línea aceptada |
| volver a seleccionar tratamiento para la sesión | cargar lo previsto en la cita y plan |
| decidir entre tres tipos de nota | ofrecer una nota clínica única con asociaciones automáticas |
| marcar pieza/estado realizado por separado | actualizar odontograma al finalizar actuación |
| avisar verbalmente “vuelve en tres meses” | guardar recomendación de seguimiento |
| indicar a recepción qué cobrar | generar checkout con actuaciones de hoy |
| recordar que falta consentimiento/laboratorio | mostrar bloqueo contextual antes de la sesión/cita |

## Auditoría de navegación

### Navegación actual

```text
Lanzador global
├─ Hoy
├─ Agenda
├─ Pacientes
│  ├─ Ficha
│  ├─ Tratamientos
│  │  ├─ Diagnóstico
│  │  ├─ Pendientes
│  │  ├─ Sesión actual
│  │  ├─ Visitas
│  │  └─ Presupuestos
│  └─ Historial
│     ├─ Todo
│     ├─ Clínico
│     ├─ Citas
│     ├─ Presupuestos
│     ├─ Facturación
│     ├─ Cobros
│     ├─ Documentos
│     ├─ Consentimientos
│     ├─ Recetas
│     ├─ Laboratorio
│     ├─ WhatsApp
│     └─ Odontograma
├─ Caja
├─ Reportes/Listados
│  ├─ Caja/Facturas
│  ├─ Pacientes
│  ├─ Agenda
│  ├─ Clínica
│  ├─ Protésicos
│  └─ Control
└─ Administración (solo admin)
   ├─ General
   ├─ Clínicas
   ├─ Usuarios/Roles
   ├─ Doctores
   ├─ Agenda/Horarios
   ├─ Tratamientos
   ├─ Protésicos/Lab.
   ├─ Inventario
   ├─ Documentos
   ├─ Reportes
   ├─ Auditoría
   ├─ Importación
   └─ Seguridad/Backups

Siempre visible: asistente flotante
Ruta adicional: WhatsApp
```

El primer nivel parece corto, pero oculta una profundidad y una duplicación considerables. La arquitectura usa sustantivos del sistema (“Pendientes”, “Visitas”, “Facturación”) donde el usuario necesita verbos y resultados (“preparar la visita”, “cerrar al paciente”, “ver qué pasó”).

### Navegación ideal

```text
Navegación global según rol
├─ Jornada
│  ├─ Operación de hoy
│  ├─ Día / Semana
│  └─ Excepciones: espera, cambios, llamadas, huecos, laboratorio
├─ Pacientes
│  └─ Paciente activo
│     ├─ Resumen
│     ├─ Clínica
│     ├─ Plan
│     └─ Historia
├─ Caja                         [Recepción/Admin]
└─ Más                          [solo si está configurado]
   ├─ Laboratorio               [Pro]
   ├─ Inventario                [Pro]
   └─ Informes                  [Dirección]

Avatar / Ajustes                [Admin]
├─ Organización y equipo
├─ Clínica y agenda
├─ Catálogos y plantillas
├─ Facturación y pagos
└─ Seguridad y datos

Acciones globales
├─ Buscar paciente
├─ Nueva cita
├─ Nuevo paciente
└─ Checkout / Cobrar
```

### Comparación exacta

| Actual | Ideal | Decisión |
|---|---|---|
| Hoy + Agenda | Jornada con modos Operación/Día/Semana | fusionar |
| Llamadas y Recordatorios repartidos | cola de excepciones de Jornada | contextualizar |
| Ficha / Tratamientos / Historial | Resumen / Clínica / Plan / Historia | cambiar modelo mental |
| Diagnóstico dentro de Tratamientos | modo de Clínica/encuentro | mover |
| Pendientes | estado/filtro del Plan y cola global de “sin cita” | fusionar |
| Sesión actual como tab manual | sesión abierta automáticamente desde cita | convertir en centro clínico |
| Visitas | agrupación del Historial | eliminar pantalla |
| Presupuestos como editor modal dominante | vista comercial del Plan | fusionar |
| Reportes/Listados global | Informes de Dirección | sacar del menú normal |
| Administración en lanzador | Ajustes desde avatar | reservar a configuración |
| Protésicos en Listados y Admin | operación contextual + directorio en ajustes | separar dato maestro de trabajo |
| Documentos en ficha, menú, historial y admin | drawer contextual + plantillas en ajustes | consolidar |
| Assistant siempre visible | Advanced, solo configurado | ocultar por defecto |

### Qué eliminar del menú principal

- uno de Hoy/Agenda: ambos se convierten en Jornada;
- Reportes/Listados para recepción normal;
- Administración del lanzador de trabajo; se mueve al avatar/Ajustes;
- cualquier módulo Pro no activado.

### Qué convertir en contextual

- documentos, consentimientos, recetas y laboratorio;
- llamadas/recordatorios y cambios solicitados;
- facturación de la visita;
- odontograma completo;
- datos fiscales y pagador;
- comunicaciones WhatsApp de una cita/paciente.

### Qué dejar exclusivamente en configuración

- clínicas, usuarios, roles y permisos;
- doctores, gabinetes y horarios;
- catálogo/familias/precios/IVA;
- directorio de laboratorios y proveedores;
- plantillas documentales;
- formas de pago y series;
- importación, backups, seguridad y consulta de auditoría.

### Acciones globales necesarias

- búsqueda universal de paciente;
- nueva cita con alta mínima;
- nuevo paciente;
- checkout/cobro por paciente;
- cambiar clínica/profesional/fecha cuando el rol lo permita.

No deben ser globales “Emitir factura”, “Crear consentimiento” o “Pedido laboratorio”: necesitan un paciente y un contexto concreto.

## Duplicaciones conceptuales

### Tratamientos, trabajo pendiente, sesión, odontograma, historial y presupuestos

La separación interna correcta es:

```text
Hallazgo/condición
      ↓
Diagnóstico
      ↓
Línea de plan propuesta
      ↓ decisión del paciente
Aceptada / no aceptada
      ↓ planificación
Una o varias sesiones previstas
      ↓ ejecución
Actuación realizada e inmutable
      ↓
Historia clínica
```

La UI actual expone casi cada transformación como módulo o botón. La UI ideal presenta cuatro conceptos humanos:

1. **Clínica:** qué vemos y qué hacemos hoy.
2. **Plan:** qué se propone, acepta, programa y progresa.
3. **Cita/Sesión:** cuándo y qué parte del plan se ejecuta.
4. **Historia:** qué ocurrió realmente.

El odontograma no es un quinto inventario. Es una representación de Clínica/Plan/Historia según el modo.

### Factura, cobro, caja y anticipo

La separación contable correcta es:

```text
Actuación/cargo
   ├─ Factura: documento fiscal
   ├─ Pago: dinero aplicado a factura/deuda
   ├─ Anticipo: dinero recibido antes del cargo/factura
   └─ Saldo: resultado de cargos, pagos, créditos y ajustes

Caja: libro del turno/medio de pago, no la cuenta del paciente
```

El usuario debe ver:

- **Cuenta del paciente:** cargos, facturas, pagos, anticipos y saldo;
- **Checkout:** decisión operativa al salir;
- **Caja:** conciliación del dinero del día.

No debe decidir primero en qué entidad interna está su tarea.

### Hoy, Agenda, llamadas y recordatorios

La separación correcta es:

```text
Cita = reserva temporal
Comunicación = evento enviado/recibido
Tarea = algo que requiere intervención
Jornada = vista de citas + tareas excepcionales
```

“MSG” no es un estado de cita. “Solicita cambio” es una tarea asociada a una cita. “Reprogramada” es un evento histórico. “Revisar” es una bandera. Convertirlos en estados paralelos genera una leyenda de 12 opciones y decisiones innecesarias.

### Reducción de estados de Agenda

| Estado visible actual | Representación ideal |
|---|---|
| Sin confirmar | Programada + badge “sin confirmar” |
| MSG | evento de comunicación, no estado |
| Confirmada | Confirmada |
| Solicita cambio | tarea prioritaria “cambio solicitado” |
| Revisar | bandera/tarea, no estado |
| Cancelada paciente | Cancelada + motivo paciente |
| Reprogramada | evento en historial; la cita actual queda programada |
| En clínica | En clínica / esperando |
| En tratamiento | En atención |
| Finalizada | Finalizada |
| Cancelada | Cancelada + motivo clínica/otro |
| No asistió | No asistió, terminal y claramente distinto |

## Workflow actual frente a workflow deseado

### Recepción

```text
Actual
Llamada → buscar/alta → formulario amplio → Agenda
Llegada → estado En clínica → vigilancia mental
Salida → ¿Cobrar o anticipo? → ¿factura? → Caja → Agenda otra vez

Deseado
Llamada → compositor paciente+cita
Llegada → espera cronometrada → atención
Finalización clínica → checkout de recepción → pago/recall → salida
```

### Odontología

```text
Actual
Paciente → elegir tab → primera visita + odontograma
→ presupuesto → aceptar líneas → preparar pendientes
→ dar cita → sesión → finalizar → historial
→ informar verbalmente cobro y próxima cita

Deseado
Cita abre Encuentro → diagnóstico único → Plan
→ paciente acepta subconjunto → líneas activas automáticamente
→ citas/sesiones consumen el Plan → finalizar actualiza Historia
→ checkout transmite cobro y seguimiento a Recepción
```

## Criterios de éxito para validar el rediseño

No debe aprobarse una futura implementación solo porque parezca más limpia. Debe cumplir métricas operativas:

- nueva persona + cita en menos de 60 segundos y sin riesgo de paciente anterior;
- registrar llegada en un clic y ver espera sin cálculo mental;
- mover una cita visible en menos de 20 segundos;
- buscar cualquier duración, incluido 45 minutos;
- abrir un paciente y responder las siete preguntas del resumen en cinco segundos;
- primera visita sin duplicar condición dental en texto y gráfico;
- aceptación parcial sin paso “Preparar”;
- sesión precargada desde la cita/plan;
- finalizar visita y producir checkout en una acción;
- pago completo o parcial en un único flujo;
- próxima visita/recall sin recordar instrucciones fuera del sistema;
- sesión autenticada recuperable durante toda una jornada.

## Conclusión de workflow

DentCore resuelve muchas operaciones por separado, pero no resuelve suficientemente bien la continuidad entre ellas. El mayor retorno no está en añadir otro módulo: está en hacer que los datos ya disponibles atraviesen automáticamente llamada, cita, sesión, plan, historia, checkout y seguimiento.

La propuesta concreta de pantallas y jerarquía se define en `REDESIGN_PROPOSAL.md`.
