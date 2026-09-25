# Dictado clínico

Doctor y administración pueden grabar o subir un audio, escucharlo, pulsar **Transcribir audio**, revisar el texto y guardar la nota. La transcripción no crea tratamientos, presupuestos ni decisiones clínicas. También se puede escribir directamente sin micrófono ni proveedor de IA.

Desde **Sesión actual → Dictar nota de sesión**, la nota se vincula a la visita actual cuando existe una cita inequívoca. En otro caso se guarda como nota del paciente para ese día, indicándolo en el editor. Se muestra en **Notas de sesión** y permanece en el historial. El texto puede editarse posteriormente desde la sesión; cada revisión conserva el texto original de transcripción y una revisión cifrada del antes/después. Una edición concurrente devuelve conflicto en lugar de sobrescribir cambios ajenos.

El audio permanece en memoria del navegador durante la edición, con reproducción y descarga. Un error de transcripción permite reintentar sin perderlo ni perder el texto escrito. No se archiva el audio en el servidor. Cerrar con contenido pendiente requiere descartarlo expresamente; no se guarda automáticamente. Los reintentos de guardado reutilizan el identificador de dictado o de petición para evitar notas duplicadas.

## Transcripción local

Instalar en el entorno del backend, bajo el mismo usuario que ejecutará el servicio:

```sh
pip install -e ".[transcription]"
python -m scripts.prepare_dictation_model
```

Configurar y reiniciar el backend:

```dotenv
CLINICAL_DICTATION_PROVIDER=local_whisper
CLINICAL_DICTATION_LOCAL_MODEL=small
CLINICAL_DICTATION_LOCAL_THREADS=4
```

La preparación descarga explícitamente el modelo una vez. El servidor exige que esté ya disponible; nunca descarga modelos al recibir un audio clínico. Puede usarse una ruta local como modelo. El proveedor usa [Faster Whisper](https://github.com/SYSTRAN/faster-whisper), CPU int8, español y detección de voz, sin competir por la GPU del asistente. Durante la transcripción local no se envía audio a un servicio externo. Cada instalación debe provisionar su modelo: subir el código a GitHub no instala modelos en otros equipos.

Se admite una transcripción simultánea por proceso; una segunda solicitud recibe un error recuperable. Se comprueba la duración real del audio antes de recorrer la transcripción. Silencio, audio ilegible o modelo ausente producen un error visible, nunca texto simulado.

## Proveedor externo existente

`CLINICAL_DICTATION_PROVIDER=external_http` conserva la integración HTTP. Requiere `CLINICAL_DICTATION_ENDPOINT`; `CLINICAL_DICTATION_API_KEY` es opcional según proveedor y nunca llega al frontend. El audio se envía al endpoint configurado. `CLINICAL_DICTATION_TIMEOUT_SECONDS` vale 45 por defecto. La duración declarada se valida en DentCore; el proveedor externo debe aplicar además sus límites de decodificación.

## Límites y permisos

- Audio: 15 MB y 180 segundos por defecto; WebM, WAV, MP3, MP4/M4A. La grabación se detiene al alcanzar tres minutos y libera el micrófono.
- Texto: máximo 10.000 caracteres. El profesional revisa antes de guardar.
- Backend: roles doctor/admin, paciente y clínica autorizados, cita/historial del mismo paciente, auditoría de solicitudes, errores, guardado y edición. No se amplían permisos de otros roles.
- `CLINICAL_DICTATION_KEEP_AUDIO` es un ajuste heredado sin almacenamiento asociado; la respuesta siempre declara `audio_conservado=false`.

## API

- `POST /api/dictado/pacientes/{id}/transcribir`: multipart `audio`, `duracion_segundos` opcional y contexto validado; devuelve transcripción y `dictado_id`, sin crear nota.
- `POST /api/dictado/pacientes/{id}/guardar-nota`: texto revisado, `dictado_id` o `request_id` opcionales, `cita_id`/`historial_id` opcionales; guarda una nota trazable.
- `PATCH /api/dictado/pacientes/{id}/notas/{nota_id}`: `texto` y `texto_anterior`; limitado a notas de origen dictado, con control de concurrencia y revisión cifrada.

## Validación

Las pruebas cubren proveedor local, audio vacío/silencio/duración, permisos y clínicas, reintentos, relación con visita, edición concurrente y auditoría. En navegador se verifica grabación MediaRecorder con audio sintético, subida de WAV, transcripción real, edición, guardado, recarga y distintas alturas. La precisión depende del audio y debe revisarse, especialmente nombres, piezas, cifras y negaciones.
