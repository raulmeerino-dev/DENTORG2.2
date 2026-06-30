# Analisis completo del proyecto DentCore

Fecha de analisis: 2026-05-29.

Este documento explica la estructura, el flujo funcional, las piezas tecnicas principales y las funciones mas importantes del proyecto. Esta escrito como mapa de orientacion para entender el sistema completo sin tener que abrir todos los archivos uno por uno.

## 1. Vision general

DentCore es una aplicacion web de gestion dental. El producto cubre el trabajo diario de una clinica: agenda, pacientes, historia clinica, odontograma, presupuestos, facturacion, cobros, documentos, consentimientos, laboratorio, inventario, administracion, auditoria, backups y un portal basico para pacientes.

La arquitectura es full-stack:

- Backend: FastAPI, SQLAlchemy async, Alembic, PostgreSQL, Pydantic, JWT, bcrypt, ReportLab.
- Frontend: React, TypeScript, Vite, React Router, React Query, Axios, lucide-react, sonner.
- Datos persistentes: PostgreSQL y ficheros locales para documentos, PDFs y backups.
- Seguridad: JWT access/refresh, roles, aislamiento por clinica, auditoria encadenada, cabeceras HTTP, CORS y cifrado de datos sensibles.

Flujo base:

```text
Usuario -> React/Vite -> Axios src/lib/api.ts -> FastAPI /api -> SQLAlchemy async -> PostgreSQL
                                      |                 |
                                      |                 +-> ReportLab / PDFs
                                      |                 +-> uploads / documentos
                                      |                 +-> backups cifrados
                                      |
                                      +-> modo demo opcional si VITE_DEMO_FALLBACK=true
```

## 2. Estructura de carpetas

```text
.
|-- README.md
|-- CLAUDE.md
|-- docs/
|   |-- arquitectura.md
|   |-- modelo-datos.md
|   |-- modulos.md
|   |-- testing.md
|   |-- despliegue.md
|   |-- fases y auditorias funcionales
|   `-- ANALISIS_COMPLETO_PROYECTO.md
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- config.py
|   |   |-- database.py
|   |   |-- api/
|   |   |-- core/
|   |   |-- models/
|   |   |-- schemas/
|   |   |-- services/
|   |   `-- data/
|   |-- alembic/
|   |-- scripts/
|   |-- tests/
|   |-- pyproject.toml
|   |-- Dockerfile.dev
|   `-- Dockerfile.prod
`-- frontend/
    |-- src/
    |   |-- main.tsx
    |   |-- App.tsx
    |   |-- auth/
    |   |-- components/
    |   |-- config/
    |   |-- lib/
    |   |-- modules/
    |   |-- styles/
    |   `-- types/
    |-- public/
    |-- package.json
    `-- vite.config.ts
```

## 3. Backend

### 3.1 Punto de entrada

Archivo principal: `backend/app/main.py`.

Responsabilidades:

- Crea la app FastAPI con titulo, version y rutas de documentacion en desarrollo.
- Arranca el planificador de backups en el lifespan.
- Configura CORS desde `settings.cors_allowed_origins`.
- Activa `TrustedHostMiddleware` si hay hosts permitidos.
- Activa `SecurityHeadersMiddleware`.
- Activa `AuditLogMiddleware`.
- Monta todos los routers bajo `/api`.
- Expone `/api/health`.

Routers montados:

```text
/api/auth          -> autenticacion y sesiones
/api/pacientes     -> pacientes, salud, saldo, anticipos, referencias
/api/citas         -> agenda, estados, huecos, recordatorios, telefonear
/api/doctores      -> doctores, gabinetes, horarios y excepciones
/api/tratamientos  -> familias, catalogo, historial, notas, sesion clinica
/api/presupuestos  -> presupuestos, lineas, odontograma plan, trabajo pendiente
/api/facturas      -> facturas, cobros, pagos, Verifactu/SIF
/api/reportes      -> KPIs y listados BI
/api/admin         -> usuarios, auditoria, entidades, backups, preflight
/api/pdf           -> PDFs de facturas, presupuestos y cobros
/api/pacientes     -> documentos de paciente
/api               -> laboratorio, consentimientos y odontograma
/api/clinicas      -> clinicas
/api/inventario    -> inventario, proveedores, pedidos
/api/sync          -> sincronizacion offline
/api/import        -> importacion de pacientes
/api/portal        -> portal paciente
```

### 3.2 Configuracion

Archivo: `backend/app/config.py`.

Clase principal: `Settings`.

Variables relevantes:

- `database_url`: conexion async a PostgreSQL.
- `db_encryption_key`: clave para cifrado de campos sensibles.
- `jwt_secret_key`, `jwt_algorithm`, `jwt_expire_minutes`.
- `refresh_token_expire_days`, `refresh_cookie_name`, `auth_cookie_secure`, `auth_cookie_samesite`.
- `verifactu_mode`, `sif_codigo`, `sif_version`, datos de productor SIF.
- `frontend_url`, `allowed_hosts`, `environment`.
- Limites de seguridad: intentos de login, ventana de bloqueo, subida maxima.
- Datos de clinica para PDFs y documentos fiscales.

Funciones/propiedades importantes:

- `declaracion_responsable_texto`: genera el texto de declaracion responsable SIF.
- `allowed_hosts_list`: convierte `ALLOWED_HOSTS` en lista.
- `cors_allowed_origins`: permite frontend configurado y alias localhost/127.0.0.1.
- `validate_production_security`: impide arrancar en produccion con secretos o hosts inseguros.
- `get_settings`: cachea la configuracion con `lru_cache`.

### 3.3 Base de datos

Archivo: `backend/app/database.py`.

Piezas principales:

- `engine`: motor async SQLAlchemy con `pool_pre_ping`, `pool_size=10` y `max_overflow=20`.
- `AsyncSessionLocal`: factory de sesiones async.
- `Base`: clase base declarativa para modelos.
- `get_db`: dependencia FastAPI que abre sesion, hace commit al final, rollback ante excepciones y cierra siempre.

Patron de acceso:

```text
Endpoint FastAPI -> Depends(get_db) -> AsyncSession -> select/add/update/delete -> commit automatico en get_db
```

### 3.4 Seguridad y permisos

Carpeta: `backend/app/core`.

Archivos clave:

- `security.py`: hashing bcrypt, verificacion de passwords, creacion/verificacion de JWT access y refresh, TOTP 2FA.
- `permissions.py`: lectura de JWT, roles, dependencias de permisos, aislamiento por clinica.
- `crypto.py`: cifrado/descifrado de datos sensibles de paciente y JSON usando pgcrypto.
- `audit.py`: middleware de auditoria para rutas sensibles.
- `tamper_chain.py`: serializacion canonica y hash encadenado para auditoria/SIF.
- `http_security.py`: cabeceras de seguridad.
- `throttling.py`: limitacion de intentos o peticiones sensibles.

Roles:

```text
admin      -> acceso transversal y administracion
doctor     -> datos clinicos y agenda
recepcion  -> agenda, pacientes administrativos y caja
auxiliar   -> apoyo clinico/agenda
paciente   -> portal paciente
```

Funciones principales de permisos:

- `get_current_user`: valida el bearer token y devuelve `TokenData`.
- `require_roles`: genera dependencias de rol.
- `require_admin`, `require_doctor_or_admin`, `require_recepcion_or_above`.
- `can_view_health_data`: permite datos de salud a admin/doctor/auxiliar.
- `can_modify_billing`: limita facturacion a admin/recepcion.
- `ensure_clinic_access`: bloquea acceso a otra clinica.
- `resolve_clinic_id`: decide la clinica asignable segun usuario.
- `scope_select_by_clinic`: aplica filtro multi-clinica a consultas SQLAlchemy.

### 3.5 Auditoria

`AuditLogMiddleware` registra accesos a rutas sensibles:

- `/api/pacientes`
- `/api/citas`
- `/api/historial`
- `/api/presupuestos`
- `/api/facturas`
- `/api/consentimientos`
- `/api/documentos`
- `/api/laboratorio`
- `/api/admin/backups`
- `/api/admin/usuarios`

El middleware:

1. Deja pasar la request.
2. Si la ruta es sensible y la respuesta fue 2xx, 401 o 403, prepara un evento.
3. Extrae usuario/clinica desde el token si existe.
4. Calcula accion segun metodo HTTP: READ, CREATE, UPDATE, DELETE o DENY.
5. Guarda `AuditLog` con `previous_hash` y `event_hash`.

La cadena de integridad se calcula con `build_chain_hash`, usando JSON canonico y SHA-256.

### 3.6 Modelos principales

Los modelos viven en `backend/app/models`. `models/__init__.py` importa todos para que Alembic los detecte.

Grupos de datos:

- Identidad y clinicas:
  - `Clinica`
  - `Usuario`
  - `AuthSession`
  - `AuditLog`
- Pacientes:
  - `Paciente`
  - `Referencia`
  - tabla asociativa `paciente_referencias`
- Agenda:
  - `Cita`
  - `CitaCambio`
  - `CitaTelefonear`
  - `HistorialFaltas`
  - `HorarioDoctor`
  - `HorarioExcepcion`
  - `Gabinete`
- Clinica dental:
  - `Doctor`
  - `FamiliaTratamiento`
  - `TratamientoCatalogo`
  - `HistorialClinico`
  - `NotaDental`
  - `SesionClinicaItem`
- Odontograma:
  - `Odontograma`
  - `OdontogramaPieza`
  - `OdontogramaSuperficie`
  - `OdontogramaEvento`
- Presupuestos:
  - `Presupuesto`
  - `PresupuestoLinea`
  - `TrabajoPendiente`
- Facturacion:
  - `Factura`
  - `FacturaLinea`
  - `Cobro`
  - `PagoAnticipadoPaciente`
  - `FormaPago`
  - `DocumentoFiscal`
  - `RegistroFacturacion`
  - `RegistroEventoSIF`
- Documentos y consentimientos:
  - `DocumentoPaciente`
  - `Consentimiento`
  - `ConsentimientoPlantilla`
- Laboratorio:
  - `Laboratorio`
  - `TrabajoLaboratorio`
- Inventario:
  - `Proveedor`
  - `Producto`
  - `MovimientoInventario`
  - `PedidoProveedor`
  - `PedidoLinea`
- Backups:
  - `BackupRegistro`
- Entidades/baremos:
  - `Entidad`
  - `EntidadBaremo`

Mixins:

- `UUIDMixin`: id UUID.
- `TimestampMixin`: `created_at` y `updated_at`.
- `SoftDeleteMixin`: `activo`.

### 3.7 Schemas Pydantic

Carpeta: `backend/app/schemas`.

Uso:

- Validar payloads de entrada.
- Definir respuestas de API.
- Centralizar enums y tipos compartidos con frontend.

Archivos importantes:

- `auth.py`: login, token, usuario actual, sesiones.
- `paciente.py`: crear/editar/responder paciente, salud y resumen.
- `cita.py`: citas, disponibilidad, cambios, telefonear.
- `doctor.py`: doctor, gabinete, horarios.
- `tratamiento.py`: familias, catalogo, historial, notas, sesion clinica.
- `presupuesto.py`: presupuestos, lineas, trabajo pendiente, odontograma plan.
- `factura.py`: facturas, cobros, anticipos, saldo, formas de pago.
- `odontograma.py`: odontograma, piezas, superficies, eventos y contexto.
- `receta.py`: receta clinica.
- `extras.py`: clinicas, inventario, sync/import, backups, reportes auxiliares.
- `enums.py`: roles, estados de cita/factura/presupuesto/documentos/tratamientos.

### 3.8 Servicios

Carpeta: `backend/app/services`.

Responsabilidades:

- `agenda_service.py`: solapamientos, horarios, disponibilidad y busqueda de huecos.
- `audit.py`: escritura explicita de auditoria desde endpoints concretos.
- `backup_service.py`: snapshot de base de datos, cifrado, escritura y verificacion de backups.
- `backup_scheduler.py`: programacion de backup diario si falta.
- `fiscal_document_service.py`: carga de factura para PDF, archivo de PDF fiscal y lectura de PDF archivado.
- `pdf_service.py`: generacion de PDFs de facturas, presupuestos, recibos, recetas y consentimientos.
- `production_readiness.py`: informe preflight de produccion.
- `verifactu_service.py`: sellado de facturas, registros RF, eventos SIF e integridad de cadenas.

### 3.9 Routers backend por dominio

#### Auth: `api/auth.py`

Endpoints:

- `POST /api/auth/login`: valida usuario/password/OTP, crea sesion, access token y refresh token.
- `POST /api/auth/refresh`: renueva access token usando refresh token.
- `POST /api/auth/logout`: revoca sesion y limpia cookie.
- `GET /api/auth/me`: devuelve usuario actual.
- `POST /api/auth/2fa-enable`: genera secreto y QR TOTP.
- `GET /api/auth/sessions`: lista sesiones del usuario.
- `DELETE /api/auth/sessions/{session_id}`: revoca una sesion.

Funciones internas destacadas:

- `_create_auth_session`: crea sesion persistente.
- `_build_token_data`: payload comun de JWT.
- `_revoke_session`: marca sesion como revocada.
- `set_refresh_cookie` y `clear_refresh_cookie`.

#### Pacientes: `api/pacientes.py`

Endpoints:

- Listar, crear, obtener, actualizar y desactivar pacientes.
- Leer/actualizar salud.
- Obtener citas de un paciente.
- Calcular saldo.
- Gestionar pagos anticipados.
- Historial de faltas.
- Referencias y catalogo de referencias.

Funciones internas:

- `_get_paciente_or_404`
- `_build_response`
- `_leer_datos_salud`
- `_ensure_doctor_habitual_valido`

Puntos importantes:

- Descifra campos sensibles antes de responder.
- Aplica permisos para mostrar datos de salud.
- Respeta multi-clinica.

#### Citas/agenda: `api/citas.py`

Endpoints:

- CRUD de citas.
- Buscar hueco.
- Disponibilidad de doctor.
- Reprogramar.
- Cambiar estado, confirmar, cancelar, marcar falta.
- Historial de cambios.
- Recordatorios.
- Cola de telefonear/reubicar.

Funciones internas:

- `_validar_cita_operativa`: comprueba disponibilidad, solapamientos y coherencia.
- `_registrar_cambio_cita`: genera historial de cambios.
- `_registrar_falta_si_procede`: crea historial de faltas cuando aplica.
- `_to_response`: adapta modelo a schema.

#### Doctores: `api/doctores.py`

Gestiona:

- Doctores.
- Gabinetes.
- Horarios semanales.
- Excepciones de disponibilidad.

Se usa desde agenda y configuracion.

#### Tratamientos: `api/tratamientos.py`

Gestiona:

- Familias de tratamientos.
- Catalogo de tratamientos.
- Historial clinico.
- Notas dentales.
- Items de sesion clinica.
- Finalizacion de tratamientos de sesion.

Funciones importantes:

- `_mark_session_historial_on_odontograma`: sincroniza tratamientos realizados con odontograma.
- `_ensure_sesion_role`: protege acciones clinicas.
- `finalizar_tratamiento_sesion`: registra lo realizado y conecta con historial.

#### Odontograma: `api/odontograma.py`

Gestiona:

- Obtener/crear odontograma activo por paciente.
- Obtener contexto segun modo: clinico, presupuesto, sesion, etc.
- Actualizar pieza.
- Actualizar superficie.
- Generar presupuesto desde odontograma.
- Historial de eventos.
- Duplicar version.

Idea funcional:

```text
Paciente -> Odontograma activo -> Piezas FDI -> Superficies -> Diagnostico/estado/tratamiento
```

El backend mantiene compatibilidad con rutas antiguas (`/odontograma/...`) y nuevas (`/odontogramas/...`).

#### Presupuestos: `api/presupuestos.py`

Gestiona:

- CRUD de presupuestos.
- Guardar plan de odontograma en presupuesto.
- Presentar, aceptar, rechazar.
- Convertir a factura.
- Lineas de presupuesto.
- Pasar lineas aceptadas a trabajo pendiente.
- Marcar trabajo pendiente como realizado.

Flujo clave:

```text
Presupuesto borrador
  -> lineas de tratamientos
  -> presentar
  -> aceptar lineas
  -> pasar a trabajo pendiente
  -> realizar
  -> historial clinico
  -> factura/cobro
```

Tambien conecta lineas de presupuesto con superficies del odontograma.

#### Facturas: `api/facturas.py`

Gestiona:

- Formas de pago.
- CRUD de facturas.
- Facturacion desde historial sin facturar.
- Emitir/sellar factura.
- Receta asociada.
- Actualizar antes de emitir.
- Anular, rectificar.
- Lineas.
- Cobros y pagos.
- Integridad Verifactu/SIF.

Regla importante:

- Si una factura ya tiene `huella`, se considera sellada e inalterable. No se modifica: se anula o rectifica.

Funciones internas destacadas:

- `_siguiente_numero`: siguiente numero por serie.
- `_calcular_linea`: calcula base/IVA/total.
- `_asegurar_factura_inalterable`: bloquea modificaciones sobre factura sellada.
- `_registrar_intento_bloqueado`: deja evento SIF si alguien intenta modificar lo sellado.

#### Documentos: `api/documentos.py`

Gestiona documentos por paciente:

- Listar documentos.
- Subir documentos.
- Generar PDF administrativo.
- Descargar.
- Eliminar.

Los documentos se guardan con metadatos clinicos: categoria, fecha, tratamiento, historial, doctor, etiquetas.

#### Consentimientos: `api/consentimientos.py`

Gestiona:

- Plantillas versionadas.
- Consentimientos por paciente.
- Creacion desde plantilla o contenido.
- Edicion.
- Firma.
- Revocacion.
- PDF de consentimiento.

Incluye captura de firma, hash de documento y metadatos de firma.

#### Laboratorio: `api/laboratorio.py`

Gestiona:

- Laboratorios/protesicos.
- Trabajos de laboratorio.
- Estados, fechas, costes, margen y relacion con paciente/tratamiento/presupuesto/factura.

#### Inventario: `api/inventario.py`

Gestiona:

- Productos.
- Alertas de stock.
- Proveedores.
- Pedidos.
- Recepcion de pedidos.
- Movimientos de inventario.

#### Reportes: `api/reportes.py`

Expone:

- `ingresos`
- `kpis`
- `dashboard`
- `facturacion-mensual`
- `top-tratamientos`
- `tratamientos`
- `citas-por-doctor`
- `doctores`
- `citas`
- `pacientes`
- `faltas`

Calcula KPIs de facturacion, cobro, deuda, citas, asistencia, faltas, pacientes nuevos, presupuestos y actividad por doctor.

#### Admin: `api/admin.py`

Gestiona:

- Usuarios.
- Auditoria.
- Entidades.
- Cumplimiento SIF.
- Export SIF.
- Backups.
- Preflight de produccion.

El preflight usa `build_production_readiness_report` y revisa:

- Entorno.
- Secretos.
- Cifrado.
- Hosts.
- Frontend/CORS.
- Cookies.
- Auditoria.
- Backups.
- Fiscal/SIF.

#### PDF: `api/pdf.py`

Expone PDFs:

- Factura.
- Info de PDF fiscal archivado.
- Presupuesto.
- Recibo de cobro.

#### Portal: `api/portal.py`

Portal paciente basico:

- Ver resumen propio.
- Ver citas.
- Confirmar/cancelar cita.
- Ver documentos.
- Ver consentimientos.
- Firmar consentimiento.

Nota de arquitectura: la documentacion existente indica que aun falta un token publico seguro o relacion persistente `Usuario.paciente_id` para un portal paciente comercialmente completo.

#### Sync/import: `api/sync_import.py`

Gestiona:

- Sincronizacion offline de pacientes y citas.
- Importacion masiva/minima de pacientes.

## 4. Frontend

### 4.1 Punto de entrada

Archivo: `frontend/src/main.tsx`.

Hace:

- Importa estilos globales `index.css`.
- Importa `styles/layout-foundation.css`.
- Renderiza `<App />` dentro de `StrictMode`.

Archivo: `frontend/src/App.tsx`.

Responsabilidades:

- Crea `QueryClient` con `MutationCache`.
- En errores de mutaciones sin handler local, muestra toast global con `getApiErrorMessage`.
- Envuelve todo en `QueryClientProvider`, `AuthProvider`, `BrowserRouter` y `Toaster`.
- Define rutas y proteccion por login/rol.

Rutas:

```text
/login           -> LoginPage
/                -> Protected + Layout
/hoy             -> HoyPage
/dashboard       -> redirige a /admin-extras?tab=reportes para admin
/pacientes       -> PacientesPage
/agenda          -> AgendaPage
/caja            -> CajaPage, admin/recepcion
/listados        -> ListadosPage, admin
/configuracion   -> redirige a /admin-extras
/admin-extras    -> AdminExtrasPage, admin
/mis-citas       -> MisCitasPage
/portal          -> MisCitasPage
```

Componentes de proteccion:

- `Protected`: si no hay sesion, redirige a `/login`.
- `RoleProtected`: si el rol no esta permitido, redirige a `/hoy`.
- `ConfiguracionRedirect`: compatibilidad de ruta antigua.

### 4.2 Autenticacion frontend

Archivo: `frontend/src/auth/AuthContext.tsx`.

Expone:

- `AuthProvider`
- `useAuth`

Estado:

- `user`: usuario actual.
- `isLoading`: carga de sesion.
- `isAuthenticated`: booleano derivado.
- `login`: llama a `loginRequest`, guarda token e invalida `me`.
- `logout`: llama a backend, limpia token y borra cache de React Query.

La sesion se comprueba con `getMe` cuando hay token almacenado.

### 4.3 Layout y navegacion

Archivos:

- `components/Layout.tsx`
- `components/Sidebar.tsx`
- `components/AppStatus.tsx`
- `components/ErrorBoundary.tsx`

`Layout` compone:

```text
app-shell
  -> MainNav
  -> AppStatus
  -> main-content
       -> ErrorBoundary
          -> Outlet
```

`Sidebar.tsx`:

- Usa `WORKFLOW_ITEMS` de `config/workflow.ts`.
- Filtra items por rol con `canAccess`.
- Muestra Hoy, Pacientes, Agenda, Caja y Admin.
- Incluye cambio de tema claro/oscuro con `localStorage`.
- Muestra fecha/hora actual, usuario y rol.
- Ejecuta logout.

### 4.4 Configuracion de flujo

Archivo: `frontend/src/config/workflow.ts`.

Define:

- `AppSection`
- `WorkflowItem`
- `ROLE_LABELS`
- `WORKFLOW_ITEMS`
- `canAccess`
- `canRoleAccess`

Es la fuente de verdad frontend para navegacion visible y descripciones por rol.

### 4.5 Cliente API frontend

Archivo: `frontend/src/lib/api.ts`.

Responsabilidades:

- Crea instancia Axios:
  - `baseURL = VITE_API_BASE_URL ?? http://127.0.0.1:8011/api`
  - `withCredentials = true`
- Gestiona token en `sessionStorage`/`localStorage`.
- Inyecta `Authorization: Bearer ...`.
- Normaliza mensajes de error con `getApiErrorMessage`.
- Implementa modo demo/fallback para desarrollo.
- Agrupa funciones por dominio.

Funciones API agrupadas:

- Auth:
  - `login`, `logout`, `getMe`, `enableTwoFactor`.
- Pacientes:
  - `getPacientes`, `getPaciente`, `createPaciente`, `updatePaciente`.
  - `getPacienteCitas`, `getSaldoPaciente`.
  - anticipos: `getPagosAnticipadosPaciente`, `createPagoAnticipadoPaciente`, `updatePagoAnticipadoPaciente`.
- Historial/sesion/notas:
  - `getHistorialPaciente`, `getHistorialSinFacturar`.
  - `finalizarTratamientoSesion`.
  - `getSesionItemsPaciente`, `createSesionItem`, `updateSesionItem`, `deleteSesionItem`.
  - `getNotasDentalesPaciente`, `createNotaDental`.
- Documentos:
  - `getDocumentosPaciente`, `documentoDownloadUrl`, `openDocumentoPaciente`, `uploadDocumentoPaciente`, `generarDocumentoPdfPaciente`.
- Consentimientos:
  - `getPlantillasConsentimiento`, `getConsentimientosPaciente`, `createConsentimientoPaciente`, `firmarConsentimiento`, `revocarConsentimiento`, `openConsentimientoPdf`.
- Recetas:
  - `getRecetasPaciente`, `createRecetaClinica`, `firmarRecetaClinica`, `openRecetaClinicaPdf`.
- Presupuestos:
  - `getPresupuestos`, `createPresupuesto`, `presentarPresupuesto`, `aceptarPresupuesto`, `rechazarPresupuesto`, `convertirPresupuestoFactura`.
  - `addPresupuestoLinea`, `updatePresupuestoLinea`, `deletePresupuestoLinea`, `pasarPresupuestoTrabajoPendiente`.
  - `saveOdontograma`.
- Facturas/caja:
  - `getFacturas`, `getFormasPago`, `createFacturaManual`, `createFacturaDesdeHistorial`, `registrarCobro`.
  - `facturaPdfUrl`, `recetaPdfUrl`, `emitirRecetaPdf`.
- Agenda:
  - `getCitas`, `createCita`, `updateCita`, `reprogramarCita`, `confirmarCita`, `cancelarCitaAvanzada`, `marcarFaltaCita`.
  - `buscarHuecosLibres`, `getDisponibilidadDoctor`, `getCambiosCita`.
  - `enviarRecordatorioCita`.
  - `getTelefonear`, `marcarTelefonearReubicada`.
- Doctores/horarios:
  - `getDoctores`, `createDoctor`, `updateDoctor`, `getHorarios`, `updateHorarioDoctor`.
- Tratamientos:
  - `getFamiliasTratamiento`, `createFamiliaTratamiento`.
  - `getTratamientosCatalogo`, `createTratamientoCatalogo`, `updateTratamientoCatalogo`, `deactivateTratamientoCatalogo`.
- Inventario:
  - `getInventario`, `getAlertasStock`, `createProductoInventario`, `updateProductoInventario`.
  - `getMovimientosInventario`, `registrarMovimientoInventario`.
  - `getProveedoresInventario`, `createProveedorInventario`.
  - `getPedidosInventario`, `createPedidoInventario`, `updatePedidoInventario`, `recibirPedidoInventario`.
- Admin/reportes:
  - `getClinicas`, `createClinica`.
  - `getIngresosReporte`, `getBackups`, `crearBackup`, `verificarBackup`.
  - `getProductionReadiness`, `getAuditLog`, `getCumplimientoSif`.
  - `getReportKpis`, `getReportDashboard`, `getReportPacientes`, `getReportTopTratamientos`, `getReportCitasDoctor`.
- Laboratorio:
  - `getLaboratorios`, `getTrabajosLaboratorio`, `createTrabajoLaboratorio`, `updateTrabajoLaboratorio`.
- Odontograma:
  - `getOdontogramaPaciente`, `getOdontogramaContexto`, `createOdontogramaPaciente`.
  - `updateOdontogramaPieza`, `updateOdontogramaSuperficie`, `getOdontogramaHistorial`.
  - `duplicateOdontogramaVersion`, `createPresupuestoFromOdontograma`.
- Portal:
  - `getPortalMe`, `getPortalCitas`, `confirmarPortalCita`, `cancelarPortalCita`, `getPortalDocumentos`, `getPortalConsentimientos`, `firmarPortalConsentimiento`.
- Sync/import:
  - `syncOffline`, `importPacientes`.

Modo demo:

- Se activa en desarrollo con `VITE_DEMO_FALLBACK=true`.
- Usa tokens `demo:admin`, `demo:doctor`, `demo:recepcion`.
- Devuelve pacientes, doctores, tratamientos, presupuestos, facturas, historial, documentos, consentimientos, laboratorio y reportes de ejemplo si el backend no responde o si se usa una sesion demo.

### 4.6 Tipos compartidos

Archivo: `frontend/src/types/api.ts`.

Define tipos de:

- Usuario/roles.
- Paciente.
- Portal.
- Tratamientos/familias.
- Presupuestos/lineas.
- Facturas/cobros/anticipos/formas de pago/saldo.
- Clinicas.
- Inventario/proveedores/pedidos/movimientos.
- Reportes.
- Auditoria/backups/preflight.
- Citas/huecos/disponibilidad/cambios/telefonear.
- Historial clinico/sesion clinica/notas.
- Documentos/consentimientos.
- Doctores/horarios.
- Recetas.
- Laboratorio.
- Odontograma y contexto.

Es la capa que mantiene tipado fuerte entre UI y API.

### 4.7 Modulos funcionales frontend

Carpeta: `frontend/src/modules`.

#### `auth`

- `LoginPage.tsx`.
- Login con usuario/password/OTP.
- Usa `useAuth().login`.

#### `hoy`

- Centro operativo diario.
- Muestra citas de hoy, llamadas/telefonear, recordatorios y acciones rapidas.
- Incluye plantillas de WhatsApp y manejo de estado de citas.

#### `agenda`

- Agenda visual de citas.
- Permite crear, editar, confirmar, cancelar, reprogramar y marcar falta.
- Usa modales como `CancelCitaModal`.
- Consume doctores, citas, huecos, disponibilidad y telefonear.

#### `pacientes`

Es el modulo mas grande y central.

Archivo principal: `modules/pacientes/index.tsx`.

Tabs y areas:

- Ficha de paciente.
- Clinica / primera visita / sesion / visitas / notas.
- Presupuestos.
- Tratamientos pendientes.
- Tratamientos realizados.
- Historial completo.
- Citas.
- Facturacion.
- Consentimientos.
- Documentos.
- Laboratorio.

Componentes importantes:

- `FichaPaciente.tsx`: buscador, formulario, chips de identidad, modal de ficha completa, nuevo paciente.
- `ClinicalWorkspace.tsx`: area clinica, sesion, visitas, notas y checklist de salida.
- `PrimeraVisita.tsx`: estado inicial/primera visita.
- `Presupuestos.tsx`: presupuesto, lineas y citas del paciente.
- `TrabajoPendiente.tsx`: tratamientos pendientes derivados de presupuestos.
- `HistorialFacturacion.tsx`: tabla de tratamientos realizados con factura, cobro y saldo.
- `HistorialCompleto.tsx`: timeline unificado clinico/fiscal/documental.
- `Consentimientos.tsx`: plantillas, firmas y documentos/circulares.
- `Documentos.tsx`: upload y organizacion de documentos.
- `Laboratorio.tsx`: trabajos de laboratorio por paciente.
- `Recetas.tsx`: emision/firma/PDF de recetas.
- `PatientActionsMenu.tsx`: acciones rapidas del paciente.
- `PatientOdontogramSummary.tsx`: resumen visual pequeño.
- `DentalPieceHistoryPanel.tsx`: historial filtrado por pieza dental.
- `patientExitChecklist.ts`: reglas para saber que falta antes de cerrar una visita.
- `patientStatus.ts`: estado sintetico del paciente.
- `billingUtils.ts`: totales y facturas pendientes.
- `laboratorioUtils.ts`: vencimientos de laboratorio.

Modales:

- Anticipos.
- Cobros.
- Comentarios.
- Factura desde historial.
- Factura manual.
- Revocacion de consentimiento.

#### `odontogram`

Modulo especializado de odontograma dental.

Piezas:

- `OdontogramaTool.tsx`: herramienta principal.
- `PatientOdontogramFlow.tsx`: flujo en ficha de paciente.
- `BudgetOdontogramFlow.tsx`: flujo desde presupuestos.
- `components/DentalArch.tsx`, `Odontogram.tsx`, `Tooth.tsx`, `ToothSvg.tsx`, `ToothOclusalSvg.tsx`.
- `components/OdontogramaSidePanel.tsx`, `SelectedToothPanel.tsx`, `QuickTreatmentModal.tsx`, `ToothContextMenu.tsx`, `ToothHistoryModal.tsx`.
- `adapters/backendAdapter.ts`: convierte odontograma backend a modelo visual.
- `adapters/budgetAdapter.ts`: convierte presupuesto a odontograma visual y viceversa.
- `data/toothMap.ts`, `toothAnatomy.ts`, `statusConfig.ts`, `modeConfig.ts`, `treatmentCatalog.ts`.
- `utils/surfaces.ts`, `surfaceMapping.ts`, `statusMapping.ts`, `viewModel.ts`, `actions.ts`, `colors.ts`.

Estados visuales:

- sano
- caries
- obturacion
- endodoncia
- corona
- implante
- ausente
- extraccion indicada
- fractura
- movilidad
- tratamiento pendiente/planificado/realizado

#### `caja`

- Vista de caja/cobros.
- Facturas, cobro inline y periodo.
- Pensado para admin/recepcion.

#### `listados`

- Listados operativos y fiscales.
- Tabs: caja, pacientes, agenda, clinica, laboratorio, control.

#### `adminExtras`

- Administracion avanzada.
- `ConfiguracionWorkspace.tsx`: doctores, tratamientos, agenda, roles, caja, laboratorio, documentos, seguridad.
- `AdminReportes.tsx`: BI/reportes/preflight.
- `tabs.ts`: tabs disponibles.

#### `dashboard`

- Dashboard de KPIs, graficas y resumen.
- Actualmente `/dashboard` redirige hacia reportes de admin.

#### `misCitas`

- Portal paciente reutilizado en `/mis-citas` y `/portal`.
- Tabs de citas, documentos y consentimientos.
- Confirmar/cancelar citas y firmar consentimientos.

### 4.8 Estilos y assets

Archivos:

- `src/index.css`: estilo global.
- `src/App.css`: estilos base heredados.
- `src/styles/layout-foundation.css`: base de layout.
- `src/modules/odontogram/styles/odontogram.css`: odontograma.

Assets:

- Logos en `src/assets/branding/`.
- Imagen `hero.png`.
- Iconos publicos `public/icons.svg`, `favicon.svg`.
- Imagenes de dientes en `public/odontogram-assets/full` y `public/odontogram-assets/occlusal`.

## 5. Flujos funcionales completos

### 5.1 Login y sesion

```text
LoginPage
  -> useAuth.login
  -> api.login
  -> POST /api/auth/login
  -> valida password bcrypt y OTP si aplica
  -> crea AuthSession
  -> devuelve access token y cookie refresh
  -> frontend guarda token
  -> AuthProvider invalida ['me']
  -> GET /api/auth/me
  -> rutas protegidas quedan accesibles
```

Logout:

```text
Sidebar Salir
  -> useAuth.logout
  -> POST /api/auth/logout
  -> backend revoca sesion/cookie
  -> frontend limpia token y cache
```

Refresh:

```text
POST /api/auth/refresh
  -> valida refresh token
  -> comprueba AuthSession activa
  -> emite nuevo access token
```

### 5.2 Flujo diario de clinica

```text
Usuario entra
  -> /hoy
  -> ve citas del dia, pendientes de llamar, acciones rapidas
  -> puede ir a agenda o ficha paciente
  -> en agenda cambia estados o reprograma
  -> en pacientes registra tratamiento/sesion/documentos/cobros
```

### 5.3 Agenda y citas

```text
AgendaPage
  -> getDoctores + getCitas + getDisponibilidadDoctor
  -> usuario crea cita
  -> createCita
  -> backend valida paciente, doctor, horario y solapamiento
  -> guarda Cita
  -> registra cambios si corresponde
```

Estados habituales:

```text
programada -> confirmada -> en_clinica -> en_tratamiento -> atendida/finalizada
programada -> cancelada/anulada/falta
```

Reprogramacion:

```text
PATCH /api/citas/{id}/reprogramar
  -> valida nuevo horario
  -> actualiza fecha/doctor/gabinete
  -> registra CitaCambio
```

Cancelacion/falta:

```text
POST /api/citas/{id}/cancelar o /marcar-falta
  -> cambia estado
  -> registra motivo
  -> puede crear CitaTelefonear
  -> puede crear HistorialFaltas
```

### 5.4 Paciente y ficha clinica

```text
PacientesPage
  -> getPacientes
  -> seleccionar paciente
  -> getPaciente + getPresupuestos + getFacturas + getHistorialPaciente + getDocumentos + ...
  -> renderiza ficha, clinica, presupuestos, historial, documentos, laboratorio
```

Datos sensibles:

- Backend cifra telefono, email, DNI y datos sensibles segun campo.
- Backend descifra antes de responder si el usuario tiene permiso.
- Datos de salud solo se muestran a roles clinicos permitidos.

### 5.5 Sesion clinica

```text
ClinicalWorkspace
  -> carga items de sesion y trabajo pendiente
  -> doctor/auxiliar marca items en curso/realizados
  -> finalizarTratamientoSesion
  -> POST /api/tratamientos/historial/sesion-realizada
  -> crea HistorialClinico
  -> actualiza item de sesion
  -> sincroniza odontograma si hay pieza/superficie
```

El checklist de salida (`patientExitChecklist.ts`) ayuda a detectar asuntos abiertos:

- citas futuras o pendientes
- presupuestos aceptados sin pasar a pendiente
- tratamientos realizados sin facturar
- consentimientos pendientes
- laboratorio vencido o pendiente
- documentos o recetas relacionados

### 5.6 Odontograma

```text
PatientOdontogramFlow
  -> getOdontogramaContexto(paciente, modo)
  -> backend devuelve piezas/superficies y contexto
  -> backendAdapter convierte a modelo visual
  -> usuario cambia pieza/superficie
  -> updateOdontogramaPieza o updateOdontogramaSuperficie
  -> backend guarda evento
```

Desde presupuesto:

```text
BudgetOdontogramFlow
  -> presupuesto con lineas
  -> budgetAdapter pinta piezas/superficies presupuestadas
  -> usuario selecciona tratamiento/pieza/superficie
  -> addPresupuestoLinea o updatePresupuestoLinea
  -> saveOdontograma guarda snapshot del plan
```

Desde odontograma a presupuesto:

```text
POST /api/odontogramas/{odontograma_id}/generar-presupuesto
  -> toma items seleccionados
  -> crea presupuesto/lineas
  -> vincula superficies con lineas
```

### 5.7 Presupuesto a factura

```text
PresupuestoPanel
  -> createPresupuesto
  -> addPresupuestoLinea
  -> presentarPresupuesto
  -> aceptarPresupuesto
  -> pasarPresupuestoTrabajoPendiente
```

Luego:

```text
TrabajoPendientePanel / ClinicalWorkspace
  -> marcar realizado
  -> crea HistorialClinico
  -> getHistorialSinFacturar
  -> createFacturaDesdeHistorial
  -> emitir factura
  -> registrar cobro
```

Convertir presupuesto directamente:

```text
POST /api/presupuestos/{id}/convertir-a-factura
  -> genera Factura con lineas aceptadas
```

### 5.8 Facturacion, cobros y SIF

```text
Factura borrador
  -> se puede editar
  -> emitir
  -> sellar_factura
  -> registrar_registro_facturacion
  -> archivar_pdf_factura
  -> ya no se puede modificar directamente
```

Cobro:

```text
POST /api/facturas/{id}/cobros
  -> crea Cobro
  -> recalcula estado: emitida/parcial/pagada
```

Anulacion/rectificacion:

```text
factura emitida con huella
  -> no se edita
  -> anular o rectificar
  -> registrar evento SIF
```

Integridad:

- `verificar_integridad_serie`
- `verificar_integridad_eventos_sif`
- registros append-only con hash encadenado.

### 5.9 Documentos y consentimientos

Documentos:

```text
DocumentosPanel
  -> uploadDocumentoPaciente
  -> POST /api/pacientes/{id}/documentos
  -> backend valida tamano/tipo
  -> guarda fichero y DocumentoPaciente
```

Consentimientos:

```text
ConsentimientosPanel
  -> getPlantillasConsentimiento
  -> createConsentimientoPaciente
  -> firma en SignaturePad
  -> firmarConsentimiento
  -> backend guarda firmas, hash y PDF
```

Revocacion:

```text
POST /api/consentimientos/{id}/revocar
  -> guarda motivo y fecha
```

### 5.10 Laboratorio

```text
LaboratorioPacientePanel
  -> getTrabajosLaboratorio({ paciente_id })
  -> createTrabajoLaboratorio
  -> updateTrabajoLaboratorio
```

Estados posibles segun uso:

```text
pendiente / pendiente_enviar / enviado / en_proceso / en_fabricacion / recibido / entregado / colocado / corregir / cancelado / finalizado
```

Se controlan:

- laboratorio/protesico
- doctor
- paciente
- tratamiento/pieza
- fechas de salida, prevista, recepcion y entrega
- coste, precio paciente, margen
- estado de pago a laboratorio y cobro a paciente

### 5.11 Inventario y pedidos

```text
AdminExtras / Configuracion
  -> getInventario
  -> alertas de stock bajo
  -> registrarMovimientoInventario
  -> crear pedido a proveedor
  -> recibirPedidoInventario
  -> incrementa stock y deja movimientos
```

### 5.12 Admin, auditoria y preflight

```text
AdminExtras
  -> usuarios/clinicas/doctores/tratamientos/horarios
  -> reportes
  -> auditoria
  -> backups
  -> preflight comercial
```

Preflight revisa si el sistema esta preparado para produccion:

- modo production
- secretos fuertes
- cifrado configurado
- hosts/CORS
- cookies seguras
- auditoria activa
- backups recientes y cifrados
- fiscal/SIF configurado

### 5.13 Portal paciente

```text
MisCitasPage
  -> getPortalMe
  -> getPortalCitas
  -> confirmarPortalCita / cancelarPortalCita
  -> getPortalDocumentos
  -> getPortalConsentimientos
  -> firmarPortalConsentimiento
```

Es un portal basico. Para produccion falta endurecer identidad del paciente con token seguro o relacion usuario-paciente persistente.

## 6. Migraciones

Carpeta: `backend/alembic/versions`.

Hay una secuencia amplia desde `0001_initial_schema.py` hasta `0032_sesion_clinica_items.py`.

Migraciones funcionalmente relevantes:

- `0001_initial_schema.py`: esquema inicial.
- `0006_seguridad_clinica_y_eventos_sif.py`: seguridad clinica y eventos SIF.
- `0008_cadenas_integridad_logs.py`: hash encadenado.
- `0009_auth_sessions.py`: sesiones persistentes.
- `0012_sif_pdf_cobros_odontograma.py`: SIF, PDF, cobros y odontograma.
- `0017_fase1_seguridad_auditoria.py`: seguridad, auditoria y multi-clinica.
- `0018_odontograma_profesional.py`: odontograma profesional.
- `0019_agenda_avanzada_cambios.py`: agenda avanzada.
- `0020_inventario_pedidos.py`: inventario y pedidos.
- `0021_consentimientos_versionados.py`: consentimientos.
- `0022_facturacion_flujo_clinico.py`: flujo clinico-fiscal.
- `0023_normaliza_superficie_odontograma.py`: normalizacion de superficies.
- `0024_pagos_anticipados_paciente.py`: anticipos.
- `0025_odontograma_contextual.py`: contexto de odontograma.
- `0026_ficha_paciente_ampliada.py`: ficha ampliada.
- `0027_recetas_clinicas.py`: recetas clinicas.
- `0028_laboratorio_avanzado.py`: laboratorio avanzado.
- `0032_sesion_clinica_items.py`: items de sesion clinica.

## 7. Scripts de datos

Carpeta: `backend/scripts`.

Scripts:

- `seed_admin.py`: usuario admin inicial.
- `seed_data.py`: datos base.
- `seed_demo.py`: datos demo.
- `seed_lista_clinica.py`: listas de clinica.
- `seed_tratamientos.py`: catalogo de tratamientos.
- `init_extensions.sql`: extensiones PostgreSQL necesarias.

## 8. Tests

### Backend

Carpeta: `backend/tests`.

Cobertura por archivo:

- `test_auth.py`: login, refresh, proteccion y fuerza bruta.
- `test_pacientes_citas.py`: pacientes, citas y multi-clinica.
- `test_odontograma.py`: odontograma.
- `test_pdf_service.py`: PDFs.
- `test_sesion_clinica.py`: sesiones clinicas.
- `conftest.py`: fixtures de test.

Comando:

```powershell
cd backend
$env:DATABASE_URL="postgresql+asyncpg://dentcore:dentcore_dev_pass@127.0.0.1:5434/dentcore_test"
$env:TEST_DATABASE_URL="postgresql+asyncpg://dentcore:dentcore_dev_pass@127.0.0.1:5434/dentcore_test"
.\.venv\Scripts\python.exe -m pytest -q
```

### Frontend

Tests repartidos junto a componentes y modulos:

- Navegacion y roles.
- MutationCache global.
- Login.
- Sidebar/AppStatus.
- Pacientes, ficha, acciones, estado y checklist.
- Agenda.
- Laboratorio.
- Recetas.
- Odontograma y adapters.
- Admin/reportes/tabs.

Comandos:

```powershell
cd frontend
npm exec tsc -- --noEmit
npm test -- --run
npm run build
```

`npm test` ejecuta build TypeScript/Vite y despues Vitest.

CI:

- `.github/workflows/ci.yml`
- Backend con PostgreSQL 16, Alembic y pytest.
- Frontend con Node 22, `npm ci` y `npm test`.

## 9. Arranque local

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
$env:DATABASE_URL="postgresql+asyncpg://dentcore:dentcore_dev_pass@127.0.0.1:5434/dentcore"
$env:JWT_SECRET_KEY="dev-secret-change-me"
$env:DB_ENCRYPTION_KEY="dev-encryption-key-min-32-chars"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011 --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

URLs:

- Frontend: `http://127.0.0.1:5173`
- API docs en desarrollo: `http://127.0.0.1:8011/api/docs`
- Healthcheck: `http://127.0.0.1:8011/api/health`

## 10. Archivos que conviene conocer primero

Para entender rapido el proyecto:

1. `README.md`: vision, arranque y estado.
2. `docs/arquitectura.md`: arquitectura resumida.
3. `docs/modelo-datos.md`: mapa de tablas.
4. `docs/modulos.md`: mapa funcional.
5. `backend/app/main.py`: montaje de API.
6. `backend/app/config.py`: settings y seguridad de produccion.
7. `backend/app/database.py`: sesion SQLAlchemy.
8. `backend/app/core/permissions.py`: roles y multi-clinica.
9. `backend/app/api/pacientes.py`: patron de endpoint de dominio.
10. `backend/app/api/citas.py`: agenda avanzada.
11. `backend/app/api/presupuestos.py`: puente clinica-presupuesto.
12. `backend/app/api/facturas.py`: facturacion/SIF.
13. `backend/app/api/odontograma.py`: odontograma contextual.
14. `frontend/src/App.tsx`: rutas.
15. `frontend/src/lib/api.ts`: contrato frontend-backend.
16. `frontend/src/types/api.ts`: tipos.
17. `frontend/src/modules/pacientes/index.tsx`: pantalla principal.
18. `frontend/src/modules/pacientes/ClinicalWorkspace.tsx`: trabajo clinico.
19. `frontend/src/modules/odontogram/OdontogramaTool.tsx`: odontograma visual.
20. `frontend/src/modules/adminExtras/ConfiguracionWorkspace.tsx`: admin/configuracion.

## 11. Patrones tecnicos del proyecto

Backend:

- Routers por dominio.
- Schemas Pydantic como contrato explicito.
- SQLAlchemy async.
- `Depends(get_db)` para transacciones.
- JWT bearer para access token.
- Refresh token/cookie y sesiones persistentes.
- Permisos declarativos por dependencia.
- Filtro multi-clinica centralizado.
- Auditoria transversal por middleware y auditoria explicita en operaciones delicadas.
- Facturas emitidas inalterables.
- Cadenas hash para auditoria y SIF.
- PDFs generados con ReportLab.
- Migraciones Alembic versionadas.

Frontend:

- React Router para pantallas.
- React Query para datos remotos.
- Axios centralizado.
- Tipos API centralizados.
- Modulos funcionales por carpeta.
- Estado local para UI, formularios y modales.
- Toast global para errores de mutaciones.
- Rutas protegidas por login y rol.
- Modo demo para desarrollo sin backend.

## 12. Riesgos y puntos pendientes detectados por lectura

Estos puntos ya aparecen parcialmente en la documentacion existente y se refuerzan al leer el codigo:

- Portal paciente: falta una identidad paciente robusta para produccion, idealmente token publico con expiracion o `Usuario.paciente_id`.
- Produccion fiscal: Verifactu/SIF tiene cadena e integridad, pero debe validarse legal/fiscalmente antes de venta.
- Backups: el sistema crea/verifica backups, pero comercialmente hace falta prueba de restauracion documentada.
- Chunk frontend grande: Vite puede avisar por bundle grande; conviene code splitting por rutas.
- Tests backend: dependen de PostgreSQL accesible; en Windows local hay que usar host/puerto reales.
- Cifrado y secretos: en produccion el arranque valida secretos, pero hay que custodiar claves fuera del repositorio.

## 13. Resumen mental del producto

DentCore organiza la clinica alrededor del paciente:

```text
Paciente
  -> citas en agenda
  -> ficha administrativa y datos de salud
  -> odontograma
  -> presupuestos
  -> tratamientos pendientes/sesion clinica
  -> historial clinico
  -> documentos y consentimientos
  -> laboratorio
  -> facturas, cobros, deuda y PDFs fiscales
```

El backend mantiene la integridad, permisos, auditoria, cifrado y reglas fiscales. El frontend presenta un escritorio clinico denso, con navegacion por rol, modales de trabajo rapido y una pantalla de pacientes que concentra casi todo el flujo asistencial.

La pieza mas importante para entender el sistema completo es la conexion:

```text
Agenda -> Paciente -> Odontograma/Presupuesto -> Trabajo pendiente/Sesion -> Historial -> Factura/Cobro -> Reportes/Auditoria
```
