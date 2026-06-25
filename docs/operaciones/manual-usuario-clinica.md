# Manual de usuario de clinica - borrador inicial

## Inicio de sesion

Cada usuario debe entrar con su cuenta nominal. Los administradores deben activar 2FA antes de produccion. No se deben compartir usuarios.

## Flujo principal

1. Buscar o crear paciente.
2. Revisar ficha, alertas, saldo y proxima cita.
3. Registrar primera visita y diagnostico.
4. Usar odontograma contextual.
5. Crear presupuesto.
6. Aceptar presupuesto y pasarlo a trabajo pendiente.
7. Citar al paciente.
8. Registrar laboratorio si procede.
9. Marcar tratamiento realizado.
10. Emitir factura y registrar cobro.
11. Revisar historial completo.

## Documentos y consentimientos

- Subir solo documentos necesarios para la asistencia.
- Usar categorias correctas.
- Firmar consentimientos antes de tratamientos que lo requieran.
- Revocar consentimientos con motivo.
- Los documentos no se borran fisicamente desde uso normal; se dan de baja logicamente.

## Facturacion y caja

- Revisar paciente, concepto, serie y total antes de emitir.
- Usar anulacion/rectificacion cuando corresponda.
- Registrar cobros con forma de pago correcta.
- Revisar deuda del paciente antes de cerrar visita.

## Portal paciente

- Solo activar usuarios paciente vinculados a una ficha.
- No compartir enlaces o credenciales.
- El paciente puede ver su portal, citas, documentos y consentimientos permitidos.

## Implementado

- Flujos de paciente, tratamientos, agenda, documentos, consentimientos, facturas, cobros, laboratorio, caja y admin.

## Pendiente tecnico

- Manual visual con capturas.
- Matriz de permisos por rol en la UI.
- Formacion guiada de primera visita y cierre de cita.

## Pendiente de configuracion

- Usuarios nominales.
- Clinicas, doctores, horarios, formas de pago y datos fiscales.
- Plantillas de consentimiento revisadas.

## Pendiente de validacion externa

- Textos clinicos de consentimientos.
- Procedimientos internos de la clinica.
- Uso fiscal correcto.

## Riesgo si se lanza sin resolver

- Errores operativos por usuarios sin formacion.
- Consentimientos o facturas emitidos con datos incompletos.
