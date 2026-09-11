# Backlog maestro de mejora de DentCore

**Última actualización:** 2026-09-04  
**Fuente de verdad:** este archivo controla prioridad, estado, dependencias y aceptación.  
**Siguiente tarea seleccionable:** el primer elemento `READY` de mayor prioridad con dependencias satisfechas.  
**Últimos IDs reservados:** P0-007, P1-017, P2-011, P3-004. No reutilizar IDs.

## Estados permitidos

## Prioridad de entrega aprobada — 2026-09-05

La instrucción posterior del usuario prioriza Fase A antes del orden histórico del backlog. Los IDs `A1`–`A3` identifican bloques de esta entrega y no renumeran los hallazgos anteriores. Desde A2 se evalúa KEEP / REFACTOR / REDESIGN / REBUILD / REMOVE por dominio; conservar implementación solo si sigue siendo una buena solución.

| Bloque | Estado | Decisión / problema | Criterio de salida |
|---|---|---|---|
| A1 · continuidad de sesión | IN_PROGRESS | REFACTOR del cliente sobre refresh existente. Recuperar 401 una sola vez, limpiar sesión fallida y conservar contexto. | Suites y E2E verdes; sin bucles/concurrencia duplicada; retorno seguro. |
| A2 · información clínica canónica | READY, tras A1 validado | REDESIGN de representación clínica y REFACTOR de escritura. Hallazgo nuevo: recepción puede sobrescribir salud al editar teléfono; datos restringidos se interpretan como ausencia y observaciones como alertas paralelas. | Una fuente validada/cifrada; distinguir desconocido/restringido/ausencia declarada/alerta; impedir escritura clínica desde recepción; pruebas rol/tenant y edición administrativa. |
| A3 · cuenta del paciente | READY, tras A2 validado | REDESIGN del checkout. Hallazgos nuevos: Cobrar cambia a anticipo, cobro contextual sin confirmar, saldo neto diverge de deuda de facturas, anticipos sin imputación, listado parcial de facturas usado como cuenta completa. | Decisión explícita, cuenta íntegra y trazable, total/parcial/saldo a favor/no paga, confirmación sin doble ingreso ni sobrecobro; servicio transaccional si combina movimientos. |

Diseño y resultados de cada bloque se registran en `IMPLEMENTATION_LOG.md`; vocabulario y límites en `PRODUCT_SEMANTICS.md`. B–L permanecen pendientes, sin ejecución simultánea.

`DISCOVERED` · `READY` · `IN_PROGRESS` · `BLOCKED` · `DONE` · `DISCARDED`

## Reglas operativas

1. Cambiar a `IN_PROGRESS` antes de editar código.
2. No empezar una dependencia obligatoria que no esté `DONE`.
3. Un hallazgo distinto se registra aquí antes de corregirlo.
4. `DONE` exige integración, tests, criterios cumplidos y ausencia de regresión relevante conocida.
5. Tras cada bloque funcional, revisar estados, bloqueos, duplicados y dependencias.
6. Las migraciones destructivas requieren estrategia y decisión explícita; no se ejecutan automáticamente.

## Resumen

| Prioridad | READY | IN_PROGRESS | BLOCKED | DONE | Total |
|---|---:|---:|---:|---:|---:|
| P0 | 4 | 1 | 2 | 0 | 7 |
| P1 | 8 | 0 | 9 | 0 | 17 |
| P2 | 3 | 0 | 8 | 0 | 11 |
| P3 | 0 | 0 | 4 | 0 | 4 |

## P0 — crítico

### P0-001 — Cerrar autorización del historial clínico legacy

| Campo | Valor |
|---|---|
| Prioridad | P0 |
| Estado | IN_PROGRESS |
| Área/módulo | Backend · Tratamientos/Historial · permisos |
| Problema detectado | Lectura, creación y edición de historial consultan IDs directos sin comprobar clínica; las escrituras aceptan cualquier rol staff. |
| Evidencia encontrada | `backend/app/api/tratamientos.py:305-345` y `:781-824`; `SEC-001` en `ARCHITECTURE_AUDIT.md`. |
| Impacto | Exposición horizontal y alteración de datos clínicos, atribución falsa de profesional/paciente. |
| Usuario afectado | Paciente, odontólogo, auxiliar, recepción y responsable multi-clínica. |
| Solución propuesta | Resolver paciente/entrada, aplicar clínica, restringir mutación a rol clínico, validar relaciones y registrar cambio sensible. |
| Complejidad aproximada | M |
| Dependencias | Ninguna. |
| Riesgo | Alto; puede revelar dependencias frontend que daban por supuesto acceso de recepción. |
| Archivos previsiblemente afectados | `backend/app/api/tratamientos.py`, `backend/tests/test_authorization_boundaries.py`, posiblemente schemas/auditoría. |
| Tests necesarios | lectura cross-clinic 403; recepción sin escritura; create/patch con recursos ajenos 403/404; casos válidos admin/doctor/auxiliar. |
| Criterios de aceptación | Ningún staff puede leer o mutar historial de otra clínica por UUID; recepción no puede crear/editar; relaciones ajenas se rechazan; suite completa verde. |

### P0-002 — Invalidar access tokens de sesiones revocadas o usuarios desactivados

| Campo | Valor |
|---|---|
| Prioridad | P0 |
| Estado | READY |
| Área/módulo | Autenticación y sesiones |
| Problema detectado | Logout/revocación solo corta el refresh; el access token sigue autorizando hasta 240 minutos y conserva rol/clínica antiguos. |
| Evidencia encontrada | `permissions.py:39-67`; `auth.py:83-92`, `:274-289`; `SEC-002`. |
| Impacto | Acceso después de logout, desactivación o retirada urgente de permisos. |
| Usuario afectado | Todos los usuarios y administradores. |
| Solución propuesta | Revalidar usuario activo y sesión `sid` en la dependencia; comparar rol/clínica/paciente actuales; definir comportamiento para tokens legacy. |
| Complejidad aproximada | M |
| Dependencias | P0-001 recomendable, no obligatoria. |
| Riesgo | Medio/alto; más lectura DB y posible incompatibilidad con tokens sin `sid`. |
| Archivos previsiblemente afectados | `backend/app/core/permissions.py`, auth/modelos, tests de auth y autorización. |
| Tests necesarios | logout invalida access; revocar otra sesión; usuario inactivo; cambio de rol/clínica; token expirado/legacy. |
| Criterios de aceptación | Tras revocar o desactivar, el mismo access token obtiene 401; claims desactualizados no conceden permisos; login/refresh normal sigue funcionando. |

### P0-003 — Eliminar el bypass multi-clínica de registros `NULL`

| Campo | Valor |
|---|---|
| Prioridad | P0 |
| Estado | BLOCKED |
| Área/módulo | Multi-clínica · datos y permisos |
| Problema detectado | Registros clínicos legacy sin clínica se tratan como compartidos por todo el personal. |
| Evidencia encontrada | `permissions.py:118-158`; base: 2 pacientes, 28 citas, 4 doctores, 1 odontograma y 1 presupuesto `NULL`. |
| Impacto | Ruptura de aislamiento entre sedes. |
| Usuario afectado | Pacientes, personal de sedes y dirección multi-clínica. |
| Solución propuesta | Informe de asignación, política por tipo, backfill revisable, bloqueo fail-closed y `NOT NULL` por fases donde proceda. |
| Complejidad aproximada | L |
| Dependencias | Decisión documentada de pertenencia para registros legacy; estrategia de migración no destructiva. |
| Riesgo | Muy alto; asignar automáticamente puede mover datos clínicos a la sede equivocada. |
| Archivos previsiblemente afectados | permissions, modelos, múltiples APIs, migración nueva, script de preflight, tests. |
| Tests necesarios | matrices con clínica A/B/NULL, migración sobre snapshot, rollback, reportes globales admin. |
| Criterios de aceptación | Ningún dato sanitario `NULL` es visible a staff por compatibilidad implícita; todos los registros activos tienen propietario/política explícita y la migración conserva datos. |
| Bloqueo exacto | La instalación auditada contiene datos reales de prueba/uso sin propietario deducible; requiere asignación validada antes del backfill. |

### P0-004 — Hacer la auditoría atómica, concurrente y completa

| Campo | Valor |
|---|---|
| Prioridad | P0 |
| Estado | READY |
| Área/módulo | Auditoría y trazabilidad |
| Problema detectado | La cadena puede bifurcarse; el middleware puede fallar después de una operación sin impedirla; faltan prefijos/endpoints sensibles. |
| Evidencia encontrada | `core/audit.py:17-31`, `:108-127`; `services/audit.py:53-68`; `SEC-005`. |
| Impacto | Eventos perdidos o cadena no lineal en accesos/cambios clínicos y económicos. |
| Usuario afectado | Dirección, seguridad, pacientes y auditores. |
| Solución propuesta | Definir catálogo de eventos críticos, serializar cabeza por clínica, verificador/alerta y atomicidad para mutaciones esenciales. |
| Complejidad aproximada | L |
| Dependencias | P0-001 para cubrir el historial corregido. |
| Riesgo | Alto; locks mal diseñados pueden degradar o bloquear escrituras. |
| Archivos previsiblemente afectados | core/service audit, modelos/migración, routers sensibles, preflight y tests. |
| Tests necesarios | escrituras concurrentes, bifurcación, fallo de audit, cobertura de odontograma/receta/inventario/WhatsApp. |
| Criterios de aceptación | El verificador no detecta bifurcaciones bajo concurrencia; las acciones críticas generan un único evento; los fallos se alertan y no pasan silenciosamente según política. |

### P0-005 — Sustituir borrados destructivos clínicos/económicos por estados

| Campo | Valor |
|---|---|
| Prioridad | P0 |
| Estado | BLOCKED |
| Área/módulo | Historial, presupuestos, laboratorio y datos sensibles |
| Problema detectado | Existen `DELETE` físicos de historial, presupuestos, líneas y trabajo de laboratorio. |
| Evidencia encontrada | `tratamientos.py:813-824`, `presupuestos.py:731-737`, `laboratorio.py:809-816`. |
| Impacto | Pérdida de trazabilidad y relaciones; posible borrado accidental. |
| Usuario afectado | Clínica, administración y paciente. |
| Solución propuesta | Estados anulado/retirado, motivo/autor/fecha, ocultación por defecto y auditoría; preservar compatibilidad de lectura. |
| Complejidad aproximada | L |
| Dependencias | P0-004; definición de política de retención por entidad. |
| Riesgo | Alto; cambiar semántica de `DELETE` afecta UI e integraciones. |
| Archivos previsiblemente afectados | modelos, migración, APIs, frontend, PDFs/reportes y tests. |
| Tests necesarios | anular/restaurar si aplica, relaciones, listados, auditoría, datos existentes. |
| Criterios de aceptación | Ningún registro clínico/económico finalizado se borra físicamente desde API; toda baja conserva motivo, actor y fecha. |
| Bloqueo exacto | Hace falta decidir qué borradores nunca emitidos pueden eliminarse y qué conservación aplica; no se debe inferir jurídicamente. |

### P0-006 — Demostrar restauración real de backup en entorno aislado

| Campo | Valor |
|---|---|
| Prioridad | P0 |
| Estado | READY |
| Área/módulo | Operaciones · backups |
| Problema detectado | El preflight marca simulación con incidencias y ninguna restauración real registrada; no hay copia externa verificada. |
| Evidencia encontrada | UI Seguridad/Backups: 3 fallos y 8 avisos el 2026-09-04. |
| Impacto | Riesgo de pérdida total aun existiendo archivos de backup. |
| Usuario afectado | Toda la clínica y operación. |
| Solución propuesta | Comando/runbook que restaure a DB/directorio temporal, valide migración, conteos, hashes y uploads, y registre el resultado sin tocar producción. |
| Complejidad aproximada | L |
| Dependencias | Entorno aislado con espacio y credenciales; no usar la DB activa. |
| Riesgo | Muy alto si el target se resuelve mal; debe verificar ruta/DB explícitamente. |
| Archivos previsiblemente afectados | backup service/scripts, preflight, docs operativas y tests. |
| Tests necesarios | backup→restore aislado, clave incorrecta, archivo corrupto, uploads ausentes, target protegido. |
| Criterios de aceptación | Una restauración completa aislada queda registrada como correcta, datos/uploads verifican y el proceso no puede apuntar a la DB activa. |

### P0-007 — E2E real del circuito clínico-económico

| Campo | Valor |
|---|---|
| Prioridad | P0 |
| Estado | READY |
| Área/módulo | QA · flujo fundamental |
| Problema detectado | El único E2E intercepta toda la API y solo comprueba cita vinculada a línea. |
| Evidencia encontrada | `frontend/e2e/cita-presupuesto-linea.spec.ts:31-181`; 1 test E2E. |
| Impacto | No hay prueba integrada de presupuesto→pendiente→realizado→factura→cobro ni permisos reales. |
| Usuario afectado | Recepción, clínicos, administración y desarrollo. |
| Solución propuesta | Fixture aislada con backend/Postgres reales, datos únicos y limpieza; escenarios happy path y autorización. |
| Complejidad aproximada | L |
| Dependencias | P0-001 y P0-002; entorno test reproducible. |
| Riesgo | Medio; tests frágiles si dependen de semilla/fecha. |
| Archivos previsiblemente afectados | Playwright config/specs, compose/CI, seed test y helpers. |
| Tests necesarios | flujo completo, parcial, cancelación/anulación y roles. |
| Criterios de aceptación | CI ejecuta al menos un recorrido completo contra API/DB reales y verifica vínculos/saldos persistidos después de recargar. |

## P1 — alto impacto

### P1-001 — Separar alerta clínica, alerta administrativa y observación general

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | BLOCKED |
| Área/módulo | Paciente · privacidad · UX |
| Problema detectado | `observaciones` general contiene salud y se muestra a recepción aunque `datos_salud` esté oculto. |
| Evidencia encontrada | Ejecución real con recepción; `FichaPaciente.tsx:342`; `pacientes.py:84-126`. |
| Impacto | Exposición de datos clínicos y alertas ambiguas. |
| Usuario afectado | Paciente, recepción y clínicos. |
| Solución propuesta | Campos/canales tipados, permisos y migración/reclasificación asistida. |
| Complejidad aproximada | L |
| Dependencias | P0-001; P1-008 para el modelo de salud. |
| Riesgo | Alto; clasificación automática puede interpretar mal texto histórico. |
| Archivos previsiblemente afectados | paciente model/schema/API/migración, Ficha, formularios y tests. |
| Tests necesarios | respuestas por rol, migración conservadora, UI sin fuga, auditoría. |
| Criterios de aceptación | Recepción no recibe alertas clínicas; clínicos ven alertas y origen; ningún texto se reclasifica sin revisión. |
| Bloqueo exacto | Depende del modelo estructurado de P1-008 y de corregir acceso legacy. |

### P1-002 — Enrolamiento 2FA confirmado y secretos protegidos

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Auth · Administración |
| Problema detectado | El secreto se activa antes de verificar OTP y se almacena en claro. |
| Evidencia encontrada | `auth.py:307-328`; `usuario.py:30`; preflight: admin sin 2FA. |
| Impacto | Bloqueo de cuenta y exposición del seed. |
| Usuario afectado | Administradores y personal. |
| Solución propuesta | pending secret cifrado, confirmación OTP, recuperación y revocación auditada. |
| Complejidad aproximada | M |
| Dependencias | P0-002 recomendable. |
| Riesgo | Medio; migración de secretos existentes. |
| Archivos previsiblemente afectados | auth/model/schema/migración, admin UI y tests. |
| Tests necesarios | inicio/confirmación/error/reintento/desactivación/secret existente. |
| Criterios de aceptación | 2FA solo figura activo tras OTP válido; seed no es legible en DB; admin puede recuperar/desactivar mediante flujo seguro. |

### P1-003 — IP confiable y rate limit distribuido

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Seguridad de red |
| Problema detectado | Se confía en XFF arbitrario y los contadores son por worker. |
| Evidencia encontrada | `throttling.py:1-116`, helpers de auth/audit; `SEC-006/008`. |
| Impacto | Evasión de límites e IP de auditoría falsa. |
| Usuario afectado | Todos. |
| Solución propuesta | helper de proxy confiable y backend compartido/gateway para rate limit. |
| Complejidad aproximada | M/L |
| Dependencias | Decidir infraestructura de despliegue para almacén compartido. |
| Riesgo | Medio; bloquear tráfico legítimo detrás de proxy mal configurado. |
| Archivos previsiblemente afectados | config, throttling, auth, audit, Docker/docs y tests. |
| Tests necesarios | XFF no confiable/confiable, múltiples workers conceptual, expiración y límites. |
| Criterios de aceptación | Cliente directo no controla IP efectiva; todos los workers comparten el mismo límite; preflight valida configuración. |

### P1-004 — Apertura, arqueo y cierre de caja

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Caja y facturación |
| Problema detectado | La UI promete arqueo, pero no hay modelo ni workflow persistente. |
| Evidencia encontrada | `frontend/src/modules/caja/index.tsx:125-180`; ausencia de modelo de sesión/cierre. |
| Impacto | No se controla efectivo ni responsabilidad diaria. |
| Usuario afectado | Recepción, administración y dirección. |
| Solución propuesta | Sesión por clínica/caja/usuario, apertura, totales esperados, recuento, diferencia, explicación y cierre inmutable. |
| Complejidad aproximada | L |
| Dependencias | P0-004 y política contable operativa; LEGAL_REVIEW_REQUIRED para requisitos fiscales concretos. |
| Riesgo | Alto; no duplicar facturas/cobros ni inventar contabilidad. |
| Archivos previsiblemente afectados | modelos/migración/API, Caja, reportes, permisos y tests. |
| Tests necesarios | apertura única, cobros, parciales/anulados, cierre, diferencia, clínica/rol. |
| Criterios de aceptación | Recepción cierra un turno con esperado/recuento/diferencia; cierre conserva actor/hora y no se reescribe. |

### P1-005 — Búsqueda global por entidades operativas

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Navegación y búsqueda |
| Problema detectado | Solo se busca paciente dentro de Pacientes; factura/cita/presupuesto/profesional requieren conocer el módulo. |
| Evidencia encontrada | `workflow.ts:27-35`; buscador en `pacientes/index.tsx:226`. |
| Impacto | Más cambios de contexto y aprendizaje innecesario. |
| Usuario afectado | Recepción, clínicos, administración. |
| Solución propuesta | Endpoint con resultados agrupados, normalización y permisos; command palette que abre contexto. |
| Complejidad aproximada | L |
| Dependencias | P0-001/P0-003 para garantizar scope. |
| Riesgo | Alto si mezcla datos o permite enumeración; rendimiento de campos cifrados. |
| Archivos previsiblemente afectados | API/servicio de búsqueda, índices auxiliares seguros, App/header y tests. |
| Tests necesarios | teléfono en formatos, DNI, nombre, cita, factura, presupuesto, rol/sede y latencia. |
| Criterios de aceptación | Un resultado autorizado aparece en ≤2 s y abre su contexto; resultados de otra clínica/rol nunca se devuelven. |

### P1-006 — Recall clínico accionable

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | BLOCKED |
| Área/módulo | Seguimiento · Hoy/Agenda/Paciente |
| Problema detectado | No existe entidad, reglas o cola de revisiones/higiene. |
| Evidencia encontrada | Sin modelo/ruta; solo tratamientos llamados revisión. |
| Impacto | Pérdida de continuidad y pacientes que no regresan. |
| Usuario afectado | Pacientes, recepción, higienistas y dirección. |
| Solución propuesta | Recall tipado con fecha objetivo, estado, responsable, contacto y reglas simples. |
| Complejidad aproximada | L |
| Dependencias | P1-007 y P1-008; definición clínica de tipos/reglas. |
| Riesgo | Medio/alto; automatizar contacto sin preferencia o criterio clínico. |
| Archivos previsiblemente afectados | nuevos modelo/API/migración, Hoy/Agenda/Ficha/reportes y tests. |
| Tests necesarios | creación manual/desde tratamiento, vencimiento, contacto, cierre, permisos y clínica. |
| Criterios de aceptación | Recepción obtiene una cola con siguiente acción y puede convertir un recall en cita sin duplicar paciente/datos. |
| Bloqueo exacto | Requiere catálogo mínimo de recalls validado por la clínica y preferencias de contacto. |

### P1-007 — Responsables, tutores y familias

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Pacientes |
| Problema detectado | Pagador textual no representa tutor legal, relación familiar, vigencia o contacto compartido. |
| Evidencia encontrada | `paciente.py:68-72`; no existe entidad Family/Guardian. |
| Impacto | Duplicación y riesgo en menores/dependientes, consentimientos y cobro. |
| Usuario afectado | Recepción, paciente, administración. |
| Solución propuesta | Persona/contacto relacionado con tipo, vigencia, permisos y rol de pagador; UI contextual. |
| Complejidad aproximada | L |
| Dependencias | LEGAL_REVIEW_REQUIRED para alcance de representación/firma. |
| Riesgo | Alto; no inferir autoridad legal por parentesco. |
| Archivos previsiblemente afectados | modelos/migración/API, Ficha, consentimiento/facturación y tests. |
| Tests necesarios | menor+tutor, familia compartida, pagador, revocación/vigencia, permisos. |
| Criterios de aceptación | Se vincula un responsable sin crear ficha clínica duplicada y la aplicación distingue contacto, pagador y autorizado. |

### P1-008 — Historia médica y alertas estructuradas

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Datos clínicos del paciente |
| Problema detectado | Salud es JSON libre y puede duplicarse en observaciones. |
| Evidencia encontrada | `paciente.py:74-77`; schemas aceptan `dict[str, Any]`. |
| Impacto | Validación, permisos, alertas, auditoría y analítica débiles. |
| Usuario afectado | Odontólogos, auxiliares/higienistas y pacientes. |
| Solución propuesta | Schema versionado para alergia, medicación, patología, alerta y revisión, conservando extras durante transición. |
| Complejidad aproximada | L |
| Dependencias | P0-004; diseño clínico validado. |
| Riesgo | Alto; migración semántica de texto sanitario. |
| Archivos previsiblemente afectados | modelos/schema/crypto/migración/API, PrimeraVisita/Ficha y tests. |
| Tests necesarios | cifrado, permisos, validadores, schema viejo/nuevo, auditoría y UI. |
| Criterios de aceptación | Campos conocidos están tipados y auditados; recepción no los recibe; ningún dato legacy se pierde. |

### P1-009 — Carga diferida y paginación del workspace paciente

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Rendimiento paciente/frontend/API |
| Problema detectado | Se lanzan muchas queries y listas completas aunque la pestaña/drawer no esté visible. |
| Evidencia encontrada | `pacientes/index.tsx:226-336`; historial sin limit/offset. |
| Impacto | Latencia, memoria, ruido de errores y peor escala longitudinal. |
| Usuario afectado | Todos los usuarios de paciente. |
| Solución propuesta | Query de resumen mínima, lazy por contexto, paginación cursor/fecha para timeline y errores aislados. |
| Complejidad aproximada | L |
| Dependencias | P0-001 para la API de historial. |
| Riesgo | Medio; invalidaciones y composición del timeline. |
| Archivos previsiblemente afectados | APIs de historial/citas/documentos, `api.ts`, Pacientes/Historial y tests. |
| Tests necesarios | carga inicial, cambio de pestaña, paginación estable, invalidación y error parcial. |
| Criterios de aceptación | Abrir Ficha no solicita recursos de drawers no usados; timeline carga por páginas sin duplicados ni saltos. |

### P1-010 — Diferenciar Visitas de Historial completo

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | BLOCKED |
| Área/módulo | Paciente · UX clínica |
| Problema detectado | Dos cronologías muestran gran parte de la misma información. |
| Evidencia encontrada | `ClinicalWorkspace.tsx:1104`; `HistorialCompleto.tsx:207-415`. |
| Impacto | Decisión innecesaria, render doble y búsqueda lenta. |
| Usuario afectado | Odontólogos y auxiliares. |
| Solución propuesta | Visitas como resumen por sesión/fecha; Historial como ledger universal paginado. |
| Complejidad aproximada | M |
| Dependencias | P1-009. |
| Riesgo | Medio; retirar información útil de una de las vistas. |
| Archivos previsiblemente afectados | ClinicalWorkspace, HistorialCompleto, tests y estilos. |
| Tests necesarios | agrupación por visita, deep link, filtros, contenido exclusivo y roles. |
| Criterios de aceptación | Cada dato tiene un lugar primario; Visitas resume y enlaza, Historial permite localizar cualquier evento sin duplicación visual completa. |
| Bloqueo exacto | Requiere paginación/lazy para no rediseñar sobre el patrón de carga actual. |

### P1-011 — Lista de espera conectada a huecos y cancelaciones

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | BLOCKED |
| Área/módulo | Agenda |
| Problema detectado | Hay huecos y llamadas, pero no solicitudes con disponibilidad/preferencia reutilizables al cancelarse una cita. |
| Evidencia encontrada | Sin entidad waitlist; agenda sí calcula huecos. |
| Impacto | Ocupación perdida y gestión manual fuera del sistema. |
| Usuario afectado | Recepción y dirección. |
| Solución propuesta | Entrada de espera con paciente, motivo, profesional, franjas, prioridad, estado y acción para ocupar hueco. |
| Complejidad aproximada | L |
| Dependencias | P1-005; definir reglas de prioridad no clínicas. |
| Riesgo | Medio; contacto no autorizado y dobles reservas. |
| Archivos previsiblemente afectados | modelo/migración/API, Agenda/Hoy/WhatsApp y tests. |
| Tests necesarios | crear, casar hueco, reservar atómicamente, cerrar, rol/clínica. |
| Criterios de aceptación | Una cancelación muestra candidatos autorizados y una acción crea la cita sin duplicar datos ni reservar dos veces. |
| Bloqueo exacto | Se abordará tras búsqueda global y cierre de permisos. |

### P1-012 — Simplificar el editor de presupuesto

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Presupuestos · UX |
| Problema detectado | Estado, catálogo, odontograma, líneas y acciones aparecen juntos en un modal largo. |
| Evidencia encontrada | `pacientes/index.tsx:961-1050`; `Presupuestos.tsx:179-300`; recorrido real. |
| Impacto | Scroll, errores de foco y mayor aprendizaje en una tarea frecuente. |
| Usuario afectado | Odontólogos y recepción autorizada. |
| Solución propuesta | Resumen/líneas como núcleo; catálogo y odontograma bajo acciones contextuales; preservar aceptación parcial. |
| Complejidad aproximada | M |
| Dependencias | Ninguna obligatoria; coordinar con P2-003. |
| Riesgo | Medio; ocultar demasiado o romper flujo odontograma→línea. |
| Archivos previsiblemente afectados | Presupuestos, Pacientes modal, estilos y tests. |
| Tests necesarios | crear línea, odontograma, parcial, pendiente, factura, teclado/foco. |
| Criterios de aceptación | Estado/total/líneas/acción principal visibles sin scroll inicial; añadir tratamiento no exige navegar fuera; funciones existentes siguen disponibles. |

### P1-013 — Extraer políticas y módulos de hotspots técnicos

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | BLOCKED |
| Área/módulo | Arquitectura frontend/backend |
| Problema detectado | Routers/componentes/API/CSS gigantes dificultan cambios seguros. |
| Evidencia encontrada | `index.css` 21k líneas, `api.ts` 1.974, Agenda 1.768, Pacientes 1.568, routers 800-1.018. |
| Impacto | Regresiones, conflictos, duplicación y baja velocidad de entrega. |
| Usuario afectado | Desarrollo y, por regresiones, usuarios finales. |
| Solución propuesta | Extraer por transición/política/dominio mientras se modifica cada área; módulos API y CSS con contrato estable. |
| Complejidad aproximada | XL incremental |
| Dependencias | Tener un cambio funcional concreto; no hacer refactor masivo aislado. |
| Riesgo | Alto si se intenta de golpe. |
| Archivos previsiblemente afectados | hotspots listados y tests. |
| Tests necesarios | suites de dominio y snapshots/comportamiento antes/después. |
| Criterios de aceptación | Cada extracción reduce responsabilidad medible sin cambiar contrato; no se crea una capa genérica sin uso. |
| Bloqueo exacto | Solo se activa por subtask ligada a otro backlog; la tarea paraguas no se implementa de una vez. |

### P1-014 — Builds backend reproducibles y hardening web/CI

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Dependencias, frontend web y CI |
| Problema detectado | Python sin lock, sin auditoría en CI; nginx sin CSP/Permissions-Policy; actions por tag mayor. |
| Evidencia encontrada | `pyproject.toml:7`, `nginx.conf`, `.github/workflows/ci.yml`. |
| Impacto | Deriva de builds y menor defensa supply-chain/XSS. |
| Usuario afectado | Operaciones y todos los usuarios. |
| Solución propuesta | Lock/constraints, escaneo dependencias, pinning reforzado y CSP en modo report-only antes de enforcement. |
| Complejidad aproximada | M |
| Dependencias | Inventario de orígenes/proveedores reales para CSP. |
| Riesgo | Medio; CSP o pins pueden romper integraciones/builds. |
| Archivos previsiblemente afectados | lock/pyproject, CI, nginx, Docker y docs. |
| Tests necesarios | build limpio reproducido, audit, headers y navegación/integraciones. |
| Criterios de aceptación | Dos builds usan versiones idénticas; CI falla ante vulnerabilidad según política; CSP no rompe flujos y llega a enforcement documentado. |

### P1-015 — Agrupar la navegación de Administración

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Administración · UX |
| Problema detectado | 13 tabs planos de igual jerarquía. |
| Evidencia encontrada | `frontend/src/modules/adminExtras/index.tsx`; recorrido real. |
| Impacto | Exploración lenta y peor responsive. |
| Usuario afectado | Administrador/director. |
| Solución propuesta | Grupos Organización, Clínica, Operaciones y Seguridad; conservar deep links y búsqueda local. |
| Complejidad aproximada | M |
| Dependencias | Ninguna. |
| Riesgo | Bajo/medio; cambiar memoria espacial. |
| Archivos previsiblemente afectados | admin tabs/workspace, workflow config, estilos y tests. |
| Tests necesarios | permisos, deep links, móvil/teclado, persistencia de tab. |
| Criterios de aceptación | Todas las funciones siguen a ≤2 decisiones; no hay 13 opciones simultáneas; URLs existentes siguen abriendo la sección correcta. |

### P1-016 — Gobernanza de documentación vigente

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | READY |
| Área/módulo | Documentación y operación |
| Problema detectado | Documentos activos contradicen portal, almacenamiento de token, migración head y resultados de tests actuales. |
| Evidencia encontrada | `arquitectura.md`, `modulos.md`, `mapa-funcional-clinica.md`, `AUDIT_CURRENT_STATE.md`. |
| Impacto | Decisiones y soporte basados en estado obsoleto. |
| Usuario afectado | Desarrollo, soporte y operación. |
| Solución propuesta | Índice de vigencia, marcar históricos, actualizar arquitectura/runbooks y checks de links/fecha. |
| Complejidad aproximada | M |
| Dependencias | Auditorías actuales (cumplida). |
| Riesgo | Bajo; no borrar evidencia histórica. |
| Archivos previsiblemente afectados | `docs/README.md` nuevo y docs existentes. |
| Tests necesarios | links, referencias de migración/comandos, revisión manual. |
| Criterios de aceptación | Existe una entrada canónica; ningún documento vigente afirma que portal/token sigue pendiente; históricos están marcados como tales. |

### P1-017 — Normalizar estados y transiciones de cita

| Campo | Valor |
|---|---|
| Prioridad | P1 |
| Estado | BLOCKED |
| Área/módulo | Agenda · modelo de estados |
| Problema detectado | El enum mezcla español/inglés y la UI expone valores internos; muchas acciones pueden seleccionar estados sin transición central. |
| Evidencia encontrada | `backend/app/models/cita.py:11-25`; historial mostró `en_clinica`. |
| Impacto | Confusión, reporting incoherente y estados imposibles. |
| Usuario afectado | Recepción, clínicos y dirección. |
| Solución propuesta | Máquina de estados canónica con etiquetas, alias legacy y migración gradual. |
| Complejidad aproximada | L |
| Dependencias | Inventario de estados existentes e integraciones WhatsApp/portal. |
| Riesgo | Alto; migración y compatibilidad con webhooks/reportes. |
| Archivos previsiblemente afectados | modelo/migración/API/services, Agenda/WhatsApp/Portal/reportes y tests. |
| Tests necesarios | matriz de transiciones, alias legacy, webhook, portal, reportes y migración. |
| Criterios de aceptación | Cada estado tiene valor canónico/etiqueta; transiciones inválidas reciben 409; ningún valor técnico se muestra al usuario. |
| Bloqueo exacto | Requiere primero documentar todos los estados reales y contratos externos. |

## P2 — mejora relevante

### P2-001 — Periodontograma longitudinal

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Clínica · Periodoncia |
| Problema detectado | El odontograma no registra sondaje, sangrado, recesión, movilidad, furcación o placa. |
| Evidencia encontrada | Modelos y UI de odontograma sin examen periodontal. |
| Impacto | Clínicas con periodoncia/higiene avanzada necesitan herramientas externas. |
| Usuario afectado | Periodoncista, higienista y paciente. |
| Solución propuesta | Examen versionado por fecha, seis sitios por diente, métricas y comparación. |
| Complejidad aproximada | XL |
| Dependencias | P1-008 y perfil clínico/higienista; diseño clínico validado. |
| Riesgo | Alto; exactitud clínica, volumen de datos y UX especializada. |
| Archivos previsiblemente afectados | nuevos modelos/API/migración, módulo clínico, PDF y tests. |
| Tests necesarios | validación de sitios/medidas, histórico, permisos, impresión y accesibilidad. |
| Criterios de aceptación | Se registran dos exploraciones sin sobrescribir la primera y se comparan por pieza/sitio con permisos clínicos. |
| Bloqueo exacto | Requiere definición clínica de mediciones, rangos y representación. |

### P2-002 — Vista semanal y series recurrentes de agenda

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Agenda |
| Problema detectado | El flujo operativo es diario; no hay serie/recurrencia con excepciones. |
| Evidencia encontrada | Modelo `Cita` individual y UI diaria. |
| Impacto | Planificación de tratamientos repetidos y visión de capacidad limitada. |
| Usuario afectado | Recepción y dirección. |
| Solución propuesta | Vista semana sobre mismo endpoint; entidad serie con regla, instancias y excepciones explícitas. |
| Complejidad aproximada | XL |
| Dependencias | P1-017; P1-011 recomendable. |
| Riesgo | Alto; zona horaria, edición de una/todas y conflictos. |
| Archivos previsiblemente afectados | cita model/API/service/migración, Agenda y tests. |
| Tests necesarios | DST/zona horaria, conflictos, excepción, cancelar una/todas, performance. |
| Criterios de aceptación | Semana mantiene consistencia con día; una serie no genera dobles reservas y permite modificar una ocurrencia sin reescribir las demás. |
| Bloqueo exacto | Depende de normalizar estados/transiciones. |

### P2-003 — Fases, alternativas y versiones del plan/presupuesto

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Plan de tratamiento y presupuestos |
| Problema detectado | El presupuesto actual no representa alternativas/fases ni versiones inmutables aceptadas. |
| Evidencia encontrada | Modelo presupuesto/líneas con estado y aceptación, sin versión/caducidad/firma. |
| Impacto | Planes complejos se documentan fuera o se sobrescriben. |
| Usuario afectado | Odontólogo, paciente y administración. |
| Solución propuesta | Versión inmutable, fases/alternativas, caducidad y aceptación/firma contextual. |
| Complejidad aproximada | XL |
| Dependencias | P1-012; LEGAL_REVIEW_REQUIRED para firma/aceptación. |
| Riesgo | Alto; mantener vínculo de líneas ya pendientes/facturadas. |
| Archivos previsiblemente afectados | presupuesto modelos/API/migración, UI/PDF/consentimiento y tests. |
| Tests necesarios | nueva versión, parcial, caducidad, firma, pendientes/factura de versión previa. |
| Criterios de aceptación | Una versión aceptada no se altera; alternativa/fase elegida queda vinculada a pendientes y factura. |
| Bloqueo exacto | Debe simplificarse primero el editor y definir semántica de firma. |

### P2-004 — Devoluciones y financiación estructurada

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Finanzas |
| Problema detectado | Anular cobro no registra devolución real; “Financiado” es solo forma de pago. |
| Evidencia encontrada | modelos de cobro/anticipo sin reembolso ni calendario de cuotas. |
| Impacto | Saldos y seguimiento de acuerdos externos/manuales incompletos. |
| Usuario afectado | Administración, recepción y paciente. |
| Solución propuesta | Movimiento de devolución vinculado; plan de cuotas separado de cobros efectivos. |
| Complejidad aproximada | L |
| Dependencias | P1-004; LEGAL_REVIEW_REQUIRED fiscal/consumo. |
| Riesgo | Alto; implicaciones fiscales y no duplicar deuda. |
| Archivos previsiblemente afectados | facturas/modelos/migración/API, Caja/Ficha/reportes/PDF y tests. |
| Tests necesarios | devolución parcial/total, cuota vencida, pago anticipado, anulación y saldo. |
| Criterios de aceptación | Toda salida de dinero se registra como movimiento vinculado y un plan no se contabiliza como cobrado hasta recibir pago. |
| Bloqueo exacto | Depende del cierre de caja y revisión fiscal externa. |

### P2-005 — Lotes, caducidad, ubicación y consumo de inventario

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | READY |
| Área/módulo | Inventario |
| Problema detectado | Stock agregado sin lote/caducidad/ubicación ni consumo por tratamiento. |
| Evidencia encontrada | `Producto`, `MovimientoInventario` y pedido sin esas entidades. |
| Impacto | Trazabilidad limitada de material y alertas tardías. |
| Usuario afectado | Auxiliar, administración y dirección. |
| Solución propuesta | Lote por producto/ubicación, fecha de caducidad y movimientos de consumo; FEFO como ayuda, no automatismo irreversible. |
| Complejidad aproximada | L |
| Dependencias | P0-004. |
| Riesgo | Medio/alto; stock existente sin lote. |
| Archivos previsiblemente afectados | inventario modelos/API/migración/UI/reportes y tests. |
| Tests necesarios | recepción por lote, consumo, caducidad, traslado, ajuste y multi-clínica. |
| Criterios de aceptación | Cada unidad trazable mantiene lote/ubicación y no se permite stock negativo sin ajuste auditado. |

### P2-006 — Preferencias y canales de comunicación comunes

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Comunicación |
| Problema detectado | WhatsApp está integrado, pero preferencias son un `no_correo` y no hay email/SMS provider común. |
| Evidencia encontrada | `paciente.py:57`; modelos solo WhatsApp. |
| Impacto | Riesgo de contactar por canal no deseado y registro fragmentado. |
| Usuario afectado | Paciente y recepción. |
| Solución propuesta | Preferencia/consentimiento por finalidad/canal, registro común y adapters de proveedor. |
| Complejidad aproximada | L |
| Dependencias | P1-007; LEGAL_REVIEW_REQUIRED. |
| Riesgo | Alto; normativa, terceros y datos sensibles. |
| Archivos previsiblemente afectados | paciente/comunicación modelos/API/migración, Agenda/Ficha/Historial/Admin y tests. |
| Tests necesarios | opt-in/out, finalidad, fallback, fallo proveedor, auditoría y portal. |
| Criterios de aceptación | Antes de enviar se valida preferencia server-side y todo intento/resultado aparece en un timeline común. |
| Bloqueo exacto | Requiere definición jurídica/operativa de finalidad y proveedores. |

### P2-007 — Perfil higienista y permisos configurables

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Personal y permisos |
| Problema detectado | Higienista se aproxima como auxiliar y los permisos están codificados por rol. |
| Evidencia encontrada | roles fijos en `permissions.py:11-18` y `workflow.ts:37-43`. |
| Impacto | Accesos demasiado amplios/estrechos y reporting poco fiel. |
| Usuario afectado | Higienistas, auxiliares y administradores. |
| Solución propuesta | Roles base más capacidades por usuario/clínica; migrar roles actuales a defaults. |
| Complejidad aproximada | XL |
| Dependencias | P0-001/P0-002/P0-003. |
| Riesgo | Muy alto; una matriz mal migrada puede conceder acceso. |
| Archivos previsiblemente afectados | auth/permisos/modelos/migración, toda UI condicionada y tests. |
| Tests necesarios | matriz completa, deny by default, clínica, cambios en sesión y UI/backend. |
| Criterios de aceptación | Cada capacidad crítica se niega server-side por defecto y los roles actuales conservan únicamente permisos documentados. |
| Bloqueo exacto | Se pospone hasta cerrar autorización y tenant base. |

### P2-008 — Adjuntos y control de calidad de laboratorio

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | READY |
| Área/módulo | Laboratorio/documentos |
| Problema detectado | La orden es rica, pero no tiene colección explícita de adjuntos/entregables ni checklist de calidad. |
| Evidencia encontrada | `TrabajoLaboratorio` sin relación documental propia. |
| Impacto | Fotos, diseños y conformidad quedan dispersos. |
| Usuario afectado | Odontólogo, auxiliar y laboratorio. |
| Solución propuesta | Vínculo documental tipado y checklist/incidencia sobre la orden existente. |
| Complejidad aproximada | M |
| Dependencias | Reutilizar Documento; P0-004. |
| Riesgo | Medio; duplicar archivo o permisos de paciente. |
| Archivos previsiblemente afectados | laboratorio/documento modelos/API/UI y tests. |
| Tests necesarios | adjuntar/descargar por rol, baja lógica, incidencia y recepción. |
| Criterios de aceptación | Un archivo se archiva una vez y se localiza desde paciente y orden con el mismo permiso/trail. |

### P2-009 — Profesionales y pacientes multi-sede explícitos

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Multi-clínica |
| Problema detectado | Doctor/usuario tienen una clínica; no hay asignación multi-sede ni política de paciente compartido. |
| Evidencia encontrada | FK única `clinica_id` en modelos. |
| Impacto | Operación de grupos con profesionales compartidos limitada. |
| Usuario afectado | Dirección y personal multi-sede. |
| Solución propuesta | Memberships con rol/capacidad por sede y sharing explícito del paciente. |
| Complejidad aproximada | XL |
| Dependencias | P0-003 y P2-007. |
| Riesgo | Muy alto; expansión de superficie tenant. |
| Archivos previsiblemente afectados | modelos/migración/auth/permisos, casi todos los scopes, UI y tests. |
| Tests necesarios | matrices multi-sede, cambio de sede, reporting global, paciente no compartido/compartido. |
| Criterios de aceptación | Cambiar de sede recalcula permisos; pertenecer a A+B no concede acceso a C; compartir paciente es explícito/auditado. |
| Bloqueo exacto | No iniciar hasta eliminar `NULL` legacy y estabilizar permisos. |

### P2-010 — KPIs accionables y drill-down

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | BLOCKED |
| Área/módulo | Reportes y dirección |
| Problema detectado | Hay métricas, pero conversión, recall y rentabilidad no tienen definiciones/cohortes/drill-down consistentes. |
| Evidencia encontrada | endpoints/reportes actuales y seis tabs de Listados. |
| Impacto | Dirección ve números sin poder actuar o explicar variaciones. |
| Usuario afectado | Director y administración. |
| Solución propuesta | Diccionario de métricas, filtros/cohortes y enlace a lista subyacente. |
| Complejidad aproximada | L |
| Dependencias | P1-006, P1-004 y P2-003 según KPI. |
| Riesgo | Medio; definiciones comerciales ambiguas. |
| Archivos previsiblemente afectados | reportes API/services/UI y tests. |
| Tests necesarios | fórmulas con dataset fijo, clínica/global, fechas, anulaciones y drill-down. |
| Criterios de aceptación | Cada KPI documenta fórmula y abre exactamente los registros que explican el valor. |
| Bloqueo exacto | Los dominios fuente (recall/caja/planes) aún no existen. |

### P2-011 — Auditoría de accesibilidad y teclado

| Campo | Valor |
|---|---|
| Prioridad | P2 |
| Estado | READY |
| Área/módulo | Frontend transversal |
| Problema detectado | No hay prueba WCAG/teclado completa; algunos tabs no presentan nombre en snapshot y modales son largos. |
| Evidencia encontrada | recorrido Playwright; suites sin axe equivalente. |
| Impacto | Usuarios de teclado/lector pueden no completar tareas y se degradan atajos. |
| Usuario afectado | Todo el personal, especialmente con necesidades de accesibilidad. |
| Solución propuesta | Baseline automatizado y recorridos manuales de foco/contraste; corregir por flujo. |
| Complejidad aproximada | M incremental |
| Dependencias | Coordinar con P1-012/P1-015 para no duplicar trabajo. |
| Riesgo | Bajo. |
| Archivos previsiblemente afectados | tests E2E, componentes, estilos y docs. |
| Tests necesarios | axe/teclado en login, agenda, ficha, presupuesto, caja y admin. |
| Criterios de aceptación | Cero violaciones críticas automatizadas en flujos objetivo; foco entra/sale de modal y toda acción primaria funciona por teclado. |

## P3 — avanzado

### P3-001 — Campañas y automatización multicanal

| Campo | Valor |
|---|---|
| Prioridad | P3 |
| Estado | BLOCKED |
| Área/módulo | Comunicación/marketing |
| Problema detectado | No hay segmentación ni secuencias automáticas. |
| Evidencia encontrada | Solo WhatsApp operativo y recordatorio por cita. |
| Impacto | Menor automatización de recall/seguimiento. |
| Usuario afectado | Recepción/dirección/paciente. |
| Solución propuesta | Segmentos guardados, plantillas, límites, aprobación y resultados sobre registro común. |
| Complejidad aproximada | XL |
| Dependencias | P1-006 y P2-006; LEGAL_REVIEW_REQUIRED. |
| Riesgo | Alto; spam, reputación y privacidad. |
| Archivos previsiblemente afectados | comunicación, jobs, UI/reportes y tests. |
| Tests necesarios | consentimiento, límites, cancelación, idempotencia, proveedor y auditoría. |
| Criterios de aceptación | Ninguna campaña contacta pacientes sin preferencia/finalidad válida y cada envío puede detenerse/auditarse. |
| Bloqueo exacto | Depende de recall y preferencias/canales. |

### P3-002 — Rentabilidad avanzada por procedimiento/profesional

| Campo | Valor |
|---|---|
| Prioridad | P3 |
| Estado | BLOCKED |
| Área/módulo | Analítica |
| Problema detectado | Ingresos y costes de laboratorio existen, pero no imputación completa de tiempo/material. |
| Evidencia encontrada | reportes y laboratorio sin consumo por acto. |
| Impacto | Dirección no conoce margen completo. |
| Usuario afectado | Dirección. |
| Solución propuesta | Modelo de coste documentado y reporte con supuestos visibles. |
| Complejidad aproximada | XL |
| Dependencias | P2-005 y P2-010. |
| Riesgo | Alto; falsa precisión. |
| Archivos previsiblemente afectados | tratamientos/inventario/lab/reportes y tests. |
| Tests necesarios | dataset contable fijo, anulaciones, reparto y clínica. |
| Criterios de aceptación | Toda cifra muestra componentes/supuestos y reconcilia con movimientos fuente. |
| Bloqueo exacto | Faltan consumo de material y diccionario de KPIs. |

### P3-003 — Visor de imagen dental/PACS

| Campo | Valor |
|---|---|
| Prioridad | P3 |
| Estado | BLOCKED |
| Área/módulo | Imagen clínica |
| Problema detectado | Radiografías/fotos son documentos genéricos. |
| Evidencia encontrada | DocumentoPaciente sin metadatos/visor especializado. |
| Impacto | Menor eficiencia diagnóstica en clínicas intensivas en imagen. |
| Usuario afectado | Odontólogos. |
| Solución propuesta | Metadatos/series, visor seguro y, si procede, integración PACS/DICOM. |
| Complejidad aproximada | XL |
| Dependencias | Selección de estándar/proveedor; threat model; LEGAL_REVIEW_REQUIRED de procesamiento. |
| Riesgo | Alto; volumen, formatos, diagnóstico y terceros. |
| Archivos previsiblemente afectados | documentos/storage/API, visor frontend y tests. |
| Tests necesarios | formatos, autorización, caché, rendimiento, integridad y anonimización export. |
| Criterios de aceptación | Imágenes se ven en contexto sin descarga pública y mantienen metadatos/integridad por paciente/sede. |
| Bloqueo exacto | No hay requisitos ni proveedor definidos; no es núcleo actual. |

### P3-004 — Optimización asistida de agenda

| Campo | Valor |
|---|---|
| Prioridad | P3 |
| Estado | BLOCKED |
| Área/módulo | Agenda avanzada |
| Problema detectado | La asignación de huecos es manual. |
| Evidencia encontrada | Existe cálculo de huecos, sin optimizador. |
| Impacto | Planificación menos eficiente a escala. |
| Usuario afectado | Recepción/dirección. |
| Solución propuesta | Recomendaciones explicables según duración, profesional, gabinete, prioridad y espera; usuario confirma. |
| Complejidad aproximada | XL |
| Dependencias | P1-011, P2-002 y datos históricos fiables. |
| Riesgo | Alto; recomendación opaca o prioridad injusta. |
| Archivos previsiblemente afectados | agenda service/API/UI/reportes y tests. |
| Tests necesarios | restricciones, determinismo, explicación, concurrencia y override humano. |
| Criterios de aceptación | El sistema propone sin reservar automáticamente, explica restricciones y nunca viola horarios/conflictos. |
| Bloqueo exacto | Depende de lista de espera, semana/series y calidad de datos. |

## Próximo orden previsto

1. P0-001 — autorización del historial clínico.
2. P0-002 — revocación efectiva de sesiones.
3. P0-004 — integridad/cobertura de auditoría.
4. P0-006 — restauración real aislada.
5. P0-007 — E2E real.
6. Resolver el bloqueo de P0-003 con inventario/asignación de datos antes de migrar.
7. Revisar P0-005 con política de retención y el nuevo trail.

El orden puede cambiar solo por nueva evidencia, riesgo o dependencia documentada aquí.
