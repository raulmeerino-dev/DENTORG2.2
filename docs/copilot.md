# Asistente operativo

El acceso global es el icono de destellos de la cabecera, junto a En sala; también está en el menú de usuario y en Ctrl/⌘ + Espacio. Está disponible para personal autenticado, no en el portal de pacientes ni en el login. El encabezado muestra el paciente activo. El texto y la voz del navegador llegan al mismo orquestador de herramientas; la voz añade texto al borrador, sin sustituir lo escrito ni enviarlo automáticamente. Para grabaciones clínicas se utiliza el [editor de dictado](funciones/dictado-clinico-ia.md).

Las consultas pueden detenerse y reintentarse. Una respuesta tardía a una consulta cerrada no navega ni altera la interfaz. Durante una confirmación se mantiene abierto el resultado hasta verificarlo; los reintentos utilizan el mismo identificador y no duplican el cambio. Los resúmenes clínicos incorporan las seis últimas notas revisadas, con fecha, profesional, origen y enlace al historial; los textos largos se identifican como extractos, no como el historial completo.

## Arquitectura

`ai/application/copilot.py` dirige un bucle acotado de llamadas nativas a herramientas. `copilot_provider.py` adapta Ollama y OpenAI Responses; no hay interpretación simulada ni rescate mediante palabras clave cuando falla el modelo. `LLM_PROVIDER=auto` usa OpenAI cuando está configurada su clave y Ollama en caso contrario. El modelo y endpoint siguen la configuración existente. Responses usa `store=false` y conserva los elementos necesarios para continuar llamadas a herramientas, incluido el contexto de razonamiento cifrado ([documentación oficial](https://developers.openai.com/api/docs/guides/migrate-to-responses)).

Las herramientas usan servicios de dominio, schemas Pydantic estrictos y permisos de servidor. El contexto visible identifica paciente, sección, cita y fecha; el servidor valida el paciente y la clínica antes de enviarlo al modelo. Los identificadores de herramientas deben proceder de este contexto o de una consulta autorizada. No se permite SQL, código ni HTTP arbitrarios.

Consultas y navegación se ejecutan directamente. Citas, estados de visita, notas, tratamientos realizados, presupuestos y cobros preparan una revisión con datos reales. El botón de confirmación ejecuta el plan en una transacción que incluye el recibo idempotente. Se vuelven a validar permisos, paciente, estado de cita y precios/saldo pertinentes. Un fallo revierte todos los pasos. Repetir una confirmación devuelve el resultado anterior.

Las conversaciones se guardan cifradas y caducan a los 30 minutos. El siguiente acceso purga el contenido caducado; los eventos de auditoría no guardan prompts ni contenido clínico en claro. La migración 0048 añade una tabla y la conserva durante un rollback de aplicación; volver a subir la revisión es idempotente. Una propuesta caducada exige prepararla de nuevo.

## Capacidades y límites

- Búsqueda de pacientes/profesionales/catálogo; navegación; agenda y huecos; resumen clínico con fuentes; consultas de Registros; saldos según rol.
- Propuestas confirmables de cita/reprogramación/cancelación, llegada/atención/fin de visita, notas, tratamiento realizado, presupuesto y cobro de factura existente.
- Prescripciones, consentimientos, firma, emisión/rectificación de factura y flujos no cubiertos por herramientas se continúan en su editor profesional. El modelo no inventa una ejecución ni toma decisiones clínicas.
- La comprensión depende del modelo configurado. Las pruebas con Ollama local son evaluaciones de ejemplos, no una garantía de comprensión universal. Fallos o timeouts dejan la aplicación manual disponible.
- El dictado del navegador requiere soporte y permiso de micrófono; no existe escucha permanente. La compatibilidad física con cada micrófono debe verificarse en el dispositivo de uso.

## Validación

`tests/test_copilot.py` usa PostgreSQL y servicios reales con inferencia sustituida para comprobar autorización, aislamiento, confirmación/cancelación, reintentos, caducidad, precios cambiados, importe cero y rollback multietapa. `test_copilot_provider.py` comprueba transporte y continuidad de Responses. `Copilot.test.tsx` comprueba contexto, revisión y reintentos de interfaz. La evaluación con modelo real se hace aparte sobre datos sintéticos y nunca se presenta como cubierta por estos dobles de inferencia.
