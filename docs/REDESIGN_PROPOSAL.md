# Propuesta de rediseño de DentCore

**Fecha:** 4 de septiembre de 2026  
**Propósito:** convertir DentCore en un puesto de trabajo continuo, comprensible y eficiente para clínica real.  
**Estado:** dirección de producto para aprobación. No autoriza ni incluye implementación.

## Tesis de rediseño

DentCore debe dejar de presentar el sistema como una colección de módulos y empezar a presentarlo como tres puestos de trabajo:

1. **Jornada:** qué sucede hoy y qué requiere intervención.
2. **Paciente:** qué importa de esta persona, qué hacemos y qué queda por hacer.
3. **Caja:** qué dinero debe gestionarse y cómo se concilia el turno.

Todo lo demás es contexto, configuración o capacidad avanzada.

La reducción propuesta es visual y operativa. No implica borrar trazabilidad, entidades fiscales, estados internos, permisos, documentos ni datos clínicos. Implica que el sistema procese esa complejidad y solo pida una decisión cuando de verdad existe una decisión humana.

## Principios no negociables

1. Una tarea frecuente debe tener un único camino visible y nombrado como el objetivo del usuario.
2. El contexto de paciente y cita debe viajar entre pantallas sin depender de memoria humana.
3. Un dato derivable no se vuelve a pedir.
4. Un estado interno no se convierte automáticamente en una pantalla o botón.
5. Lo vacío y lo correcto permanece oculto; se muestra lo excepcional.
6. La información clínica crítica tiene una fuente canónica y no puede contradecirse visualmente.
7. Toda acción clínica/económica conserva autor, fecha, motivo y trazabilidad.
8. El producto Core no muestra funciones Pro/Advanced no configuradas.
9. La vista de escritorio prioriza superficie operativa horizontal; el scroll largo se reserva para Historia.
10. Una jornada de ocho horas debe soportarse sin recargas manuales ni pérdida de borradores.

## A. Nueva navegación global

### Recepción

```text
Jornada     Pacientes     Caja          Más ▾
                                       ├─ Laboratorio [si activo]
                                       ├─ Inventario [si activo]
                                       └─ Informes [si tiene permiso]

[Buscar paciente…]    [+ Nueva cita]    [+ Nuevo paciente]    [Checkout]
                                                   [Clínica] [Usuario/Ajustes]
```

### Odontología

```text
Mi jornada     Pacientes                Más ▾
                                       ├─ Laboratorio [si activo]
                                       └─ Informes clínicos [si permiso]

[Buscar paciente…]    [Abrir siguiente]    [+ Nota/documento con paciente activo]
                                                   [Clínica] [Usuario]
```

### Dirección/Administración

Informes no necesita competir con la operación diaria de todos. Dirección lo obtiene en “Más” o como inicio de su rol. Administración se abre desde Usuario/Ajustes, no desde el lanzador principal.

### Cambios exactos

- **Fusionar Hoy y Agenda** en Jornada.
- **Mantener Pacientes** como contexto principal.
- **Mantener Caja** para roles económicos.
- **Retirar Reportes/Listados del menú normal** y unificarlo con Reportes administrativos.
- **Mover Administración al avatar/Ajustes.**
- **Ocultar WhatsApp como ruta independiente.** Comunicaciones vive en Jornada y paciente.
- **Ocultar el asistente flotante** hasta que un administrador lo active y el motor esté operativo.
- **Añadir búsqueda de paciente y Nueva cita al encabezado global**, no solo dentro de Pacientes/Agenda.

## B. Nueva ficha del paciente

### Nueva arquitectura del paciente

```text
Resumen     Clínica     Plan     Historia
```

#### Resumen

Responde en cinco segundos quién es, qué ocurre hoy, riesgos, plan, cuenta y seguimiento.

#### Clínica

Abre el encuentro actual o permite revisar diagnóstico/odontograma. Primera visita es una plantilla del encuentro, no una pantalla permanente.

#### Plan

Contiene propuestas, presupuesto, aceptación, fases, progreso, trabajo por programar y sesiones previstas. “Pendiente” es un filtro, no un submódulo.

#### Historia

Fuente cronológica única. “Visitas” es una agrupación de esta historia.

### Ficha ideal: orden de prioridad

1. **Identidad:** nombre, edad, historia, contacto preferido.
2. **Alerta clínica canónica:** alergias, medicación/riesgo y alertas administrativas solo si afectan hoy.
3. **Contexto actual:** “Hoy 16:30 · revisión · ha llegado / espera 12 min”.
4. **Siguiente acción:** abrir sesión, agendar trabajo aceptado, completar consentimiento o checkout.
5. **Plan activo:** progreso, siguiente fase, aceptado sin cita y bloqueos.
6. **Cuenta:** saldo real y motivo, no una cifra aislada.
7. **Seguimiento:** próxima cita o recomendación de recall.
8. **Actividad reciente:** dos/tres eventos clínicos relevantes.
9. **Información secundaria:** odontograma resumido, documentos y datos administrativos colapsados.

### Qué sale del primer plano

- las 32 piezas del mini odontograma;
- datos completos de domicilio, póliza y profesión;
- tarjetas vacías de documentos/consentimientos;
- cifras económicas duplicadas;
- textos de alergia repetidos;
- botones separados de anticipo/factura/recibo.

### Qué permanece accesible

- un resumen dental con solo piezas afectadas y enlace “Abrir odontograma”;
- “Datos y contacto” en drawer;
- “Documentos” en drawer con últimos elementos;
- “Cuenta” con detalle de cargos/facturas/pagos;
- “Más acciones” para tareas secundarias.

## C. Nueva lógica de Agenda/Hoy

### Un único producto: Jornada

Jornada tiene tres modos, no tres módulos:

- **Operación:** cola cronológica de hoy con esperas y excepciones.
- **Día:** parrilla por profesional/gabinete.
- **Semana:** planificación.

La fecha, el profesional y la clínica se conservan al cambiar de modo.

### Estados humanos

Solo se muestran como estados principales:

1. Programada.
2. Confirmada.
3. En clínica.
4. En atención.
5. Finalizada.
6. Cancelada / No asistió.

Mensajes, solicitud de cambio, revisión y reprogramación son eventos, badges o tareas. No ocupan la leyenda como estados equivalentes.

### Panel de excepciones

La columna lateral no repite todos los KPI. Solo muestra elementos accionables:

- Espera > umbral.
- Cambio solicitado.
- Cita sin confirmar próxima.
- Hueco liberado con candidatos.
- Laboratorio que bloquea una cita.
- Checkout pendiente.

Si una categoría está a cero, no se muestra.

### Crear/mover cita

El mismo compositor sirve para crear y mover:

1. paciente o alta mínima;
2. motivo/tratamiento y duración sugerida;
3. restricciones: profesional, fecha/turno;
4. mejores huecos;
5. confirmación y comunicación.

Duración acepta cualquier valor razonable, incluido 45, y ofrece favoritos configurables.

### Espera

Al marcar llegada se registra la hora. El sistema muestra:

`Llegó 16:22 · Espera 14 min · Dr. X lleva 9 min de retraso`

El color solo cambia al superar umbral; no se colorea toda la agenda por decoración.

## D. Nuevo flujo clínico

### Encuentro como centro

Abrir la cita desde Jornada lleva directamente al **Encuentro** del paciente:

```text
Paciente + alerta + motivo de hoy
          ↓
Previsto para esta cita
          ↓
Diagnóstico / odontograma / nota / documentos
          ↓
Realizado / pospuesto / añadido
          ↓
Finalizar visita
          ↓
Historia + checkout + seguimiento
```

### Primera visita

Es una plantilla del Encuentro con cuatro bloques:

1. motivo y expectativas;
2. antecedentes/alertas relevantes;
3. exploración general no representable en odontograma;
4. diagnóstico dental en odontograma.

Ausencias, implantes, caries y coronas se registran una sola vez. El sistema genera un resumen textual editable, pero no obliga a volver a escribirlo.

### Odontograma

Debe tener modos con semántica estricta:

- **Estado actual:** condiciones existentes.
- **Diagnóstico:** hallazgos.
- **Plan:** propuestas.
- **Realizado/Historia:** lectura de actuaciones.

En cada modo se muestran solo acciones válidas. “Pendiente” y “Realizado” no aparecen como diagnósticos. Debe admitirse selección múltiple, deshacer y un único guardado coherente.

### Sesión

- Se crea/abre desde la cita de hoy.
- Carga automáticamente las líneas del plan asignadas a esa cita.
- Permite añadir una excepción mediante búsqueda simple, no mediante catálogo completo visible.
- Ofrece una nota clínica principal; asociaciones por tratamiento/pieza son automáticas u opcionales.
- Finalizar varios elementos juntos actualiza odontograma, plan e historia.
- “Finalizar visita” genera una entrega estructurada a recepción.

### Tratamientos de varias sesiones

El Plan debe distinguir:

- línea clínica aceptada;
- fase;
- sesiones previstas/realizadas;
- progreso;
- siguiente paso;
- dependencias: laboratorio, consentimiento, pago o cicatrización.

El usuario no crea entidades técnicas. Al agendar una fase se crea la sesión; al finalizarla se actualiza progreso.

## E. Nuevo flujo presupuesto → tratamiento → cobro

### Flujo propuesto

```text
Diagnóstico
   ↓ propone
Plan clínico
   ↓ selecciona qué se presenta
Presupuesto
   ↓ decisión por línea/fase
Aceptado / aplazado / rechazado
   ↓ automático
Plan activo por programar
   ↓ citas y sesiones
Realizado
   ↓ cargo facturable
Checkout
   ├─ factura ahora / según configuración
   ├─ aplicar anticipo
   ├─ pagar total/parcial/no pagar
   └─ recibo + saldo
```

### Reglas

- Aceptar una línea la activa inmediatamente; desaparece “Preparar pendientes”.
- Una línea no aceptada no se borra: permanece aplazada/rechazada con trazabilidad.
- Presupuesto y Plan comparten líneas; no se copian manualmente.
- La cita asigna una o varias líneas/fases a una sesión.
- Finalizar crea una actuación realizada y, si procede, un cargo facturable.
- La factura se preselecciona con lo realizado en la visita actual.
- El anticipo es saldo a favor, no el reemplazo por defecto de Cobrar.
- Caja recibe el pago; no decide qué tratamiento se facturó.

### Una única acción “Checkout”

El checkout muestra, en este orden:

1. actuaciones realizadas hoy;
2. importe facturable y pagador;
3. anticipos/saldo previo;
4. factura/documento fiscal;
5. pago total, parcial o pendiente;
6. siguiente cita o recall;
7. recibo y cierre.

La recepción puede completar todo sin reconstruir el contexto clínico.

## F. Módulos que desaparecerían visualmente

| Módulo/pantalla actual | Destino |
|---|---|
| Hoy | modo Operación de Jornada |
| Agenda | modos Día/Semana de Jornada |
| Visitas | agrupación por visita en Historia |
| Pendientes como tab | filtro/estado dentro de Plan; cola global solo “sin cita” |
| Presupuestos como gran modal técnico | modo Presentación/Edición del Plan |
| Reportes/Listados | absorbido por un único centro de Informes |
| Control de Listados | eliminado; no es una herramienta operativa |
| Documentos de Administración | eliminado como tab; plantillas dentro de Catálogos/Documentos |
| WhatsApp como ruta | comunicaciones contextuales en Jornada/Paciente |
| Laboratorio siempre visible en Agenda | excepción contextual; tablero Pro opcional |
| Asistente flotante indisponible | oculto hasta activación Advanced |

Las entidades y eventos internos pueden continuar existiendo. Lo que desaparece es su representación como destino independiente.

## G. Funciones que se esconderían

### Detrás de “Más” o drawer contextual

- receta, consentimiento, laboratorio y documento;
- revocación, circular, LOPD y cuestionario;
- historial de WhatsApp;
- edición manual de pieza/caras de una línea ya creada;
- anulación y operaciones económicas excepcionales;
- datos fiscales y pagador.

### Solo para usuario avanzado/configuración

- series y numeración fiscal manual;
- familias, códigos, precios e IVA del catálogo;
- proveedores/pedidos de inventario;
- directorios de laboratorios;
- auditoría, importación y backups;
- proveedor/modelo del asistente;
- configuración de horarios y gabinetes.

### Solo cuando exista una excepción

- laboratorio retrasado;
- citas sin confirmar;
- cambio solicitado;
- alertas de deuda;
- stock bajo mínimo;
- fallo de sincronización/conexión.

## H. Funciones que se añadirían

Cada adición responde a una carencia demostrada; no es una lista competitiva genérica.

1. **Renovación de sesión y recuperación de borrador.** Necesaria para ocho horas de uso.
2. **Temporizador de espera.** Convierte llegada en gestión real.
3. **Duración personalizada/favoritos.** Resuelve, entre otros, el hueco de 45 minutos.
4. **Lista de espera compatible con huecos.** Reduce tiempo clínico perdido.
5. **Checkout unificado.** Evita anticipo/factura/cobro incongruentes.
6. **Recomendación de próxima visita/recall.** Conserva la decisión clínica.
7. **Selección múltiple y plantillas en odontograma.** Reduce repetición.
8. **Fuente canónica y validador de alertas clínicas.** Evita contradicciones.
9. **Alta mínima con detección de duplicados.** Reduce tiempo y pacientes duplicados.
10. **Cierre de caja real.** Apertura, esperado, contado, diferencia y firma del turno.
11. **Entrega clínica a recepción.** Tratamiento, importe, consentimiento/documentos y próxima cita.
12. **Búsqueda/rango en Historia.** Hace utilizable una cronología larga.

## I. Automatizaciones propuestas

| Evento | Automatización |
|---|---|
| token próximo a caducar / petición 401 | renovar una vez, reintentar y preservar formulario |
| paciente marcado En clínica | guardar llegada e iniciar espera |
| espera supera umbral | elevar en Jornada y permitir avisar al gabinete |
| cita cancelada | liberar hueco, buscar candidatos y ofrecer reprogramar |
| diagnóstico registrado | proponer líneas de plan con pieza/caras |
| línea aceptada | activar plan pendiente y sugerir cita |
| cita creada desde plan | asociar fase y precargar sesión |
| tratamiento finalizado | actualizar progreso, odontograma e historia |
| visita finalizada | crear checkout para recepción |
| documento subido desde sesión | asignar paciente, fecha, episodio y tipo sugerido |
| consentimiento requerido por plan | mostrar bloqueo antes de sesión |
| laboratorio necesario | crear tarea ligada a línea/cita y avisar por excepción |
| factura de visita | preseleccionar actuaciones de hoy y aplicar anticipos |
| próxima visita no reservada | crear recall en la ventana indicada |
| cierre de caja | comparar esperado/contado y registrar diferencia trazable |

Todas las automatizaciones económicas o clínicas deben ser visibles, reversibles mediante estados/anulación y auditadas. Automatizar no significa ocultar consecuencias.

## J. Qué no se tocaría conceptualmente

- separación multi-clínica y `clinica_id`;
- permisos en backend y acceso por rol;
- trazabilidad/auditoría de cambios clínicos y económicos;
- historial completo como fuente inmutable de hechos;
- aceptación parcial por línea de presupuesto;
- pagos parciales y anticipos como entidades económicas reales;
- documentos y consentimientos integrados en el paciente;
- odontograma como herramienta compartida por contexto;
- anulaciones/soft delete en vez de borrado destructivo;
- migraciones lineales y contratos explícitos de API;
- Caja como libro operativo distinto de la cuenta individual.

Estas capacidades sostienen el producto. El rediseño cambia cómo se presentan y encadenan, no su necesidad de control.

## Wireframes textuales

Los wireframes definen jerarquía, no estilo final ni componentes exactos.

### 1. Jornada — Operación de hoy

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ DentCore   Jornada   Pacientes   Caja        [Buscar paciente…]  [+ Cita]   │
│ Vie 4 Sep   [Operación] [Día] [Semana]   Clínica Dental   Todos los doctores │
├───────────────────────────────────────────────────────┬──────────────────────┤
│ AHORA                                                 │ REQUIERE ATENCIÓN    │
│ 16:20  Ana García · Revisión · Dr. Ruiz               │ ⚠ Ana · espera 17 m │
│        EN CLÍNICA · espera 17 min                     │ Cambio solicitado 2 │
│        [Iniciar] [Ficha] [···]                        │ Hueco 17:00 · 45 m  │
│                                                       │ [Ver 3 candidatos]  │
│ 16:30  Luis Pérez · Endodoncia · 60 min               │ Lab bloquea cita 1  │
│        CONFIRMADA                                     │ Checkout pendiente 2│
│        [Llegó] [Mensaje] [···]                        │                      │
│                                                       │                      │
│ 17:00  HUECO 45 min                                   │                      │
│        [Nueva cita] [Cubrir desde lista de espera]    │                      │
└───────────────────────────────────────────────────────┴──────────────────────┘
```

No hay contadores cero, leyenda de 12 estados, laboratorio vacío ni calendario permanente. El usuario puede abrirlos cuando los necesita.

### 2. Agenda — Día/Semana

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹  Vie 4 Sep  ›    [Hoy]   [Día] [Semana]   Dr. todos   Gab. todos  [Hueco] │
├──────────┬────────────────────┬────────────────────┬─────────────────────────┤
│ Hora     │ Dr. García         │ Dra. López         │ Dr. Martín              │
├──────────┼────────────────────┼────────────────────┼─────────────────────────┤
│ 09:00    │ Juan · Revisión    │                    │ Marta · Primera visita  │
│          │ Confirmada · 30 m  │                    │ En clínica · espera 5 m │
│ 09:30    │                    │ Pablo · Limpieza   │                         │
│ 10:00    │ [hueco]            │ En atención        │                         │
└──────────┴────────────────────┴────────────────────┴─────────────────────────┘

Al seleccionar una cita:
[Abrir paciente] [Llegó/Iniciar/Finalizar] [Mover] [Cancelar] [Más]
```

### 3. Paciente — Resumen de cinco segundos

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Juan Pérez Méndez · 48 años · H1 · 666 555 444             [Nueva cita] [···]│
│ ⚠ ALERGIA: PENICILINA · Bruxismo                                           │
│ HOY 16:30 · Revisión · Dr. García · EN CLÍNICA · espera 8 min  [Abrir sesión]│
├──────────────────────────────────────────────┬───────────────────────────────┤
│ SIGUIENTE ACCIÓN                             │ CUENTA                        │
│ 2 tratamientos aceptados sin programar       │ Pendiente 480 €               │
│ Implante 46 · Corona 46                      │ Anticipo 100 €                 │
│ [Dar cita] [Abrir plan]                      │ [Checkout / Cobrar]            │
│                                              │                               │
│ ACTIVIDAD RECIENTE                           │ SEGUIMIENTO                    │
│ 02 Ago · Limpieza · Todo correcto            │ Sin próxima cita               │
│ 29 Jul · Retenedor                           │ Recomendación: revisión 3 meses│
│ [Ver historia]                               │ [Reservar] [Crear recall]       │
├──────────────────────────────────────────────┴───────────────────────────────┤
│ [Resumen dental: 46 pendiente · 47 planificado · 5 piezas tratadas] [Abrir] │
│ [Datos y contacto] [Documentos 0] [Consentimientos 0]                       │
└──────────────────────────────────────────────────────────────────────────────┘
│  [Resumen]   [Clínica]   [Plan]   [Historia]                                │
```

### 4. Encuentro clínico

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Juan Pérez · Revisión · 16:30 · Dr. García     ⚠ Penicilina   [Historia]    │
├────────────────────────────┬─────────────────────────────────┬───────────────┤
│ PREVISTO HOY               │ NOTA / ODONTOGRAMA              │ CIERRE        │
│ ☑ Endodoncia 36            │ [Nota clínica] [Dictar]         │ Realizados 1/2│
│ ☐ Reconstrucción 36        │                                 │ Documento —   │
│                            │ Pieza 36 · diagnóstico/contexto │ Consent. OK   │
│ [+ Añadir excepción]       │ [Abrir odontograma completo]    │ Próxima —     │
│                            │                                 │               │
│ Seleccionado: Endodoncia   │ Evolución / materiales / nota… │ [Finalizar    │
│ [Realizado] [Posponer]     │                                 │  visita]      │
└────────────────────────────┴─────────────────────────────────┴───────────────┘

Más: Receta · Consentimiento · Laboratorio · Foto/Radiografía
```

El formulario técnico de catálogo, pieza y caras solo aparece al editar una excepción.

### 5. Plan y presupuesto

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ PLAN ACTIVO                                      Progreso 1/4   Total 1.610 €│
│ [Plan clínico] [Presentación al paciente]                 [PDF] [Compartir] │
├──────────────────────────────────────────────────────────────────────────────┤
│ Fase 1 · Urgente                                                            │
│ ✓ Implante 46       ACEPTADO     950 €   Sin cita       [Dar cita]          │
│ ✓ Corona implante 46 ACEPTADO    600 €   Después implante [Ver dependencia]│
│ ○ Extracción 47     PENDIENTE      60 €   [Aceptar] [Aplazar]               │
├──────────────────────────────────────────────────────────────────────────────┤
│ Aceptado 1.550 € · Pendiente decisión 60 €          [Registrar decisión]    │
│ [Editar líneas] [Abrir odontograma] [Nueva versión]                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

No existe “Preparar pendientes”. Editar líneas y odontograma se abren solo cuando el profesional modifica el plan.

### 6. Historia

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ HISTORIA   [Buscar…] [Desde] [Hasta] [Clínico ▾] [Agrupar por visita ✓]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 04 Sep 2026 · VISITA · Revisión                                             │
│ Dr. García · Endodoncia 36 realizada · Nota clínica                         │
│ Documento: RX 36 · Factura A-102 · Pago parcial 200 €              [Abrir] │
├──────────────────────────────────────────────────────────────────────────────┤
│ 03 Sep 2026 · CITA REPROGRAMADA                                             │
│ De 09:00 a 16:30 · solicitado por paciente                         [Detalle]│
└──────────────────────────────────────────────────────────────────────────────┘
```

Los filtros poco frecuentes aparecen en “Más filtros”. Los eventos simples permanecen compactos.

### 7. Checkout del paciente

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ CHECKOUT · Juan Pérez · hoy 17:12                                           │
├──────────────────────────────────────┬───────────────────────────────────────┤
│ REALIZADO HOY                        │ CUENTA                                │
│ ☑ Endodoncia 36            300 €    │ Cargos hoy                  300 €    │
│                                      │ Anticipo disponible          50 €    │
│ [Revisar factura]                    │ A pagar                     250 €    │
│                                      │ [Total 250] [Parcial] [No paga hoy] │
│                                      │ Método [Tarjeta ▾] Importe [250]    │
├──────────────────────────────────────┴───────────────────────────────────────┤
│ SIGUIENTE PASO: Reconstrucción 36 · 30 min · en 2 semanas                  │
│ [Buscar cita] [Crear recall]                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ Saldo después: 0 €         [Confirmar factura, cobro y cierre]              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8. Caja diaria

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ CAJA · Vie 4 Sep · Turno María     ABIERTA 09:00             [Cerrar caja]  │
│ Esperado 1.245 € · Efectivo 420 € · Tarjeta 755 € · Transferencia 70 €     │
├──────────────────────────────────────────────┬───────────────────────────────┤
│ CHECKOUTS PENDIENTES                         │ MOVIMIENTOS DE HOY            │
│ Ana García · 80 €          [Cobrar]          │ 17:12 +250 € Tarjeta Juan    │
│ Luis Pérez · factura pendiente [Abrir]       │ 16:48 +60 € Efectivo Marta   │
│                                              │ [Ver todos]                   │
├──────────────────────────────────────────────┴───────────────────────────────┤
│ [Buscar paciente/factura…] [Registrar entrada/salida] [Arqueo]             │
└──────────────────────────────────────────────────────────────────────────────┘
```

Las métricas mensuales se trasladan a Informes.

### 9. Ajustes

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AJUSTES   [Buscar ajuste…]                         Configuración mínima 5/6 │
├──────────────────────────────────────┬───────────────────────────────────────┤
│ ORGANIZACIÓN Y EQUIPO                │ CLÍNICA Y OPERACIÓN                   │
│ Clínicas · Usuarios · Roles          │ Doctores · Gabinetes · Horarios      │
│                                      │                                       │
│ CATÁLOGOS Y DOCUMENTOS               │ FACTURACIÓN                           │
│ Tratamientos · Plantillas · Labs     │ Series · Formas de pago · Pagadores  │
│                                      │                                       │
│ AVANZADO                             │                                       │
│ Inventario · Importación · Auditoría · Seguridad · Backups                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Las diez mejoras de mayor impacto

| Orden | Mejora | Por qué va primero | Métrica de validación |
|---:|---|---|---|
| 1 | Renovación de sesión y preservación de borradores | Sin continuidad no existe uso fiable de 8 h | cero cascadas 401 y cero pérdida de borrador en una jornada |
| 2 | Checkout único | Es el mayor punto de riesgo económico y de cambio de contexto | visita a cobro/recall en < 90 s |
| 3 | Ficha de cinco segundos | Afecta cada apertura de paciente | 90 % de usuarios responde siete preguntas en ≤ 5 s |
| 4 | Eliminar “Preparar pendientes” | Quita una transición sin valor y evita trabajo aceptado invisible | 100 % de líneas aceptadas disponibles para programar |
| 5 | Encuentro precargado desde cita/plan | Reduce administración del odontólogo | sesión abierta y preparada en ≤ 2 clics |
| 6 | Fusionar Hoy/Agenda en Jornada | Reduce duplicación diaria y centraliza excepciones | llegada, cambio y hueco sin cambiar de módulo |
| 7 | Espera cronometrada y huecos compatibles | Resuelve servicio y ocupación | espera visible; hueco de 45 min cubrible desde candidatos |
| 8 | Semántica y operación múltiple del odontograma | Reduce error clínico y repetición | varios hallazgos sin mezclar diagnóstico/realizado |
| 9 | Próxima visita/recall estructurado | Evita pérdida de seguimiento | ≥ 95 % de visitas con cita o recall explícito |
| 10 | Reducir estados, tabs y contenido vacío | Baja carga cognitiva transversal | seis estados humanos; cero paneles vacíos permanentes |

## Secuencia recomendada después de aprobación

Esta secuencia no es una autorización para programar; sirve para evitar un rediseño masivo sin validación.

### Fase 0 — Semántica y fiabilidad

- aprobar estados canónicos de cita, plan, sesión, actuación, factura, pago y anticipo;
- resolver continuidad de autenticación;
- definir fuente canónica de alertas.

### Fase 1 — Jornada

- prototipo navegable de Operación/Día/Semana;
- pruebas con diez tareas de recepción;
- sin tocar todavía el modelo clínico.

### Fase 2 — Resumen de paciente

- ficha de cinco segundos;
- cuatro tabs Resumen/Clínica/Plan/Historia;
- consolidación de acciones.

### Fase 3 — Encuentro y Plan

- primera visita sin duplicación;
- sesión precargada;
- aceptación automática a plan;
- Visitas absorbido por Historia.

### Fase 4 — Checkout y Caja

- cuenta del paciente;
- factura/pago parcial/anticipo en un flujo;
- caja y arqueo reales.

### Fase 5 — Complejidad opcional

- laboratorio Pro;
- inventario Pro;
- informes de dirección;
- asistente Advanced solo si demuestra valor.

Cada fase debe probarse con usuarios representativos antes de retirar el camino anterior.

## Riesgos de rediseño

- **Ocultar no debe impedir encontrar.** Las acciones secundarias necesitan nombres consistentes y búsqueda.
- **Fusionar no debe borrar trazabilidad.** La UI puede simplificar; los eventos internos permanecen.
- **Automatizar aceptación/facturación exige reglas explícitas.** El usuario debe ver la consecuencia antes de confirmar.
- **La sesión clínica no puede depender solo de la cita.** Debe existir un camino para urgencias y actuaciones no planificadas.
- **Un resumen demasiado minimalista puede ocultar riesgo.** Alertas clínicas críticas siempre permanecen visibles.
- **Roles distintos necesitan defaults distintos, no productos distintos.** El mismo paciente mantiene información coherente.
- **No migrar todas las pantallas a la vez.** Primero validar el modelo mental con prototipos y tareas cronometradas.

## Decisiones que requieren aprobación

1. Fusionar Hoy y Agenda bajo Jornada.
2. Cambiar el paciente a Resumen/Clínica/Plan/Historia.
3. Eliminar Visitas como pantalla independiente.
4. Eliminar la acción “Preparar pendientes” y automatizar la activación.
5. Crear un checkout que unifique factura, cobro, anticipo y siguiente cita.
6. Reducir a seis los estados humanos de Agenda.
7. Unificar Listados y Reportes y retirarlos del menú normal.
8. Hacer Laboratorio, Inventario, Fichaje y Asistente capacidades opcionales.
9. Reestructurar Primera visita y la semántica del odontograma.
10. Diseñar por excepción: ocultar ceros, paneles vacíos y configuración no relevante.

## Resultado esperado

Una clínica que vea DentCore por primera vez no debería percibir “muchos módulos”. Debería percibir:

- una jornada que se entiende de un vistazo;
- un paciente cuyo estado se comprende en cinco segundos;
- una sesión que ya sabe qué se va a hacer;
- un plan que acompaña desde diagnóstico hasta realización;
- un checkout que no obliga a distinguir primero entre factura, cobro y anticipo;
- una historia completa que no duplica pantallas;
- opciones avanzadas disponibles cuando la clínica realmente las necesita.

Ese es el criterio para considerar DentCore un producto profesional de uso intensivo, no simplemente un sistema funcionalmente completo.
