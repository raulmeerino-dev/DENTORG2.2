# Auditoría de producto de DentCore

**Fecha de corte:** 2026-09-04  
**Repositorio auditado:** `main` en `065a2e5`  
**Estado:** línea base previa a la nueva fase de implementación

## Resumen ejecutivo

DentCore no es un prototipo. Ya cubre de forma integrada gran parte del circuito diario de una clínica dental: paciente activo, ficha, primera visita, odontograma contextual, presupuesto, trabajo pendiente, sesión clínica, historial, agenda, facturación/cobro, documentos, consentimientos, recetas, laboratorio, inventario, portal, reportes, multi-clínica, auditoría y backups.

La principal oportunidad no es añadir módulos indiscriminadamente. Es cerrar riesgos de autorización y trazabilidad, demostrar recuperación y flujos completos con pruebas reales, reducir la carga de pantallas densas y completar unos pocos dominios estructurales: cierre de caja, recall, responsables/familias, historia médica estructurada, búsqueda global y periodoncia.

El producto es visualmente más maduro que su arquitectura interna. La ficha del paciente y el flujo clínico son claros; sin embargo, varios endpoints históricos conservan permisos legacy, algunas excepciones multi-clínica siguen abiertas para datos sin clínica y el frontend concentra demasiado código, CSS y carga de datos en unos pocos archivos.

## Método y alcance

La auditoría combinó:

- recorrido de todo el árbol de backend, frontend, migraciones, tests, CI, Docker y documentación;
- inspección de 254 operaciones HTTP, 46 migraciones Alembic y los modelos principales;
- ejecución manual de la aplicación real con los perfiles administrador y recepción;
- simulación de los recorridos de recepción, clínica, administración, dirección y multi-clínica;
- ejecución de lint, build, tests unitarios/integración, E2E y cobertura;
- comprobación de la base en ejecución, del preflight comercial y de los registros legacy sin `clinica_id`.

No se modificaron datos clínicos durante la auditoría. Las capturas de diagnóstico se guardaron bajo `output/playwright/` y no forman parte del producto.

## Dimensión del sistema

| Superficie | Evidencia |
|---|---:|
| Operaciones HTTP FastAPI | 254 |
| Migraciones Alembic | 46 (`0001` a `0045`, un único `head`) |
| Backend de aplicación | 105 archivos, aproximadamente 22.900 líneas |
| Tests backend | 16 archivos; 152 tests ejecutados |
| Frontend `src` | 180 archivos, aproximadamente 69.100 líneas |
| Tests frontend | 40 archivos; 250 tests ejecutados |
| E2E navegador | 1 escenario, con API simulada |
| Cobertura backend | 65% total |

## Mapa funcional real

```text
Hoy
├─ prioridades, agenda diaria, llamadas, cobros y acciones rápidas
Agenda
├─ día, profesionales, gabinetes, estados, urgencias y huecos
├─ confirmación, cancelación, falta, recordatorio y reprogramación
└─ bandeja de llamadas / WhatsApp
Pacientes
├─ Ficha
│  ├─ cabecera persistente, alertas, saldo, próxima/última visita
│  ├─ mini odontograma y datos administrativos
│  └─ documentos y consentimientos resumidos
├─ Tratamientos
│  ├─ diagnóstico / primera visita
│  ├─ trabajo pendiente
│  ├─ sesión actual
│  ├─ visitas
│  └─ presupuestos
└─ Historial completo
   └─ eventos clínicos, económicos, documentales y de comunicación
Caja
├─ facturas, cobros, anticipos y saldos
└─ no existe todavía un arqueo/cierre persistente
Reportes / Listados
├─ caja, pacientes, agenda, clínica, laboratorio y control
└─ KPIs operativos y económicos
Administración
├─ clínicas, usuarios, roles, doctores, horarios y tratamientos
├─ laboratorio, inventario, documentos, reportes y auditoría
└─ importación, seguridad, backups y preflight
Portal paciente
└─ invitaciones, citas, documentos y consentimientos
```

## Qué existe realmente por dominio

| Dominio | Estado | Evidencia y límites |
|---|---|---|
| Pacientes | Avanzado | Ficha ampliada, campos cifrados, referencias, aseguradoras, pagador, saldo, primera/última visita y baja lógica. Faltan responsables/familias y separación más estricta entre observación administrativa y clínica. |
| Agenda | Avanzado parcial | Día multi-profesional, gabinetes, horarios/excepciones, conflictos, urgencias, estados, no-show, recordatorios y WhatsApp. No hay vista semanal operativa, recurrencia ni lista de espera estructurada. |
| Odontograma | Avanzado | Contextos diagnóstico, presupuesto, pendiente, realizado, historial y lectura; piezas, superficies, versiones y vínculo con presupuesto. No sustituye a un periodontograma. |
| Tratamientos | Avanzado | Catálogo, familias, diagnóstico, pendiente, sesión, realizado e historial. Los endpoints legacy de historial tienen límites de autorización críticos documentados en `ARCHITECTURE_AUDIT.md`. |
| Presupuestos | Avanzado parcial | Estados, aceptación total/parcial, líneas, descuentos, PDF, odontograma, paso a pendiente y factura. Faltan versionado formal, caducidad, firma de aceptación y fases/alternativas de plan. |
| Facturación | Avanzado técnico | Facturas, rectificación/anulación, cobros, anticipos, parciales, PDF fiscal, registros y cadena SIF. La validez legal/fiscal requiere revisión externa. No hay devolución estructurada ni plan de financiación. |
| Caja | Básico funcional | Consolida facturas y cobros con KPIs. El texto promete arqueo diario, pero no hay entidad de apertura/cierre, recuento, diferencia o responsable. |
| Documentos | Avanzado | Firma real de archivo, límite, almacenamiento fuera de público, descarga sin caché, PDF y baja lógica. Falta gestión especializada de imagen/radiología. |
| Consentimientos | Avanzado | Plantillas versionadas, firma, PDF y revocación con auditoría. La adecuación jurídica de textos y conservación es externa. |
| Recetas | Avanzado local/parcial externo | Borrador, firma, emisión local, PDF, anulación y proveedor desacoplado. La integración real de proveedor lanza `NotImplementedError` por diseño. |
| Laboratorio | Avanzado | Órdenes, piezas, fechas, estados, incidencias, ubicación, costes, margen, cobro/pago y vínculo con cita/presupuesto/factura. |
| Inventario | Medio | Productos, proveedores, pedidos, movimientos y stock mínimo. Faltan lotes, caducidad, ubicaciones y consumo clínico trazable. |
| Comunicación | Medio | WhatsApp bidireccional, recordatorios, confirmación/cancelación/reprogramación y timeline. Email/SMS, preferencias granulares y automatización no están resueltos. |
| Recall | Ausente | No hay entidad, reglas, cola ni automatización de revisiones/higiene. |
| Personal | Medio | Usuarios, roles, doctores/auxiliares, horarios, excepciones y fichajes. No hay ausencias laborales/objetivos completos ni permisos granulares configurables. |
| Multi-clínica | Parcial con riesgo | `clinica_id`, scoping y reportes por clínica existen. Los admins son globales, los profesionales pertenecen a una sola clínica y los registros `NULL` se comparten como legacy. |
| Reporting | Medio/avanzado | Producción, facturación, cobro, deuda, actividad, faltas, tratamientos y profesionales. Recall, conversión por cohortes y rentabilidad completa están incompletos. |
| Operaciones | Parcial | Docker, CI, preflight, backups cifrados y verificación. El preflight real muestra 3 bloqueos y no acredita una restauración completa. |

## Simulación de la jornada clínica

### Paciente nuevo

La creación de ficha y primera cita están conectadas y la primera visita conduce al odontograma y al presupuesto. El producto todavía trata el lead como paciente desde el primer contacto y no dispone de un registro ligero de oportunidad. Los responsables legales y familias tampoco están modelados; esto obliga a introducir pagador/observaciones de forma aislada en pacientes menores o dependientes.

### Paciente existente

Es el flujo más sólido. La cabecera persistente responde rápidamente quién es, saldo, alerta, próxima cita y estado. Ficha, Tratamientos e Historial son solo tres áreas principales, coherentes con las instrucciones de producto. El coste aparece cuando todos los recursos se cargan a la vez y el historial/visitas crecen sin paginación.

### Recepción

Agenda, cambio de estado, reprogramación, urgente, recordatorio, llamada y caja están próximos. La recepción puede operar sin entrar en Administración. No obstante, la interfaz real muestra observaciones clínicas escritas en el campo general aunque `datos_salud` se oculte; además, los endpoints legacy de historial permiten más acceso del debido. Cierre de caja y lista de espera no tienen workflow completo.

### Odontólogo, higienista y auxiliar

El contexto clínico es bueno: alertas, odontograma, pendientes, sesión, dictado, nota, receta, laboratorio y checklist de salida. Higienista no existe como rol separado; se aproxima mediante `auxiliar`, lo que limita permisos y reporting específicos. El cierre de sesión clínica sí preserva vínculo con presupuesto, cita e historial.

### Administración y dirección

Facturación, cobro, anulaciones, SIF técnico, reportes, configuración y auditoría son utilizables. Faltan arqueo/cierre, devoluciones, financiación estructurada y métricas de recall/conversión longitudinal. La navegación administrativa tiene 13 secciones de igual peso.

### Responsable multi-clínica

El rol `admin` puede operar transversalmente y los reportes aplican scope cuando corresponde. No hay asignaciones many-to-many de profesional/clínica ni permisos por sede configurables. La compatibilidad legacy con `clinica_id = NULL` impide afirmar aislamiento estricto.

## Evidencia de calidad ejecutada

| Comprobación | Resultado |
|---|---|
| `ruff check app tests scripts` | correcto |
| `pytest -q` | 152 passed |
| `pytest --cov=app` | 65% total |
| `npm run lint` | correcto |
| `npm test` | build correcto; 40 archivos y 250 tests passed |
| `npm run test:e2e` | 1 passed; API simulada |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas |
| Alembic | `0045 (head)`, una cabeza |

Coberturas especialmente bajas en superficies críticas: `tratamientos.py` 29%, `facturas.py` 31%, `presupuestos.py` 31%, `auth.py` 38% y `citas.py` 38%. El número de tests es significativo, pero no compensa la ausencia de un E2E real del recorrido presupuesto → pendiente → realizado → factura → cobro.

## Evaluación cuantitativa inicial

| Dimensión | Nota / 10 | Justificación |
|---|---:|---|
| Claridad | 7.0 | Jerarquía clínica clara; historial, presupuesto y administración se densifican. |
| Facilidad de aprendizaje | 6.5 | Tres áreas de paciente ayudan; estados y 13 pestañas admin exigen formación. |
| Velocidad de uso | 7.0 | Acciones rápidas y contexto persistente; muchas queries y formularios largos penalizan escala. |
| Navegación | 7.5 | Seis destinos globales y rutas coherentes; falta búsqueda global real. |
| Agenda | 7.0 | Día multi-profesional muy completo; faltan semana, lista de espera y recurrencia. |
| Ficha paciente | 8.0 | Es el centro mejor resuelto; existe fuga semántica entre observaciones y salud. |
| Odontograma | 8.0 | Contextual, versionado y conectado; falta periodoncia especializada. |
| Tratamientos | 7.0 | Circuito integral; permisos legacy y duplicidad Visitas/Historial reducen la nota. |
| Presupuestos | 7.5 | Aceptación parcial y vínculo clínico sólidos; modal excesivo y sin versionado/firma formal. |
| Facturación | 6.5 | Buen núcleo y trazabilidad SIF; sin cierre de caja, devoluciones ni validación legal externa. |
| Comunicaciones | 5.5 | WhatsApp está integrado; email, SMS, preferencias y automatizaciones faltan. |
| Reporting | 6.5 | KPIs útiles; faltan recall, cohortes, rentabilidad y drill-down consistente. |
| Configuración | 6.0 | Cobertura amplia; 13 opciones planas y algunos estados no editables. |
| Seguridad | 5.0 | Cifrado, cookies, roles y auditoría existen; hay fallos críticos de autorización y sesión. |
| Arquitectura técnica | 5.5 | Stack sólido y migraciones lineales; routers/componentes/CSS monolíticos y lógica duplicada. |
| Escalabilidad | 5.0 | Async y Postgres ayudan; límites en memoria, cargas completas y scoping legacy frenan. |
| Consistencia visual | 7.0 | Lenguaje visual coherente; CSS acumulativo y estados técnicos visibles generan excepciones. |
| Accesibilidad | 6.0 | Labels/roles y foco aparecen con frecuencia; no hay auditoría WCAG completa y algunos tabs carecen de nombre en el snapshot. |
| Gestión de errores | 6.5 | Errores y toasts visibles; el refresh 401 esperado deja ruido de consola y hay fallos amplios por query agregada. |
| Completitud funcional | 7.0 | Cobertura clínica notable; ausencias fundamentales concretas, no una carencia general. |

**Media inicial:** 6,6/10. La puntuación se repetirá después de completar cada bloque funcional importante, no después de cada cambio menor.

## Conclusión

DentCore ya tiene una base funcional competitiva en el núcleo clínico. No debe reescribirse ni expandirse sin control. El orden correcto es: cerrar límites de autorización y trazabilidad, probar recuperación y el circuito económico-clínico completo, estabilizar el modelo multi-clínica y después simplificar/cerrar dominios faltantes. El documento maestro de ejecución es `IMPROVEMENT_BACKLOG.md`.
