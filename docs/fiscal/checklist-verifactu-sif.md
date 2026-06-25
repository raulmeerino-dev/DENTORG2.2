# Checklist VERI*FACTU/SIF - borrador tecnico

No es certificacion fiscal. Debe revisarlo un asesor especializado antes de cobrar a clinicas reales.

## Implementado

- Registros de facturacion encadenados.
- Eventos SIF encadenados.
- Declaracion responsable parametrizada desde settings.
- Export JSON de cumplimiento SIF.
- Estados de remision.
- Preflight fiscal con checks de modo, NIF placeholder, registros RF y eventos SIF.

## Pendiente tecnico

- Validacion contra especificacion final aplicable y entorno AEAT si corresponde.
- Pruebas de anulacion, rectificacion, remision y rechazo.
- Sellado/versionado final de la declaracion responsable por release.
- Evidencia automatizada de inalterabilidad tras cierre/emision.

## Pendiente de configuracion

- `VERIFACTU_MODE=verifactu`.
- `SIF_CODIGO`, `SIF_VERSION`, productor y NIF reales.
- Datos fiscales reales del emisor.
- Certificados o credenciales de remision si aplica.

## Pendiente de validacion externa

- Interpretacion fiscal de modalidad SIF.
- Contenido de QR, huella, serie/secuencia y anulaciones.
- Contrato/obligaciones si DentOrg2 actua como proveedor SIF.

## Riesgo si se lanza sin resolver

- Facturacion comercial no defendible ante requisitos VERI*FACTU/SIF.
- Necesidad de migrar o rectificar facturas emitidas con configuracion de prueba.
