# Realtime y concurrencia multiusuario

DentCore mantiene un backend FastAPI y una base PostgreSQL compartidos. Cada
sesión de personal abre un WebSocket en `/api/realtime/ws`; no se abre una conexión
por pantalla. Jornada, sala, notificaciones y checkout dejan de sondear cada 15 s.
La presencia de una ficha abierta no adquiere bloqueos.

## Entrega y recuperación

Las migraciones 0050–0052 añaden una outbox, recibos de operación y revisiones de
fila. Los triggers de dominio escriben en `realtime_events` dentro de la misma
transacción de la mutación, también para escritores SQL y tareas del backend.
PostgreSQL entrega `NOTIFY dentcore_changes` únicamente después del commit.

Cada worker mantiene un `LISTEN` dedicado. El aviso despierta al dispatcher, que
asigna secuencias a eventos ya confirmados bajo un bloqueo advisory muy corto.
Asignar la secuencia después del commit evita perder una transacción lenta cuyo
ID de inserción sea anterior al último evento recibido. No se requiere Redis ni
otro servicio. El recorrido de recuperación del listener se ejecuta cada 30 s
si no llegan avisos; el funcionamiento normal depende de NOTIFY.

El cliente conserva el cursor durante la reconexión, descarta duplicados y usa
backoff de 0,5–30 s. El servidor reproduce hasta 500 eventos; al iniciar una
conexión sin cursor, recuperar una copia anterior de la BD o acumular más eventos,
ordena una resincronización de las familias de queries conocidas. No recarga la
página ni escribe en los borradores. Tras 8 s sin conexión aparece un aviso
discreto; únicamente durante la desconexión se habilita un refetch cada 60 s.

Los mensajes `change` contienen tipo, recurso, identificador, paciente y
profesional. No contienen teléfonos, nombres, textos clínicos, importes ni
documentos. El token se envía en el primer frame, nunca en la URL. Se validan
Origin, caducidad, sesión revocable, usuario activo, clínica y rol. Se conserva
la política HTTP existente de administrador transversal y registros legacy sin
clínica. Las notificaciones de doctor solo llegan a su destinatario y los
eventos clínicos, fiscales y de inventario respetan sus audiencias.

Familias: `patient`, `appointment`, `treatment`, `note`, `budget`, `invoice`,
`payment`, `balance`, `document`, `prescription`, `laboratory`, `odontogram`,
`inventory`, `notification`, `communication`; sufijos `created`, `updated` y
`deleted`. Las transiciones de visita se reflejan como `appointment.updated`.
`shared/realtime/invalidation.ts` relaciona cada familia con queries concretas;
los IDs de paciente evitan invalidar fichas ajenas. La invalidación de un burst
se agrupa en 60 ms. Los clientes vuelven a leer a través de las APIs autorizadas.

## Contrato de escrituras

- Enviar `Idempotency-Key` (8–128 caracteres) para cada operación lógica. Reutilizar
  exactamente esa clave y payload al reintentar; una operación nueva recibe otra.
  Las creaciones sensibles —citas, caja, facturas, anticipos, realizados y comandos
  del asistente— rechazan con 428 la ausencia de clave. Un payload diferente con
  la misma clave devuelve 409.
- Los recibos se identifican por usuario/clave y se cifran con la clave de datos
  existente. Un advisory lock de PostgreSQL serializa reintentos entre workers.
  Los commits de los servicios se convierten en flush dentro de esa petición:
  cambios, eventos y respuesta guardada se confirman juntos, antes de entregar la
  respuesta HTTP. Un timeout después del commit puede recuperar esa respuesta.
  Se mantienen también los IDs y guards propios de checkout y del copiloto.
- Las ediciones protegidas reciben `revision` en la lectura y deben devolverla
  en el payload o en `If-Match`. Falta de revisión: 428; revisión antigua: 409.
  La comprobación alcanza la instancia escrita y el UPDATE usa el versionado de
  SQLAlchemy, cerrando la carrera entre comprobación y escritura. Los triggers
  incrementan la revisión también en escrituras SQL. No se bloquea la ficha al
  leerla. Las notas y los datos administrativos siguen siendo entidades distintas.
- La reserva mantiene los locks transaccionales puntuales de profesional y
  gabinete antes de comprobar disponibilidad. Solo una reserva normal gana el
  mismo hueco. Las urgencias explícitas conservan el solape autorizado y su motivo.

El cliente Axios central conserva la clave de las operaciones cuyo resultado
no se conoce y agrupa envíos simultáneos iguales. Los formularios conservan la
revisión capturada al abrir/editar; una lectura realtime no sustituye esa revisión
ni el texto local. La ficha y la sesión permiten revisar los valores actuales
antes de reaplicar un borrador. El dictado mantiene su comparación existente del
texto anterior y la caja su versión de cuenta.

Las integraciones HTTP deben adoptar estos headers antes de actualizar. Los
uploads y webhooks mantienen sus contratos de dominio; los webhooks WhatsApp
conservan su idempotencia propia. Los recibos no caducan automáticamente: no se
reutiliza una clave antigua para crear una operación nueva. Outbox y recibos se
incluyen en la política de capacidad y copias de seguridad de la base compartida.

## Ejecución y pruebas

Para varios ordenadores, configurar `VITE_API_BASE_URL` con una dirección HTTPS
alcanzable por todos y `FRONTEND_URL` con el origen del frontend. El proxy debe
permitir Upgrade a WebSocket en `/api/realtime/ws` y un timeout superior a 45 s.
No usar `127.0.0.1` como dirección de API en los ordenadores clientes de una LAN.
PostgreSQL permanece accesible únicamente desde el backend.

`backend/tests/test_multiuser.py` usa transacciones y sesiones PostgreSQL
independientes: edición concurrente, teléfono más nota, doble reserva, urgencia,
doble cobro/reintento, rollback, commit tardío y audiencias.

`frontend/e2e/multiuser-real.spec.ts` utiliza dos contextos Chromium independientes
y API real: llegada, cambio en Agenda, borrador clínico, edición obsoleta,
reconexión y clínica ajena. Se activa con `DENTCORE_MULTIUSER_E2E=1`; configurar
`DENTCORE_E2E_URL` y `DENTCORE_E2E_API_URL`. Usar exclusivamente el runtime aislado
descrito en `frontend/e2e/README.md`, con una BD terminada en `_test`, distinta de
la BD de pytest, cuyas fixtures reconstruyen el esquema. Los recorridos anteriores
de Jornada y presupuesto → realizado → cobro → factura siguen formando parte de
la validación.

Las fixtures de pytest fijan `DATABASE_URL` antes de importar el backend, para
que middleware y sesiones independientes no utilicen accidentalmente la BD del
archivo `.env`. Exigen que `TEST_DATABASE_URL` termine en `_test`. GitHub Actions
ejecuta también el recorrido multiusuario contra su PostgreSQL aislado.
