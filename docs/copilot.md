# Asistente operativo

El acceso global es el icono de destellos de la cabecera, junto a En sala; también está en el menú de usuario y en Ctrl/⌘ + Espacio. Está disponible para personal autenticado, no en el portal de pacientes ni en el login. El encabezado muestra el paciente activo. El texto y la voz del navegador llegan al mismo orquestador de herramientas; la voz añade texto al borrador, sin sustituir lo escrito ni enviarlo automáticamente. Para grabaciones clínicas se utiliza el [editor de dictado](funciones/dictado-clinico-ia.md).

Las consultas pueden detenerse y reintentarse. Una respuesta tardía a una consulta cerrada no navega ni altera la interfaz. Durante una confirmación se mantiene abierto el resultado hasta verificarlo; los reintentos utilizan el mismo identificador y no duplican el cambio. Los resúmenes clínicos incorporan las seis últimas notas revisadas, con fecha, profesional, origen y enlace al historial; los textos largos se identifican como extractos, no como el historial completo.

Las respuestas a consultas permanecen en el chat. Si el modelo también propone una vista relacionada, se ofrece como enlace para evitar que la navegación cierre y oculte la respuesta. Las peticiones de abrir una pantalla mantienen la navegación directa; las navegaciones ligadas a un guardado siguen esperando su confirmación.

Una consulta detenida libera inmediatamente el editor y cancela la inferencia y la transacción de lectura/preparación del servidor. El límite de 90 segundos incluye las esperas de base de datos. Las confirmaciones de escritura conservan su transacción y recibo aunque se pierda la conexión. La interfaz muestra el tiempo de espera y permite detener sin que una respuesta antigua afecte a la siguiente petición.

Una nota confirmada sin cita se muestra entre las notas de hoy en Sesión y su enlace abre ese contexto. No crea una visita ficticia ni una fila de tratamiento en el historial. Las notas vinculadas a una cita conservan el acceso a su visita.

## Arquitectura

El modelo comienza cada petición con búsqueda de pacientes, profesionales, navegación y descubrimiento de capacidades. En Jornada y Agenda también dispone directamente de `get_schedule`, una lectura frecuente que evita una ronda de descubrimiento. `discover_tools` activa los demás grupos necesarios y permitidos durante ese turno. La selección la hace el LLM mediante una llamada nativa, sin clasificador por palabras ni respuesta simulada. `copilot_workspace.py` comparte destinos reales con la navegación y obtiene las vistas/estados de Registros desde su catálogo canónico filtrado por rol.

La conversación continúa al navegar. Al cambiar de paciente se detienen consultas pendientes y se retiran los borradores anteriores; el siguiente turno utiliza el contexto visible validado. Se recuerdan hasta ocho referencias ordenadas por tipo (pacientes, profesionales, tratamientos y citas), sin repetir los informes clínicos completos. Nombres ambiguos siguen exigiendo selección; importes y disponibilidad se vuelven a consultar. El profesional propio procede de la cuenta del servidor.

Las notas dictadas usan contenido extractivo: además del prompt, un control previo rechaza palabras no aportadas en el dictado o sus correcciones recientes. Esto limita ampliaciones inventadas, pero **no verifica el significado clínico ni sustituye la revisión profesional**, que sigue siendo obligatoria. Si una petición combina guardar y abrir una vista, la navegación espera a que se confirme y termine correctamente el guardado.

`ai/application/copilot.py` dirige un bucle acotado de llamadas nativas a herramientas. `copilot_provider.py` adapta Ollama y OpenAI Responses; no hay interpretación simulada ni rescate mediante palabras clave cuando falla el modelo. `LLM_PROVIDER=auto` usa OpenAI cuando está configurada su clave y Ollama en caso contrario. El modelo y endpoint siguen la configuración existente. Responses usa `store=false` y conserva los elementos necesarios para continuar llamadas a herramientas, incluido el contexto de razonamiento cifrado ([documentación oficial](https://developers.openai.com/api/docs/guides/migrate-to-responses)).

Las herramientas usan servicios de dominio, schemas Pydantic estrictos y permisos de servidor. El contexto visible identifica paciente, sección, cita y fecha; el servidor valida el paciente y la clínica antes de enviarlo al modelo. Los identificadores de herramientas deben proceder de este contexto o de una consulta autorizada. No se permite SQL, código ni HTTP arbitrarios.

Consultas y navegación se ejecutan directamente. Citas, estados de visita, notas, tratamientos realizados, presupuestos y cobros preparan una revisión con datos reales. El botón de confirmación ejecuta el plan en una transacción que incluye el recibo idempotente. Se vuelven a validar permisos, paciente, estado de cita y precios/saldo pertinentes. Un fallo revierte todos los pasos. Repetir una confirmación devuelve el resultado anterior.

Las conversaciones se guardan cifradas y caducan a los 30 minutos. El siguiente acceso purga el contenido caducado; los eventos de auditoría no guardan prompts ni contenido clínico en claro. La migración 0048 añade una tabla y la conserva durante un rollback de aplicación; volver a subir la revisión es idempotente. Una propuesta caducada exige prepararla de nuevo.

El contexto conserva las tres últimas intervenciones de diálogo; los resultados completos de herramientas antiguas se vuelven a consultar cuando hacen falta. La agenda devuelve totales de todo el rango y, cuando se pide detalle, una muestra explícita de ocho citas con nombres y horas de la clínica. Para contar, `include_details=false` omite ese detalle y conserva los mismos totales calculados por el servicio, reduciendo la espera y los datos enviados al modelo. Las fechas sin hora representan días completos para las consultas; reservar una cita sigue exigiendo una hora explícita. «Hoy» se calcula desde el reloj de la clínica, independientemente del día abierto en Agenda.

### Ollama local

El modelo local predeterminado es `qwen3.5:4b`, con `OLLAMA_THINKING=false`, usando el [control documentado de Ollama](https://docs.ollama.com/capabilities/thinking). Debe estar instalado (`ollama pull qwen3.5:4b`). En la prueba local con RTX 3060 Laptop de 6 GB se comparó con Qwen 2.5 7B y Qwen 3 4B; se eligió junto con la selección gradual de herramientas, no sólo por velocidad. El modelo de Codex CLI sigue siendo independiente. No hay cambio automático de proveedor ni envío a servicios externos.

`OLLAMA_CONTEXT_LENGTH` (16384 por defecto) reserva espacio para política, herramientas y resultados; reducirlo demasiado puede hacer que Ollama trunque instrucciones. `OLLAMA_MAX_OUTPUT_TOKENS` (768 por defecto) acota cada generación; las respuestas truncadas se rechazan antes de preparar acciones. Los límites de inferencia no garantizan una latencia concreta: depende del hardware, la carga y el modelo.

`OLLAMA_PRELOAD=true` precarga el modelo seleccionado en segundo plano al arrancar el backend, sólo si el proveedor efectivo es Ollama. Se envía una petición vacía con el mismo contexto de inferencia; no se leen ni envían pacientes. Un fallo no impide usar DentCore y el trabajo pendiente se cancela al apagar el backend. `OLLAMA_KEEP_ALIVE=24h` conserva el modelo entre consultas, reservando su memoria GPU; puede reducirse o desactivarse la precarga en equipos compartidos. La reserva es un plazo de inactividad, no una garantía frente a reinicios o presión de memoria. Ver [mediciones y comparación de modelos](ai-latency-validation.md).

## Capacidades y límites

- Búsqueda de pacientes/profesionales/catálogo; navegación; agenda y huecos; resumen clínico con fuentes; consultas de Registros; saldos según rol.
- Propuestas confirmables de cita/reprogramación/cancelación, llegada/atención/fin de visita, notas, tratamiento realizado, presupuesto y cobro de factura existente.
- Prescripciones, consentimientos, firma, emisión/rectificación de factura y flujos no cubiertos por herramientas se continúan en su editor profesional. El modelo no inventa una ejecución ni toma decisiones clínicas.
- La comprensión depende del modelo configurado. Las pruebas con Ollama local son evaluaciones de ejemplos, no una garantía de comprensión universal. Fallos o timeouts dejan la aplicación manual disponible.
- El dictado del navegador requiere soporte y permiso de micrófono; no existe escucha permanente. La compatibilidad física con cada micrófono debe verificarse en el dispositivo de uso.

## Validación

`tests/test_copilot.py` usa PostgreSQL y servicios reales con inferencia sustituida para comprobar autorización, aislamiento, confirmación/cancelación, reintentos, caducidad, precios cambiados, importe cero y rollback multietapa. `test_copilot_provider.py` comprueba transporte y continuidad de Responses. `Copilot.test.tsx` comprueba contexto, revisión y reintentos de interfaz. La evaluación con modelo real se hace aparte sobre datos sintéticos y nunca se presenta como cubierta por estos dobles de inferencia.

Revisión local del 29/09/2026: API, web y Ollama estaban activos. La primera consulta con `qwen3.5:4b` respondió en unos 14 segundos incluyendo la carga del modelo. Se reprodujo una consulta de citas cuya respuesta quedaba oculta por navegación automática; se corrigió conservando la respuesta y ofreciendo la vista relacionada como fuente. Pasaron 35 pruebas de backend del copiloto y 8 de interfaz, además de Ruff. En navegador real se verificaron respuesta, navegación directa y consulta de agenda con la respuesta visible.

Incidencia de exactitud pendiente de esta revisión: ante una consulta del total general de facturas pendientes, el modelo sumó tres filas de una página parcial y las presentó como total. `search_records` ofrece el recuento de la consulta y hasta ocho filas, pero no un agregado económico global. Esa respuesta no se considera validada ni está resuelta por la corrección de navegación; requiere mejorar el alcance de los datos y la comprobación de totales antes de confiar en resúmenes económicos globales del asistente.
