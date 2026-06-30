# DentCore — Paridad funcional DentCore: Diseño completo

**Fecha:** 2026-05-18
**Proyecto:** DentCore (FastAPI + SQLAlchemy + PostgreSQL / React + Vite + TypeScript)
**Objetivo:** Completar el flujo clínico-administrativo de DentCore para que cubra todas las funciones clave de DentCore, con organización moderna.

---

## Contexto y estado actual

### Lo que ya existe y funciona
- Menú principal: Hoy / Pacientes / Agenda / Caja / Admin
- Módulo Pacientes con 3 tabs: Ficha / Tratamientos / Historial
- Subtabs de Tratamientos: Primera visita / Presupuestos / Pendientes / Realizados
- Odontograma completo con modos: diagnóstico, presupuesto, pendiente, realizado
- Mini odontograma resumen en Ficha (`PatientOdontogramSummary`)
- Presupuestos con selector, estados (borrador/presentado/aceptado/rechazado/facturado), cierre de presupuesto
- Trabajo Pendiente con tabla, acciones contextuales y cita asociada
- Realizados con tabla e historial clínico
- Historial Completo como timeline con filtros (Todo/Clínico/Citas/Presupuestos/Facturación/Documentos/Consentimientos/Odontograma)
- Documentos y Consentimientos en drawer accesible desde Ficha
- Laboratorio: tabla básica de solo lectura (`LaboratorioPacientePanel`)
- Cobros, facturas, anticipos, cobro parcial — funcionales
- Admin con reportes
- Backend: `TrabajoLaboratorio` ya tiene campos extensos (estados, precios, fechas, vínculos a presupuesto/historial)
- Backend: `Paciente` ya tiene `entidad_id`, `foto_path`, `datos_salud` (JSONB)
- No existe modelo `Receta` en backend

### Lo que falta
1. Campos de ficha: sexo, profesión, país, doctor habitual, mutua/póliza, pagador distinto, fecha primera/última visita
2. Barra de acciones rápidas con menú secundario en Ficha
3. Módulo completo de Recetas (backend + frontend)
4. Laboratorio avanzado: crear pedido desde Pendientes, marcar recibido/colocado, alertas
5. Historial: filtros de cobros, recetas, laboratorio
6. Tests de flujo integración cross-módulo

---

## Arquitectura general

### Stack
- **Backend:** FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL, Pydantic v2
- **Frontend:** React 18, TypeScript, Vite, TanStack Query, React Router
- **Tests frontend:** Vitest + Testing Library
- **PDF:** reportlab (ya usado en facturas/consentimientos)

### Principios de implementación
- No romper lo que funciona — solo extender
- Cada fase produce un commit limpio con la app en estado funcional
- Backend y frontend de cada bloque van en la misma fase
- Modales/drawers existentes se extienden, no se sustituyen
- Campos nuevos de `ApiPaciente` en `types/api.ts` son opcionales para no romper código existente

---

## Fase 1 — Ficha completa

### Objetivo
Ampliar la ficha del paciente con todos los campos administrativos y clínicos que DentCore incluye, accesibles desde el formulario de edición existente.

### Backend

**Migración Alembic** — nuevas columnas en `pacientes`:

```python
# Campos a añadir al modelo Paciente
sexo: Mapped[str | None] = mapped_column(String(10), nullable=True)          # 'M', 'F', 'otro'
profesion: Mapped[str | None] = mapped_column(String(100), nullable=True)
pais: Mapped[str | None] = mapped_column(String(100), nullable=True)
doctor_habitual_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("doctores.id"), nullable=True
)
num_poliza: Mapped[str | None] = mapped_column(String(80), nullable=True)
pagador_distinto: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
pagador_nombre: Mapped[str | None] = mapped_column(String(200), nullable=True)
pagador_dni: Mapped[str | None] = mapped_column(String(20), nullable=True)
pagador_direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
```

Nota: `mutua` ya existe via `entidad_id` (FK a `Entidad`). `foto_path` ya existe. `fecha_primera_visita` / `fecha_ultima_visita` se calculan desde historial clínico en el serializer (no se persisten por separado — son campos derivados).

**Schema Pydantic** — añadir a `PacienteCreate` y crear `PacienteOut` expandido:
```python
sexo: str | None = None
profesion: str | None = None
pais: str | None = None
doctor_habitual_id: UUID | None = None
num_poliza: str | None = None
pagador_distinto: bool = False
pagador_nombre: str | None = None
pagador_dni: str | None = None
pagador_direccion: str | None = None
# Campos calculados en respuesta:
fecha_primera_visita: date | None = None   # desde historial
fecha_ultima_visita: date | None = None    # desde historial
```

**Endpoint:** El `PATCH /api/pacientes/{id}` existente ya acepta campos arbitrarios — solo hay que actualizar el schema.

### Frontend

**`types/api.ts`** — ampliar `ApiPaciente`:
```typescript
sexo?: 'M' | 'F' | 'otro' | null
profesion?: string | null
pais?: string | null
doctor_habitual_id?: string | null
num_poliza?: string | null
pagador_distinto?: boolean
pagador_nombre?: string | null
pagador_dni?: string | null
pagador_direccion?: string | null
fecha_primera_visita?: string | null   // calculado
fecha_ultima_visita?: string | null    // calculado
```

**`FichaPaciente.tsx`** — `PatientEditModal` y `PatientForm`:
- Añadir sección `<details><summary>Datos adicionales</summary>…</details>` dentro del formulario de edición existente
- Campos en el bloque colapsable: sexo (select), profesión, país, doctor habitual (select de doctores), número de póliza, pagador distinto (checkbox que muestra campos condicionales: nombre, DNI, dirección)
- Vista de solo lectura en `PatientForm`: mostrar chips: sexo, mutua (entidad), doctor habitual, alerta de alergias (ya existe), póliza si existe

### Tests (Vitest)
- Renderiza el formulario de edición con/sin campos adicionales
- El bloque colapsable se abre y cierra
- Los campos condicionales de pagador aparecen solo cuando `pagador_distinto = true`
- El PATCH se llama con los nuevos campos

---

## Fase 2 — Acciones rápidas

### Objetivo
Centralizar las acciones sobre el paciente activo en una barra consistente: acciones principales siempre visibles + menú secundario para acciones menos frecuentes.

### Backend
Sin cambios de backend en esta fase. Las acciones se conectan a endpoints ya existentes o a modales que los invocan.

### Frontend

**Nuevo componente `PatientActionsMenu`** (`frontend/src/modules/pacientes/PatientActionsMenu.tsx`):

```
Acciones principales (botones visibles):
  [Nueva cita]  [Nuevo presupuesto]  [Cobrar]  [Subir doc.]  [⋯ Más]

Menú "Más acciones" (dropdown, se abre al clicar ⋯):
  — Clínico —
  Crear receta                    (→ RecetaModal, activo en Fase 3)
  Consentimiento informado        (→ designer ya existente)
  Revocar consentimiento          (→ RevocarConsentimientoModal ya existente)
  Circular / justificante         (→ designer modo circular ya existente)
  Cuestionario médico             (→ designer con tipo 'cuestionario')
  Documento LOPD                  (→ designer con tipo 'lopd')
  Pedido de laboratorio           (→ NuevoPedidoLaboratorioModal, activo en Fase 4)
  — Comunicación —
  WhatsApp                        (→ abre wa.me/{telefono} en nueva pestaña)
  Comentario / nota               (→ modal simple que guarda en observaciones)
  Copiar datos                    (→ clipboard, ya existe en context menu)
```

**Reglas de UI:**
- Las acciones de Fase 3 y 4 se muestran `disabled` con tooltip "Próximamente" hasta que estén activas
- El menú se cierra al clicar fuera (mismo patrón que context menu existente)
- En móvil/pantalla estrecha, los 4 botones principales se reducen a iconos con tooltip

**`index.tsx`** — reemplazar los 4 botones de `patient-selector-actions` por `<PatientActionsMenu>`. Las callbacks siguen viviendo en `index.tsx` y se pasan como props. El context menu existente se mantiene para click derecho pero se puede ir simplificando en iteraciones futuras.

### Tests
- El menú se abre y cierra
- Cada acción llama la callback correcta
- Las acciones deshabilitadas no disparan callbacks
- WhatsApp abre la URL correcta con el teléfono del paciente

---

## Fase 3 — Recetas

### Objetivo
Módulo completo de recetas médicas: crear, firmar, generar PDF, consultar histórico. Accesible desde Ficha → Más acciones → Crear receta.

### Backend

**Nuevo modelo `Receta`** (`backend/app/models/receta.py`):

```python
class Receta(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "recetas"

    paciente_id: UUID (FK pacientes.id, not null, index)
    doctor_id: UUID (FK doctores.id, not null)
    clinica_id: UUID | None (FK clinicas.id, nullable)

    # Datos clínicos
    medicamento: str (Text)
    principio_activo: str | None
    forma_farmaceutica: str | None        # comprimido, jarabe, pomada…
    via_administracion: str | None        # oral, tópica, intravenosa…
    unidades: str | None                  # "2 envases", "30 comprimidos"
    duracion: str | None                  # "10 días", "1 mes"
    posologia: str (Text)                 # "1 comp. cada 8h con comida"
    pauta: str | None
    diagnostico: str | None
    instrucciones_paciente: str | None (Text)
    instrucciones_farmacia: str | None (Text)

    # Fechas
    fecha_prescripcion: date (not null, default today)
    fecha_dispensacion: date | None

    # Firma y PDF
    firma_data_url: str | None (Text)     # data:image/png;base64,…
    pdf_generado_at: datetime | None

    # Relaciones
    paciente → Paciente
    doctor → Doctor
    clinica → Clinica | None
```

**Nuevos endpoints** (`backend/app/api/recetas.py`):
- `GET /api/recetas/?paciente_id={id}` — lista recetas del paciente, orden desc
- `POST /api/recetas/` — crear receta (body: `RecetaCreate`)
- `GET /api/recetas/{id}/` — detalle
- `POST /api/recetas/{id}/firma/` — guardar firma (body: `{firma_data_url: str}`)
- `GET /api/recetas/{id}/pdf/` — genera y devuelve PDF (reportlab, mismo patrón que consentimientos)

**PDF:** usar plantilla reportlab con logo de clínica, datos del doctor, datos del paciente (nombre, DNI, fecha nacimiento), cuerpo de la receta, firma si existe. Mismo mecanismo que `app/api/pdf.py`.

**Registro en `app/main.py`** — añadir router de recetas.

**Alembic** — migración para tabla `recetas`.

**`app/models/__init__.py`** — exportar `Receta`.

### Frontend

**Nuevos archivos:**
- `frontend/src/modules/pacientes/Recetas.tsx` — contiene `RecetaModal` y `HistorialRecetasDrawer`
- `frontend/src/lib/api.ts` — añadir funciones: `getRecetas`, `createReceta`, `firmarReceta`, `recetaPdfUrl`
- `frontend/src/types/api.ts` — añadir interface `Receta`

**`RecetaModal`** — modal completo con dos secciones:
1. Formulario: todos los campos clínicos (medicamento, posología, duración, etc.)
2. Firma: pad de firma opcional, reutilizando el mismo componente canvas que usa `DocumentDesignerModal`

Flujo: rellenar campos → firmar opcional → "Generar receta" → POST → abrir PDF en nueva pestaña → el modal se cierra → query `recetas` invalidada.

**`HistorialRecetasDrawer`** — drawer/panel con lista de recetas del paciente: fecha, medicamento, doctor, botón "Ver PDF". Similar en estructura al drawer de documentos.

**Integraciones:**
- `PatientActionsMenu`: activar "Crear receta" (ya no disabled)
- `HistorialCompletoPanel`: añadir filtro `recetas` y generador de `TimelineEvent` para recetas
- `index.tsx`: añadir query `recetasQuery`, pasar data a componentes, gestionar `recetaModalOpen` state

### Tests
- `RecetaModal` renderiza y envía el formulario correcto
- La firma es opcional (se puede guardar sin firma)
- El PDF se abre al confirmar
- Las recetas aparecen en el historial completo con filtro `recetas`

---

## Fase 4 — Laboratorio avanzado

### Objetivo
Transformar el laboratorio de tabla de solo lectura a módulo operativo: crear pedidos desde trabajo pendiente, gestionar estados, recibir trabajos, alertas de vencimiento.

### Backend

El modelo `TrabajoLaboratorio` ya tiene casi todos los campos necesarios. Solo añadir:

**Migración Alembic** — nuevas columnas en `trabajos_laboratorio`:
```python
numero_orden: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
referencia_interna: Mapped[str | None] = mapped_column(String(80), nullable=True)
referencia_proveedor: Mapped[str | None] = mapped_column(String(80), nullable=True)
colocado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
material_enviado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
material_devuelto: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
presupuesto_linea_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("presupuesto_lineas.id"), nullable=True
)
```

**Endpoints existentes a extender** (`backend/app/api/laboratorio.py`):
- `POST /api/laboratorio/trabajos/` — ya existe; ampliar schema `TrabajoLaboratorioCreate` con nuevos campos
- `PATCH /api/laboratorio/trabajos/{id}/` — actualizar estado/campos
- `GET /api/laboratorio/trabajos/?paciente_id=X&proximos=true` — filtro de trabajos con `fecha_entrega_prevista < today + 7d` y `estado != recibido`

**Schema `TrabajoLaboratorioCreate`** — añadir campos nuevos.

### Frontend

**`Laboratorio.tsx`** — reescribir `LaboratorioPacientePanel` con:
- Tabla mejorada: añadir columnas `numero_orden`, `colocado`, acciones inline
- Botón "Marcar recibido" → PATCH estado=`recibido`, `fecha_recepcion=today`
- Botón "Marcar colocado" → PATCH `colocado=true`
- Badge de estado con color (pendiente=gris, enviado=azul, en_proceso=naranja, recibido=verde, incidencia=rojo)
- Alerta visual si hay trabajos con `fecha_entrega_prevista` pasada y `estado != recibido`

**Nuevo `NuevoPedidoLaboratorioModal`** (dentro de `Laboratorio.tsx`):
Campos: laboratorio (select), descripción, tipo de trabajo, pieza dental, color, fecha prevista, observaciones. Al guardar, POST a `/api/laboratorio/trabajos/` con `presupuesto_linea_id` si viene de Pendientes.

**`TrabajoPendiente.tsx`** — añadir botón "Crear pedido lab." por fila. Al clicar, abre `NuevoPedidoLaboratorioModal` con `presupuesto_linea_id` y `descripcion` pre-rellenados.

**`PatientActionsMenu`** — activar "Pedido de laboratorio" (ya no disabled), abre `NuevoPedidoLaboratorioModal` sin línea de presupuesto pre-seleccionada.

**Alerta en `PatientForm`** — si hay trabajos de laboratorio vencidos, mostrar un aviso compacto en la ficha (similar a como se muestra el saldo pendiente).

**`HistorialCompletoPanel`** — añadir filtro `laboratorio` y generador de `TimelineEvent` para trabajos de laboratorio.

**`lib/api.ts`** — añadir `createTrabajoLaboratorio`, `updateTrabajoLaboratorio`, `getTrabajosProximos`.

**`types/api.ts`** — ampliar `TrabajoLaboratorio` con campos nuevos.

### Tests
- `NuevoPedidoLaboratorioModal` renderiza y hace POST correcto
- Desde `TrabajoPendientePanel` el modal recibe el `presupuesto_linea_id` correcto
- "Marcar recibido" llama PATCH con estado y fecha
- Alerta de vencimiento aparece cuando hay trabajos con fecha pasada

---

## Fase 5 — Historial completo mejorado

### Objetivo
Añadir los filtros que faltan al historial timeline para que cubra cobros, recetas y laboratorio — completando la visión cronológica total del paciente.

### Backend
Sin cambios. Los datos ya se exponen en endpoints existentes o nuevos de Fases 3-4.

### Frontend

**`HistorialCompleto.tsx`** — solo dos cambios:

1. Ampliar `HistoryFilter`:
```typescript
type HistoryFilter = 'todo' | 'clinico' | 'citas' | 'presupuestos' | 'facturacion' | 'cobros' | 'documentos' | 'consentimientos' | 'recetas' | 'laboratorio' | 'odontograma';
```

2. Ampliar `FILTERS` array con tres nuevas entradas: `cobros`, `recetas`, `laboratorio`.

3. En el `useMemo` de eventos, añadir tres nuevos generadores:

**Cobros** — iterar `facturas[].cobros[]`:
```
TimelineEvent: fecha=cobro.fecha, filter='cobros', label='Cobro',
title=`Cobro factura #N`, detail=forma_pago, amount=cobro.importe
```

**Recetas** — iterar prop `recetas: Receta[]` (nueva prop):
```
TimelineEvent: fecha=receta.fecha_prescripcion, filter='recetas', label='Receta',
title=receta.medicamento, detail=receta.posologia,
action=() => window.open(recetaPdfUrl(receta.id), '_blank')
```

**Laboratorio** — iterar prop `laboratorio: TrabajoLaboratorio[]` (ya existe como prop en index.tsx):
```
TimelineEvent: fecha=trabajo.created_at, filter='laboratorio', label='Laboratorio',
title=trabajo.descripcion, detail=trabajo.estado,
meta=trabajo.laboratorio?.nombre
```

**`index.tsx`** — pasar `recetas` y `laboratorio` al `HistorialCompletoPanel`. `laboratorioPacienteQuery` ya existe.

**`HistorialCompletoPanel` props** — añadir `recetas: Receta[]` y actualizar los tipos de `Factura` para incluir `cobros[]` si no los incluye ya.

### Tests
- Los tres nuevos filtros muestran solo sus eventos
- El filtro "Todo" incluye cobros, recetas y laboratorio
- Los eventos de cobro muestran el importe correcto

---

## Fase 6 — Tests de flujo integración

### Objetivo
Suite de tests cross-módulo que verifican el ciclo clínico-administrativo completo de principio a fin.

### Archivos

- `frontend/src/modules/pacientes/PacientesPage.test.tsx` — ya existe, ampliar
- `frontend/src/AppNavigation.test.tsx` — ya existe, ampliar
- Nuevos archivos de test donde sea necesario para no hacer los existentes demasiado grandes

### Ciclos a cubrir

Cada test es independiente con mocks de API:

1. **Crear paciente** → aparece en lista, se puede seleccionar
2. **Ficha completa** → campos adicionales (sexo, mutua, doctor habitual) se guardan y muestran
3. **Primera visita** → marcar pieza en odontograma → se persiste el estado
4. **Presupuesto** → crear → añadir línea → presentar → aceptar → estado cambia
5. **Pasar a pendiente** → línea aceptada aparece en tab Pendientes
6. **Pedido laboratorio** → desde pendiente → modal → POST correcto → aparece en laboratorio
7. **Marcar realizado** → linea pasa a Realizados → aparece en historial clínico
8. **Factura** → crear desde historial sin facturar → PDF se abre
9. **Cobro** → registrar cobro → saldo se actualiza → aparece en historial filtro cobros
10. **Receta** → crear → firmar → PDF → aparece en historial filtro recetas
11. **Consentimiento** → crear → firmar → aparece en historial filtro consentimientos
12. **Historial completo** → todos los filtros muestran los eventos esperados

### Convenciones de mock
- Usar `vi.mock('../../lib/api')` en cada test file
- Factories de datos de prueba en `frontend/src/test/factories.ts` (crear si no existe)
- Los tests no hacen fetch real — todo mockeado con `vi.fn().mockResolvedValue()`

---

## Resumen de archivos afectados

### Backend (nuevos)
- `backend/app/models/receta.py`
- `backend/app/schemas/receta.py`
- `backend/app/api/recetas.py`
- `backend/alembic/versions/XXXX_add_recetas_and_patient_fields.py`
- `backend/alembic/versions/XXXX_extend_trabajos_laboratorio.py`

### Backend (modificados)
- `backend/app/models/paciente.py` — nuevos campos
- `backend/app/models/laboratorio.py` — nuevos campos
- `backend/app/schemas/paciente.py` — nuevos campos en Create/Out
- `backend/app/schemas/laboratorio.py` — nuevos campos
- `backend/app/api/laboratorio.py` — nuevo endpoint proximos, PATCH extendido
- `backend/app/models/__init__.py` — exportar Receta
- `backend/app/main.py` — registrar router recetas

### Frontend (nuevos)
- `frontend/src/modules/pacientes/PatientActionsMenu.tsx`
- `frontend/src/modules/pacientes/Recetas.tsx`
- `frontend/src/test/factories.ts`

### Frontend (modificados)
- `frontend/src/types/api.ts` — Paciente ampliado, Receta nueva, TrabajoLaboratorio ampliado
- `frontend/src/lib/api.ts` — funciones recetas, laboratorio PATCH, getTrabajosProximos
- `frontend/src/modules/pacientes/FichaPaciente.tsx` — sección datos adicionales colapsable
- `frontend/src/modules/pacientes/TrabajoPendiente.tsx` — botón crear pedido lab
- `frontend/src/modules/pacientes/Laboratorio.tsx` — panel avanzado + modal pedido
- `frontend/src/modules/pacientes/HistorialCompleto.tsx` — filtros cobros/recetas/laboratorio
- `frontend/src/modules/pacientes/index.tsx` — wiring de todos los nuevos estados y queries

---

## Funciones de DentCore cubiertas tras este sprint

| Función | Estado post-sprint |
|---|---|
| Ficha completa con campos administrativos | ✅ Fase 1 |
| Acciones rápidas centralizadas | ✅ Fase 2 |
| Recetas con firma y PDF | ✅ Fase 3 |
| Consentimientos y LOPD | ✅ Ya existe + Fase 2 |
| Odontograma diagnóstico / presupuesto / pendiente / realizado | ✅ Ya existe |
| Presupuestos con estados y cierre | ✅ Ya existe |
| Trabajo pendiente con cita asociada | ✅ Ya existe |
| Laboratorio: crear pedido, estados, alertas | ✅ Fase 4 |
| Historial cronológico completo | ✅ Fase 5 |
| Caja / facturación / cobros | ✅ Ya existe |
| Reportes en Admin | ✅ Ya existe |
| Tests de flujo integración | ✅ Fase 6 |

## Funciones no incluidas en este sprint (backlog)
- Fotografía del paciente (upload de foto — `foto_path` existe en modelo, falta UI de upload)
- Cuestionarios médicos estructurados (el designer puede crear documentos tipo cuestionario, pero no hay formulario estructurado con campos tipados)
- Envío real de WhatsApp (la acción abre wa.me, no hay integración API de WhatsApp Business)
- Módulo de gastos de clínica (mencionado como "crear gasto" desde laboratorio — no existe aún)
- Portal de paciente (modelo existe, pendiente de completar)
