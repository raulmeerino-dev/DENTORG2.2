# Dictado clinico por IA

## Alcance de esta fase

La fase 1 permite que un doctor o admin grabe audio desde la ficha del paciente o desde la sesion clinica, envie la grabacion al backend, reciba una transcripcion, la revise en un campo editable y la guarde como nota clinica del paciente.

Flujo implementado:

1. Grabar audio en el navegador con `MediaRecorder`.
2. Enviar el blob al backend.
3. Transcribir mediante un proveedor configurado.
4. Mostrar la transcripcion editable.
5. Guardar el texto revisado como nota clinica con origen `dictado_clinico`.

## Fuera de alcance

Esta fase no:

- Detecta piezas dentales.
- Detecta tratamientos.
- Propone presupuestos.
- Crea tratamientos, sesiones, facturas ni acciones clinicas.
- Modifica datos del paciente automaticamente.
- Conserva audio por defecto.

La IA solo produce texto. El doctor siempre revisa y confirma antes de guardar.

## Endpoints

- `POST /api/dictado/pacientes/{paciente_id}/transcribir`
  - Recibe `multipart/form-data` con `audio`, `duracion_segundos` y `contexto`.
  - Valida rol, clinica, paciente, formato, tamano y duracion declarada.
  - Devuelve `dictado_id` y `transcripcion`.
  - No guarda nota clinica.

- `POST /api/dictado/pacientes/{paciente_id}/guardar-nota`
  - Recibe `dictado_id` opcional y `texto`.
  - Guarda el texto revisado como nota clinica general.
  - Marca el dictado como `guardado` si se informa `dictado_id`.

## Configuracion

Variables de entorno:

- `CLINICAL_DICTATION_PROVIDER`
  - Vacio por defecto.
  - Valor soportado ahora: `external_http`.

- `CLINICAL_DICTATION_ENDPOINT`
  - URL del proveedor externo cuando `CLINICAL_DICTATION_PROVIDER=external_http`.

- `CLINICAL_DICTATION_API_KEY`
  - Token del proveedor externo.
  - Nunca se expone al frontend.

- `CLINICAL_DICTATION_TIMEOUT_SECONDS`
  - Por defecto `45`.

- `CLINICAL_DICTATION_MAX_AUDIO_MB`
  - Por defecto `15`.

- `CLINICAL_DICTATION_MAX_DURATION_SECONDS`
  - Por defecto `180`.

- `CLINICAL_DICTATION_ALLOWED_MIME_TYPES`
  - Por defecto `audio/webm,audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/m4a`.

- `CLINICAL_DICTATION_KEEP_AUDIO`
  - Por defecto `false`.
  - El backend no persiste audio en esta fase.

Si no hay proveedor configurado, el backend responde con `Servicio de transcripcion no configurado`.

## Seguridad y privacidad

- Solo `doctor` y `admin` pueden dictar o guardar notas dictadas.
- El backend valida `clinica_id` del paciente.
- Recepcion y paciente no pueden dictar notas clinicas.
- El audio se trata como dato sensible.
- El audio no se publica por URL.
- El audio no se conserva por defecto.
- La auditoria registra eventos y metadatos, no el texto clinico completo.

Eventos auditados:

- `DICTADO_TRANSCRIPCION_SOLICITADA`
- `DICTADO_TRANSCRIPCION_COMPLETADA`
- `DICTADO_TRANSCRIPCION_ERROR`
- `DICTADO_NOTA_GUARDADA`

## Prueba manual

1. Entrar como doctor o admin.
2. Abrir un paciente.
3. En ficha, pulsar `Dictar nota`.
4. Permitir microfono.
5. Grabar menos de 3 minutos.
6. Detener.
7. Revisar la transcripcion.
8. Guardar como nota clinica.
9. Abrir historial completo y comprobar que aparece como `Dictado clinico`.
10. Repetir desde `Clinica > Sesion actual > Dictar nota de sesion`.

## Riesgos pendientes

- La duracion se limita en frontend y se valida por valor declarado en backend; una fase posterior puede extraer duracion real del contenedor de audio.
- Falta seleccionar proveedor definitivo para produccion.
- Fase 2 puede anadir extraccion de intenciones, piezas y tratamientos, siempre con confirmacion humana.
