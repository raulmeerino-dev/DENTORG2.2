# Cuenta del paciente y salida de recepción

El cargo de un tratamiento realizado existe independientemente de su factura. El cierre clínico entrega la visita a Pendiente de salida; recepción cobra, aplica saldo a favor o deja deuda sin tener que emitir antes una factura.

## Fuente de verdad

- `CargoPaciente`: instantánea del precio aplicado, IVA, descuento, fecha, profesional, pieza/superficies, tratamiento, paciente y visita. Un historial realizado tiene como máximo un cargo. El precio del catálogo puede cambiar sin modificar cargos existentes.
- `Cobro`: dinero recibido. Puede existir sin `factura_id`, con paciente y clínica propios.
- `PagoAnticipadoPaciente`: dinero recibido a cuenta; se conserva como movimiento original.
- `AplicacionPago`: aplicación de un cobro o anticipo a un cargo. No representa otro ingreso.
- `Factura` y sus líneas: documentación de cargos. Emitir una factura de un cargo existente no aumenta la deuda. El PDF, sellado, registros SIF y rectificaciones siguen el circuito fiscal existente.
- Saldo: cargos activos menos dinero recibido vigente. Un importe negativo expresa saldo a favor. Los pagos anulados conservan registro y motivo, pero dejan de reducir el saldo.

Los cargos históricos cuyo importe no se registró aparecen «Sin valorar». Su valoración exige importe explícito y motivo auditado. No se sustituye un importe ausente por la tarifa actual del catálogo. Los tratamientos de 0 € permanecen en el historial y conservan el motivo registrado.

La corrección de un importe aún no cobrado ni facturado mantiene auditoría. El descuento explícito aplicado al emitir desde el flujo anterior ajusta el cargo y deja trazabilidad; no puede sobrescribir un cargo con pagos. Anular un documento de un tratamiento no elimina el acto clínico ni su cargo. Los servicios documentados antes de su realización desde un presupuesto se enlazan al mismo cargo cuando se realizan.

## Operación de recepción

Jornada y Caja comparten `CheckoutQueue` y `PatientCheckout`. La cuenta muestra lo realizado en la visita, deuda anterior, saldo a favor, cargos y pagos. Permite cobro completo o parcial y salida sin cobro. La factura es una acción explícita desde el mismo checkout; esta implementación no determina ni cambia el momento de emisión exigible fiscalmente.

Caja ofrece Salidas, Cuentas pendientes, Pagos y Facturas. Ficha, historial económico y Registros consumen la misma cuenta; los pagos no requieren un documento previo para aparecer. La proyección de pagos de una factura representa sus aplicaciones y no debe sumarse como otro ingreso en Caja.

Al finalizar la visita se guardan los campos clínicos pendientes y las notas de pieza. Si un guardado falla, la visita permanece abierta. Un tratamiento planificado no se convierte automáticamente en realizado al cerrar una visita.

## Consistencia y permisos

`POST /api/cuentas/{patient_id}/checkout` recibe UUID de petición y versión de la cuenta. Bloquea cita (cuando existe) y paciente, verifica saldo y registra pago, aplicaciones, salida y auditoría en una transacción. Una repetición de la misma petición devuelve su recibo. Reutilizar su UUID con otro contenido produce 409. Dos peticiones distintas sobre una versión antigua no cobran dos veces, incluso si el primer pago fue parcial.

El cliente bloquea doble clic y conserva la operación pendiente en `sessionStorage`, por usuario y paciente. Tras un error de conexión vuelve a enviar el mismo UUID y contenido. El backend mantiene la idempotencia incluso si el almacenamiento local no está disponible. No se guarda un pago offline ni se muestra éxito antes de la confirmación del servidor.

La emisión desde cargos también usa un UUID de operación. La numeración de factura se serializa por serie. Las escrituras económicas comparten el bloqueo de paciente. Recepción y administración gestionan cuenta y salidas; solo administración anula cobros, con motivo. Los lectores y comandos respetan clínica y los perfiles clínicos no obtienen saldos por los nuevos endpoints.

## Historial clínico-económico

La vista general agrupa los actos por visita, con totales de cargos, aplicaciones vigentes y pendiente. Puede desagruparse, buscar por notas/pieza/profesional o limitarse a actos con saldo pendiente. Los tratamientos sin presupuesto utilizan exactamente los mismos cargos. El detalle abre los registros originales de tratamiento, visita, factura y pago; los documentos y consentimientos vinculados son enlaces contextuales, no eventos independientes.

Las facturas íntegramente representadas por tratamientos quedan como enlaces contextuales en Todo y siguen disponibles en Facturación. Las facturas manuales, mixtas, anuladas o rectificativas conservan su entrada propia. No se reparten cobros de factura por porcentajes: se muestran las aplicaciones reales del libro de cargos.

Cada movimiento expone sus aplicaciones y quién lo registró. Para pagos de checkout, el saldo tras la operación procede del recibo inmutable guardado en `OperacionCheckout.resultado`; no cambia al recibir pagos posteriores. Se distingue del pendiente actual del tratamiento o sesión. Los pagos históricos sin esa instantánea muestran «—». No se reconstruyen saldos por ordenación de fechas. Una instantánea global de otra clínica no se expone a recepción aunque el paciente o pago heredado sea compartido.

Esta ampliación es de lectura y no requiere otra migración ni modifica la lógica de facturación o cobro.

## Migración 0049

Migración aditiva, sin eliminar facturas, cobros ni historias. Conserva importes y vínculos de las facturas anteriores en cargos históricos; aplica sus pagos hasta el importe del cargo y mantiene cualquier exceso como saldo a favor. Los movimientos de facturas anuladas no desaparecen: el dinero vigente conserva su naturaleza de saldo a favor.

Antes de desplegar: copia de seguridad, prueba de migración sobre una copia y `alembic upgrade head` antes de arrancar esta versión. La aplicación anterior no interpreta pagos sin factura. El downgrade destructivo de 0049 está bloqueado deliberadamente; volver de versión requiere un backend compatible con el libro de cargos, no borrar el libro ni las aplicaciones.

Verificación local: copia restaurada de la base sintética, comparación de importes y número de movimientos antes/después, reconciliación de cargos y ausencia de aplicaciones excesivas. La migración también se prueba con facturas históricas, pagos superiores al total y repetición del backfill.

## Validación

- `backend/tests/test_patient_checkout.py`: total/parcial/sin pago, tratamientos sin presupuesto, deuda anterior, anticipo, 0 €, pagos posteriores, UUID repetido, dos conexiones simultáneas, roles y clínicas, migración, anulación, descuentos y enlace con facturas/presupuestos.
- `frontend/src/domains/billing/checkout/PatientCheckout.test.tsx`: parcial sin factura previa, saldo a favor sin introducir cobro, pérdida de respuesta y reapertura, importe excesivo y doble clic.
- Pruebas de sesión: espera escrituras concurrentes, guarda antes de finalizar y mantiene la visita abierta si falla una nota.
- `frontend/e2e/clinical-billing-real.spec.ts`: presupuesto → cita → realizado → finalizar visita → cobro → factura, contra API y PostgreSQL reales. `jornada-real` comprueba la entrega doctor/recepción; `records-real` verifica consulta, permisos y exportación.
- Navegador local: deuda anterior 50 € + visita 140 € + cortesía 0 €, cobro parcial 100 €, salida resuelta y saldo 90 € persistente. Revisión a 1366×768, 1440×900, 1920×1080 y 1366×580.
- Cobro posterior de los 90 € restantes, recibo sin factura y apertura desde Registros; emisión posterior de 190 € sin alterar el saldo cero. El historial mantiene los actos realizados aunque tengan el estado económico heredado «facturado» y cada pago aparece una sola vez, incluso aplicado a varias facturas.
- Historial agrupado y desagrupado, sesiones de varios profesionales, aplicaciones exactas y saldos inmutables de pagos posteriores; las instantáneas económicas respetan el ámbito de clínica. Los enlaces abren tratamientos, pagos y visitas originales.
- Historial sintético de 65 tratamientos: paginación, búsqueda de una nota fuera de la página visible, detalle con teclado y acceso al final a las cuatro resoluciones anteriores, sin desbordamiento horizontal.
