# Diagnóstico del paciente

Diagnóstico permanece dentro de Clínica y abre la relación de valoraciones del paciente. La valoración inicial se inicia explícitamente y se identifica como **Primera visita**; las posteriores usan **Valoración clínica**. Consultar, abrir el odontograma o navegar no registra valoraciones ni crea actividad económica.

El formulario reutiliza los campos existentes en tres secciones: valoración y observaciones, exploración/odontograma, conclusiones y plan clínico. El odontograma se monta bajo demanda. Al consultar una valoración guardada se muestra en lectura y se indica que representa las piezas actuales, no una captura histórica de esa valoración.

## Datos y trazabilidad

- La primera visita existente permanece en `datos_salud.primera_visita`, dentro del almacenamiento cifrado del paciente. Se leen también registros antiguos sin identificador ni metadatos adicionales.
- Las valoraciones posteriores se añaden a `datos_salud.valoraciones`; no sustituyen ni duplican la primera visita. Los registros guardados se consultan sin edición; las nuevas observaciones se registran como valoraciones posteriores.
- El comando tipado `POST /api/tratamientos/pacientes/{paciente_id}/valoraciones` reutiliza acceso clínico, aislamiento por clínica, cifrado, revisión optimista y auditoría existentes. Conserva las demás claves de salud y las relaciones legacy. No requiere migración de tablas.
- El identificador del borrador evita duplicados al reintentar un guardado cuya respuesta se perdió. Una revisión desactualizada produce conflicto y conserva el borrador; la ficha se actualiza para permitir su revisión explícita.
- El registro añade auditoría con ID y tipo; no crea filas de tratamientos realizados, visitas, presupuestos, cargos, facturas ni historial clínico-económico.

## Navegación y borradores

`tab=primera` se conserva por compatibilidad y `tab=diagnostico` abre el mismo workspace. `valoracion_id=inicial` o el ID de una valoración permite consultar directamente el registro y recargarlo. Las pestañas habituales y la identidad del paciente permanecen visibles; el único retorno del detalle es **Volver a diagnóstico**.

Se reutiliza `useSessionDraft`: memoria de la pestaña, aislada por usuario/clínica/paciente, con caducidad de 30 minutos y limpieza al cerrar sesión. Conserva texto, fecha y revisión de origen al cambiar de sección o paciente. No guarda automáticamente en servidor ni en almacenamiento persistente del navegador. Antes de recargar/cerrar hay que guardar; se informa en el formulario. Una operación que termina después de salir de Diagnóstico actualiza los datos sin cambiar la navegación actual.

## Validación

Chrome contra API y PostgreSQL locales, con el paciente sintético UIQA: entrada sin valoración, registro inicial fechado el 15-01-2026, borrador conservado al alternar Pendientes y Presupuestos, abrir/cerrar odontograma, registro posterior del 29-09-2026, consulta y recarga de la inicial conservando sus notas, y acceso directo con ambos alias. Los contadores siguen en 0 citas, 2 presupuestos, 0 pendientes, 60 realizados y 0 facturas. Se comprobó el detalle a 1024 px sin desbordamiento y se restauró el viewport normal. Capturas locales en `tmp/screenshots/diagnostico/`.

Tests de backend en `dentcore_diagnosis_test`, base distinta del runtime: conservación literal de la primera visita y claves de salud, anexado, reintentos, conflictos de revisión, validación del contrato, permisos por rol, aislamiento por clínica y ausencia de efectos en citas, presupuestos, historial, cargos y facturas. Tests frontend de navegación, enlaces directos, consulta, borradores, fecha, conflictos, guardado posterior y salida mientras guarda. Comprobaciones de build/TypeScript, ESLint y Ruff.

Resultado: 60 tests frontend (7 archivos) y 3 tests de integración backend aprobados; TypeScript/build, ESLint, Ruff y `git diff --check` correctos.
