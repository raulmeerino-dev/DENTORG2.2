# Latencia de IA en el portátil local — 29/09/2026

## Equipo y configuración

- Intel Core i7-12700H: 14 núcleos y 20 procesadores lógicos.
- 32 GB de RAM (31,7 GB detectados), unos 12,8 GB libres al comenzar.
- NVIDIA RTX 3060 Laptop con 6144 MiB de VRAM; SSD Micron de 1 TB; plan de alto rendimiento.
- Ollama 0.34.4. Modelo de DentCore: `qwen3.5:4b`, 100 % GPU, contexto 16384, razonamiento desactivado y límite de salida 768 tokens.

No se cambió de proveedor ni se enviaron datos de pacientes a servicios externos. Se descargó el modelo oficial `qwen3.5:2b` para compararlo; el modelo activo sigue siendo 4B.

## Medición de DentCore completo

Peticiones HTTP reales a `/api/assistant/turn`, autenticadas contra el runtime local de prueba (datos sintéticos), sin confirmar escrituras. Cada caso utilizó una conversación nueva. Se mantuvieron iguales los textos y la fecha seleccionada. Dos recorridos por saludo, navegación y consulta de citas; no es una prueba de carga ni un percentil de producción.

| Caso | Antes: primer / segundo recorrido | Después: primer / segundo recorrido |
| --- | --- | --- |
| Saludo de una frase | 2,54 / 0,95 s | 2,55 / 0,73 s |
| Abrir Agenda de mañana | 1,23 / 1,21 s | 1,23 / 1,23 s |
| Cuántas citas hay hoy | 5,57 / 3,56 s | 2,42 / 2,38 s |

El modelo estaba cargado en ambos recorridos completos. El primer saludo incluye el procesamiento inicial del prompt, aunque el modelo ya esté en memoria. La mejora de la consulta de citas fue aproximadamente 57 % en el primer recorrido y 33 % en el segundo. Las pequeñas variaciones de saludo no se atribuyen a una mejora garantizada.

La tabla anterior corresponde a la primera optimización (precarga y lectura directa). Se añadió después la opción de omitir detalles cuando sólo se piden contadores, y se midió también la agenda densa:

| Verificación final | Primera petición | Repetición |
| --- | --- | --- |
| Contar las 91 citas del 26/09, antes de omitir detalles | 4,07 s | 3,87 s |
| Contar las mismas 91 citas, sin detalles | 4,93 s | 2,79 s |
| Saludo, con caché caliente tras la consulta anterior | 0,78 s | 0,76 s |
| Abrir Agenda de mañana, con caché caliente | 1,26 s | 1,27 s |
| Contar las citas de hoy, con caché caliente | 2,69 s | 2,66 s |

La primera consulta densa tras cambiar el prompt/schema necesitó procesar su prefijo nuevo: 4,93 segundos incluso con el modelo cargado. No se oculta ese coste ni se presenta como una respuesta instantánea. En la repetición, omitir el detalle redujo aproximadamente un 28 % el tiempo de esa agenda densa y mantuvo el total correcto de 91 citas. En una agenda vacía, añadir el argumento de detalle puede costar algunas décimas; el beneficio aparece al evitar registros que no se necesitan.

La respuesta anterior de unos 14 segundos incluía cargar el modelo y generar una explicación más larga; no es comparable directamente con un saludo de una frase. En ensayos controlados de saludo corto desde modelo descargado se midieron 5,7–7,1 segundos para 4B, de los cuales 3,7–4,9 segundos fueron carga. Precargar evita trasladar ese coste al primer usuario si la carga ya ha terminado, pero no elimina el procesamiento de instrucciones ni la generación.

## Comparación controlada de modelos

Inferencia real en Ollama con la política y los schemas de DentCore. Las herramientas devolvieron datos sintéticos fijos: fecha actual 29/09, fecha seleccionada 26/09 y 12 citas. No se ejecutaron servicios clínicos ni escrituras. Tiempos del segundo recorrido con caché caliente; no incluyen el backend ni el navegador.

| Modelo | Saludo | Abrir mañana | Consultar citas | Observaciones |
| --- | --- | --- | --- | --- |
| Qwen 3.5 4B, flujo anterior | 0,60 s | 0,98 s | 2,77 s | Tres llamadas para consultar citas; 100 % GPU |
| Qwen 3 4B instruct | 0,51 s | 1,40 s | 5,45 s | Parte en CPU; no mejora la consulta operativa |
| Qwen 2.5 7B instruct | 1,07 s | 2,24 s | No válida | Se equivocó de fecha y no ejecutó la consulta de citas; 27 % CPU / 73 % GPU |
| Qwen 3.5 4B, lectura directa | 0,56 s | 1,10 s | 2,42 s | Dos llamadas para consultar citas; unos 3,54 GB reservados |
| Qwen 3.5 2B, lectura directa | 0,38 s | 0,74 s | 1,32 s | Dos llamadas; 100 % GPU; unos 2,58 GB reservados |

2B respondió correctamente a los tres escenarios simples repetidos, pero esta muestra no valida notas clínicas, planes, importes, instrucciones ambiguas o tareas largas. Se conserva 4B hasta disponer de una evaluación funcional más amplia de 2B. La incidencia conocida de totales económicos de Registros sigue pendiente; estas mejoras de latencia no la corrigen.

Para repetir la comparación sin datos clínicos, desde `backend`:

```powershell
./.venv/Scripts/python.exe scripts/benchmark_copilot_latency.py --models qwen3.5:4b qwen3.5:2b --ready
```

Los modelos indicados deben estar instalados. El ensayo descarga de memoria cada modelo para medir su primera petición, cambia temporalmente qué modelo ocupa la GPU y al acabar precarga 4B. Ejecutarlo cuando no haya consultas en curso. Los resultados se añaden a `output/qa/ai-latency-benchmark.jsonl`, ignorado por Git. Sin `--ready` se mide el coste de descubrir las herramientas antes de consultar.

## Mejoras aplicadas

1. Precarga local asíncrona al iniciar el backend, con petición vacía y el contexto correcto. No bloquea el arranque; un proveedor caído no impide usar la clínica.
2. `OLLAMA_KEEP_ALIVE=24h` en las llamadas y en la precarga. Sustituye la descarga tras diez minutos de inactividad y reserva la memoria del modelo durante la jornada. Es configurable.
3. `get_schedule` disponible desde la primera llamada en Jornada y Agenda. Mantiene el filtro de permisos y la selección progresiva del resto de herramientas; no es un clasificador por palabras. Las escrituras conservan revisión y confirmación.
4. `include_details=false` para consultas de contadores de citas. Se mantiene el cálculo sobre todo el rango; se omiten nombres, horas e identificadores de la muestra cuando no se solicitan. El detalle existente sigue disponible y es el comportamiento por defecto del contrato.

Validación: 44 pruebas del copiloto, proveedor, ciclo de vida, memoria, integridad y precarga aprobadas; Ruff correcto. Se verificó el servicio real con el modelo cargado al 100 % en GPU y caducidad de 24 horas.

## Decisión

No hace falta cambiar de ordenador para estas tareas. Mantener 4B optimizado ofrece respuestas breves cercanas a un segundo y consultas de contadores alrededor de 2,7–2,8 segundos con caché caliente en la verificación final. 2B es candidato para priorizar velocidad después de validar los flujos delicados. 7B/14B no son la vía adecuada para acelerar este portátil de 6 GB de VRAM; no se ejecutó el de 14B.

Para reducir la espera percibida de respuestas largas, el siguiente cambio sería streaming de texto y progreso real de herramientas. Eso permite ver el inicio de una respuesta, pero no equivale a tener un resultado completo verificado en menos de un segundo. Una API externa necesitaría medición propia, coste y revisión del tratamiento de datos; no se ha configurado ni probado.

Referencias oficiales: [precarga, residencia y GPU en Ollama](https://docs.ollama.com/faq), [métricas y streaming de la API](https://docs.ollama.com/api/chat), [Qwen 3.5 2B](https://ollama.com/library/qwen3.5:2b).
