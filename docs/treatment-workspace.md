# Tratamientos del paciente

Tratamientos reúne Diagnóstico/Primera visita, Presupuestos, Pendientes, Sesión actual y Visitas. El presupuesto ocupa una sección propia del workspace y mantiene el contexto del paciente. Las alternativas se duplican como borradores independientes.

Las propuestas del odontograma de presupuesto se guardan en sus líneas y snapshot; no modifican el diagnóstico real. El adaptador distingue el identificador visual, el tratamiento del catálogo y la línea persistida. La aceptación parcial crea solamente los pendientes seleccionados. Las líneas aceptadas/materializadas no se editan o borran como si fueran borradores.

La selección de presupuesto se conserva en la URL al cambiar, duplicar y refrescar. No se permite rechazar todo un presupuesto parcialmente aceptado ni devolverlo a presentado dejando trabajo activo con un estado contradictorio. Las alternativas mantienen el original y su trazabilidad.

Sesión actual permite registrar un tratamiento realizado sin presupuesto previo: catálogo, profesional, fecha/cita, pieza/caras, observaciones e importe real, incluso cero. Seleccionar una pieza no registra un acto. El registro requiere una acción explícita. La cita se propone solo cuando el contexto del día y profesional es inequívoco.

El acto finalizado actualiza el historial y la información odontológica. Un reintento del mismo elemento de sesión o trabajo realizado no reescribe ni duplica el acto. Facturación utiliza el importe registrado, no el precio vigente del catálogo. Registrar el tratamiento no emite una factura.

Las unidades clínicas continúan representadas por líneas/actos separados, con su pieza y trazabilidad. No se agrupan varias actuaciones clínicas bajo una cantidad económica que impida identificar lo realizado.
