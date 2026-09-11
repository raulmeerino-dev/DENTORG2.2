# Semántica de producto de DentCore

Fecha: 2026-09-05. Contrato de lenguaje para evitar módulos, campos y decisiones duplicados. La Fase A inicia su aplicación; las automatizaciones de B–L descritas como pendientes no se consideran implementadas por este documento.

## Contexto e identidad

Toda operación mantiene paciente, clínica, usuario y permisos. Una ruta o una selección de frontend no concede acceso. La sesión de **usuario** autentica al profesional; no debe confundirse con la sesión **clínica** del paciente.

## Episodio clínico y plan

| Concepto | Significado único | Relación con la implementación |
|---|---|---|
| Cita | Reserva de tiempo para un paciente con profesional, fecha y duración; puede referenciar el tratamiento previsto. | `Cita`. Confirmar o atender la cita no demuestra por sí solo que un tratamiento se haya realizado, facturado o cobrado. |
| Llegada | Hecho de que el paciente se encuentra en la clínica. Su hora efectiva debe originar la espera. | Hoy se expresa por estado `en_clinica`; registrar hora efectiva y temporizador pertenece a H, todavía pendiente. No derivarla de la hora reservada. |
| Sesión | Trabajo clínico de una visita: lo previsto, lo realizado, incidencias y documentación. | `SesionClinicaItem` conserva vínculos a cita, línea de presupuesto e historial. El modelo actual reúne ítems activos por paciente; C–D deben concretar episodio y cierre sin crear un inventario paralelo. |
| Plan | Conjunto coherente de tratamientos propuestos o aceptados y su progreso. | Perspectiva de las líneas existentes, sus trabajos pendientes, citas y realizados. No es otro presupuesto ni requiere una nueva tabla por definición. |
| Línea de tratamiento | Una actuación prevista sobre paciente y, cuando proceda, pieza/superficie, con procedencia y progreso trazables. | El catálogo define el tipo de tratamiento; la línea identifica la propuesta concreta. `PresupuestoLinea`, `TrabajoPendiente`, `SesionClinicaItem` e `HistorialClinico` conservan relaciones, no representan cuatro decisiones humanas distintas. |
| Presupuesto | Presentación económica de las propuestas y registro de su aceptación total o parcial. | `Presupuesto` y `PresupuestoLinea`. No implica realización, factura ni pago. |
| Aceptación | Decisión del paciente sobre una propuesta concreta. | `PresupuestoLinea.aceptado`. La incorporación automática al trabajo operativo es el objetivo de B; en A aún existe la conversión manual. |
| Tratamiento programado | Línea vinculada a una cita concreta para su ejecución prevista. | Usar los vínculos existentes; no pedir otra selección del mismo tratamiento. La asociación automática completa se abordará en B–C. |
| Tratamiento realizado | Actuación efectivamente registrada por el profesional, con fecha, paciente y trazabilidad clínica. | `HistorialClinico` y referencias `historial_id` de sesión/pendiente. No deducir realización de aceptación, cita atendida o pago. |

Vida conceptual objetivo de una línea: propuesta → aceptada → programada → en curso → realizada, con posposición o cancelación cuando proceda. Los estados técnicos actuales se conservan hasta implementar B y su compatibilidad. Un diagnóstico describe un hallazgo; no es una factura ni un realizado. El historial relata hechos y cambios; no exige volver a introducirlos.

## Cuenta del paciente

| Concepto | Significado único | Integridad requerida |
|---|---|---|
| Factura | Documento económico/fiscal emitido, con líneas e importes y vínculos a las actuaciones cuando proceda. | `Factura` y `FacturaLinea`. Conserva identidad, documentos y trazabilidad; anulación/rectificación no borra hechos. Una actuación facturable todavía no es deuda facturada. |
| Pago | Dinero recibido para liquidar total o parcialmente una factura. | Entidad actual `Cobro`. Su forma de pago, importe, fecha, usuario y eventual anulación deben seguir identificables. |
| Anticipo | Dinero recibido a cuenta del paciente, todavía sin asignación a una factura concreta. | `PagoAnticipadoPaciente`. No crearlo implícitamente al pulsar «Cobrar». No contar otra vez el ingreso al aplicarlo a una factura. |
| Saldo | Posición de la cuenta tras facturas y movimientos vigentes: positivo, importe pendiente; negativo, saldo a favor. | Distinguir deuda facturada bruta, pagos de facturas y anticipos. Una factura puede seguir pendiente aunque exista dinero a cuenta; no ocultar esa diferencia ni cobrarlo dos veces. |
| Checkout / cuenta del paciente | Operación de recepción que explica deuda, actuaciones facturables y dinero a cuenta antes de decidir facturar, recibir pago total/parcial, dejar saldo a favor o no cobrar hoy. | Experiencia común sobre Factura, Pago y Anticipo, no sustituto de esas entidades. La confirmación debe describir el movimiento real y su efecto. «No paga hoy» no crea un cobro de importe cero ni cancela deuda. El cierre conjunto del episodio pertenece a D. |
| Recall | Seguimiento por contactar o volver a citar en el intervalo indicado por un profesional cuando no se concreta una cita. | No equivale a recordatorio de una cita ya reservada. El flujo desde finalizar visita pertenece a J y sigue pendiente. No inferir ni inventar una recomendación clínica. |

## Reglas de representación

- Los resúmenes clínicos deben derivarse de los datos clínicos canónicos. Un dato no consultable por permisos, no cargado o no registrado no significa ausencia de alergias.
- Las observaciones administrativas no son un segundo registro de alergias. No extraer automáticamente una decisión clínica de texto libre ni destruir observaciones antiguas.
- Los importes anulados no cuentan como dinero vigente. Deuda, saldo a favor y actuaciones sin facturar deben poder distinguirse antes de confirmar.
- Conservar la ruta tras renovar sesión no autoriza a recuperar información de otro usuario o clínica. Los borradores en memoria solo se recuperan para la misma identidad.
- Ninguna simplificación visual justifica borrar documentos, historial, relaciones económicas o auditoría.
