# Análisis de carencias funcionales

**Fecha:** 2026-09-04

## Criterio

Una función de un competidor no constituye por sí sola una necesidad. Aquí se priorizan huecos que resuelven un problema observable de clínica, seguridad, continuidad del cuidado, recaudación u operación. Cada carencia ejecutable está vinculada al backlog maestro.

## Matriz de cobertura

| Área | Completo o suficientemente resuelto | Parcial | Ausente | Backlog |
|---|---|---|---|---|
| Identidad del paciente | ficha, contacto, cifrado, aseguradora, pagador, referencias | preferencias y alertas mezcladas | familia, tutor/responsable | P1-007, P1-008 |
| Agenda diaria | multi-doctor, gabinetes, duración, urgencia, estados, conflictos, huecos, excepciones | llegada/sala mediante estados; recordatorios WhatsApp | semana operativa, recurrencia, lista de espera | P1-011, P2-002 |
| Odontograma | permanente/temporal, superficies, ausencias, implantes/prótesis/endodoncia mediante estados, histórico y contextos | ortodoncia como tratamiento, no análisis especializado | periodontograma completo | P2-001 |
| Plan de tratamiento | presupuesto, prioridades implícitas, aceptación parcial, pendiente, profesional y cita | alternativas/fases solo como texto/orden | plan clínico versionado con fases y alternativas | P2-003 |
| Presupuestos | líneas, descuentos, estados, PDF, parcial, vínculo clínico/factura | no caducidad/firma/versionado formal | comparación de versiones | P2-003 |
| Facturación | factura, rectificación/anulación, cobro, parcial, anticipo, saldo, PDF/SIF técnico | método “Financiado” sin calendario; anular no es devolución | devolución, plan de financiación | P2-004 |
| Caja | cobro individual y KPIs | vista llamada Caja | apertura, arqueo, cierre, diferencia, responsable | P1-004 |
| Documentos | archivos, clasificación, plantillas, PDF, firmas y baja lógica | imágenes como archivo genérico | visor/serie radiológica especializada | P3-003 |
| Laboratorio | orden, pieza, fechas, incidencias, ubicación, costes, margen y vínculos | adjuntos especializados limitados | — | P2-008 |
| Inventario | productos, mínimos, proveedores, pedidos y movimientos | categorías/unidad básicas | lotes, caducidad, ubicación y consumo por acto | P2-005 |
| Comunicaciones | WhatsApp, recordatorio, confirmación, cancelación, reprogramación y registro | email como enlace/canal conceptual | SMS/email provider, preferencias granulares, campañas | P2-006, P3-001 |
| Recall | — | tratamientos de “revisión” en catálogo | reglas, vencimientos, cola, contacto y conversión | P1-006 |
| Personal | usuario, rol, doctor/auxiliar, horario, excepción, fichaje | permisos fijos por rol | higienista/empleado configurable, ausencias/objetivos | P2-007 |
| Multi-clínica | clínica en entidades y reporting; admin global | profesional de una sola sede; legacy compartido | asignaciones multi-sede y política paciente compartido | P0-003, P2-009 |
| Analítica | ingresos, facturación, cobro, deuda, faltas, tratamientos, profesional | ocupación/conversión parciales | recall, cohortes y rentabilidad completa | P2-010 |
| Búsqueda | paciente por nombre/DNI/teléfono dentro de Pacientes | navegación conserva paciente | búsqueda global de cita/factura/presupuesto/profesional | P1-005 |

## Carencias fundamentales

### 1. Cierre de caja

**Problema real:** el cobro individual no resuelve la responsabilidad de un turno, el recuento de efectivo ni la diferencia. Una clínica necesita saber quién cerró, qué debía haber, qué contó y por qué difiere.  
**Alcance mínimo:** sesión de caja por clínica/usuario, apertura, movimientos computados, recuento por forma de pago, diferencia, observación y cierre inmutable/anulable.  
**No incluir inicialmente:** contabilidad general o conciliación bancaria completa.

### 2. Recall

**Problema real:** sin una cola de pacientes que deberían volver, se pierde continuidad clínica e ingreso recurrente.  
**Alcance mínimo:** tipo de recall, fecha objetivo, estado, responsable, último contacto, siguiente acción y reglas simples; lista accionable desde Hoy/Agenda.  
**No convertir:** campañas de marketing avanzadas pertenecen a P3.

### 3. Familia, tutor y responsable

**Problema real:** menores, dependientes y unidades familiares comparten contacto/pagador/consentimiento. El pagador textual actual no modela responsabilidad legal ni relaciones.  
**Alcance mínimo:** relación paciente-persona, tipo, vigencia, contacto, autorización y pagador; evitar duplicar una ficha clínica como simple tutor.

### 4. Historia médica estructurada

**Problema real:** `datos_salud` es JSON libre y observaciones generales absorben alergias. Esto dificulta permisos, validación, cambios, alertas y auditoría.  
**Alcance mínimo:** alergias, medicación, patologías/alertas, revisión y autor; conservar campos desconocidos en transición segura.

### 5. Búsqueda global

**Problema real:** el usuario debe saber en qué módulo buscar una cita, factura o presupuesto.  
**Alcance mínimo:** comando global con resultados agrupados y permisos server-side; normalizar teléfono/DNI; abrir cada resultado en contexto.

### 6. Periodoncia

**Problema real:** el odontograma restaurador no puede registrar sondaje, sangrado, recesión, movilidad, furcación y evolución.  
**Alcance mínimo:** examen por fecha y seis sitios por diente, visualización comparativa e impresión.  
**Decisión:** P2, porque el núcleo general puede operar sin él, pero es fundamental para clínicas con periodoncia/higiene avanzada.

## Funciones parciales que necesitan cierre, no duplicación

### Agenda

- Construir vista semana usando el mismo modelo de cita.
- Añadir lista de espera conectada a huecos/cancelaciones, no una agenda paralela.
- Modelar recurrencia como serie con excepciones, sin copiar citas silenciosamente.
- Reutilizar `Gabinete` como recurso; no crear otro módulo de sillones.

### Planes y presupuestos

- El presupuesto ya es el núcleo económico del plan; fases y alternativas deben añadirse como estructura contextual, no como módulo duplicado.
- Versionar/caducar/firmar sin permitir que una versión aceptada se reescriba.
- Mantener aceptación parcial y trabajo pendiente existentes.

### Comunicación

- WhatsApp ya tiene thread y acciones; email/SMS deben usar un registro de comunicación común.
- Preferencias y oposición del paciente deben aplicarse antes de enviar.
- Proveedores, plantillas y automatizaciones deben ser configurables y auditados.

### Multi-clínica

- Resolver primero datos legacy sin clínica.
- Después introducir asignación de profesionales a varias sedes.
- Compartir pacientes solo mediante política explícita; no inferir que todo admin/global equivale a paciente global.

## Funciones avanzadas no prioritarias

- campañas segmentadas y automatizaciones multicanal;
- analítica predictiva o IA clínica;
- DICOM/PACS completo;
- optimización automática de agenda;
- benchmarking entre sedes;
- rentabilidad avanzada por procedimiento con imputación de material/tiempo;
- integración contable/ERP profunda.

Estas funciones son P3 hasta que seguridad, cierre de caja, recall y pruebas reales estén resueltos.

## Funciones que no deben ocupar navegación principal

- recetas;
- consentimientos;
- laboratorio;
- documentos;
- importación;
- backups;
- periodontograma de un paciente.

Todas deben permanecer en contexto o configuración/listado. Añadirlas al menú global aumentaría la complejidad percibida sin mejorar el workflow.

## Validación externa

- **LEGAL_REVIEW_REQUIRED:** textos, firma, revocación y conservación de consentimientos.
- **LEGAL_REVIEW_REQUIRED:** requisitos de receta electrónica e integración con proveedor habilitado.
- **LEGAL_REVIEW_REQUIRED:** alcance fiscal real de facturas, recibos, rectificativas, devoluciones y VERI*FACTU/SIF.
- **LEGAL_REVIEW_REQUIRED:** canales de comunicación, base jurídica, preferencias, marketing y proveedores.

## Resultado

Las carencias no justifican una reescritura. El núcleo clínico debe conservarse. Los huecos de P1/P2 se implementarán solo después de los P0 y en unidades pequeñas definidas en `IMPROVEMENT_BACKLOG.md`.
