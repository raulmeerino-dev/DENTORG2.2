import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type {
  ApiPaciente,
  Doctor,
  RecetaClinica,
  RecetaCreateInput,
  RecetaPlantilla,
  RecetaProviderStatus,
} from '../../types/api';
import { formatDate, fullName } from '../../lib/utils';
import { SignaturePad } from './Consentimientos';

export type RecetaSubmitAction = 'draft' | 'emit_local' | 'send_provider';

interface RecetaFormState {
  doctor_id: string;
  plantilla_id: string;
  medicamento: string;
  principio_activo: string;
  forma_farmaceutica: string;
  via_administracion: string;
  unidades: string;
  duracion: string;
  posologia: string;
  pauta: string;
  diagnostico: string;
  instrucciones_paciente: string;
  instrucciones_farmacia: string;
  fecha_prescripcion: string;
  fecha_dispensacion: string;
  prescriptor_num_colegiado: string;
  prescriptor_colegio: string;
  prescriptor_provincia: string;
  prescriptor_especialidad: string;
  prescriptor_nif: string;
  firma_data_url: string | null;
}

interface PlantillaUploadState {
  archivo: File | null;
  nombre: string;
  requiere_dni: boolean;
  requiere_fecha_nacimiento: boolean;
}

export interface RecetaSubmitPayload {
  data: RecetaCreateInput;
  action: RecetaSubmitAction;
}

function emptyForm(defaultDoctorId: string, defaultPlantillaId: string, defaultEspecialidad: string): RecetaFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    doctor_id: defaultDoctorId,
    plantilla_id: defaultPlantillaId,
    medicamento: '',
    principio_activo: '',
    forma_farmaceutica: '',
    via_administracion: '',
    unidades: '',
    duracion: '',
    posologia: '',
    pauta: '',
    diagnostico: '',
    instrucciones_paciente: '',
    instrucciones_farmacia: '',
    fecha_prescripcion: today,
    fecha_dispensacion: '',
    prescriptor_num_colegiado: '',
    prescriptor_colegio: '',
    prescriptor_provincia: '',
    prescriptor_especialidad: defaultEspecialidad,
    prescriptor_nif: '',
    firma_data_url: null,
  };
}

function stripPayload(form: RecetaFormState): RecetaCreateInput {
  const opt = (value: string) => (value.trim() ? value.trim() : null);
  return {
    doctor_id: form.doctor_id,
    plantilla_id: opt(form.plantilla_id),
    medicamento: opt(form.medicamento),
    posologia: opt(form.posologia),
    principio_activo: opt(form.principio_activo),
    forma_farmaceutica: opt(form.forma_farmaceutica),
    via_administracion: opt(form.via_administracion),
    unidades: opt(form.unidades),
    duracion: opt(form.duracion),
    pauta: opt(form.pauta),
    diagnostico: opt(form.diagnostico),
    instrucciones_paciente: opt(form.instrucciones_paciente),
    instrucciones_farmacia: opt(form.instrucciones_farmacia),
    fecha_prescripcion: form.fecha_prescripcion || null,
    fecha_dispensacion: form.fecha_dispensacion || null,
    prescriptor_num_colegiado: opt(form.prescriptor_num_colegiado),
    prescriptor_colegio: opt(form.prescriptor_colegio),
    prescriptor_provincia: opt(form.prescriptor_provincia),
    prescriptor_especialidad: opt(form.prescriptor_especialidad),
    prescriptor_nif: opt(form.prescriptor_nif),
    firma_data_url: form.firma_data_url,
  };
}

function estadoLabel(estado: RecetaClinica['estado']) {
  const labels: Record<RecetaClinica['estado'], string> = {
    borrador: 'Borrador',
    pendiente_validacion: 'Pendiente de datos',
    emitida_local: 'Emitida local',
    enviada_proveedor: 'Enviada a proveedor',
    certificada: 'Validada por proveedor',
    rechazada: 'Rechazada',
    anulada: 'Anulada',
    dispensada: 'Dispensada',
  };
  return labels[estado] ?? estado;
}

function certificationLabel(receta: RecetaClinica) {
  if (receta.certificada_real) return 'Certificada real';
  if (receta.provider_mode === 'mock') return 'Mock no certificado';
  if (receta.provider_mode === 'real' && receta.estado === 'enviada_proveedor') return 'Pendiente proveedor';
  if (receta.estado === 'emitida_local') return 'Local no certificada';
  return 'No certificada';
}

export function RecetaModal({
  paciente,
  doctores,
  plantillas = [],
  providerStatus,
  saving = false,
  importingPlantilla = false,
  errorMessage,
  onClose,
  onSubmit,
  onImportPlantilla,
}: {
  paciente: ApiPaciente;
  doctores: Doctor[];
  plantillas?: RecetaPlantilla[];
  providerStatus?: RecetaProviderStatus | null;
  saving?: boolean;
  importingPlantilla?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (payload: RecetaSubmitPayload) => void;
  onImportPlantilla?: (input: PlantillaUploadState & { archivo: File }) => void;
}) {
  const defaultDoctor = paciente.doctor_habitual_id
    ?? doctores[0]?.id
    ?? '';
  const defaultDoctorData = doctores.find((doctor) => doctor.id === defaultDoctor);
  const [form, setForm] = useState<RecetaFormState>(() => emptyForm(
    defaultDoctor,
    plantillas[0]?.id ?? '',
    defaultDoctorData?.especialidad ?? '',
  ));
  const [showFirma, setShowFirma] = useState(false);
  const [plantillaUpload, setPlantillaUpload] = useState<PlantillaUploadState>({
    archivo: null,
    nombre: '',
    requiere_dni: true,
    requiere_fecha_nacimiento: false,
  });

  const plantillaSeleccionada = useMemo(
    () => plantillas.find((plantilla) => plantilla.id === form.plantilla_id) ?? null,
    [form.plantilla_id, plantillas],
  );
  const providerWarning = providerStatus?.warning
    ?? 'Receta no certificada. Modo local/mock o proveedor real no configurado.';
  const readyToIssue = Boolean(
    form.doctor_id
    && form.plantilla_id
    && form.medicamento.trim()
    && form.posologia.trim()
    && form.unidades.trim()
    && form.duracion.trim()
    && form.prescriptor_num_colegiado.trim()
    && form.prescriptor_colegio.trim()
    && form.prescriptor_provincia.trim(),
  );
  const canSaveDraft = Boolean(form.doctor_id) && !saving;
  const canEmitLocal = readyToIssue && !saving;
  const canSendProvider = readyToIssue && Boolean(providerStatus?.provider_available) && !saving;

  function setField<K extends keyof RecetaFormState>(field: K, value: RecetaFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleDoctorChange(doctorId: string) {
    const doctor = doctores.find((item) => item.id === doctorId);
    setForm((prev) => ({
      ...prev,
      doctor_id: doctorId,
      prescriptor_especialidad: prev.prescriptor_especialidad || doctor?.especialidad || '',
    }));
  }

  function submit(action: RecetaSubmitAction) {
    if (action === 'draft' && !canSaveDraft) return;
    if (action === 'emit_local' && !canEmitLocal) return;
    if (action === 'send_provider' && !canSendProvider) return;
    onSubmit({ data: stripPayload(form), action });
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    submit('emit_local');
  }

  function handlePlantillaFile(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0] ?? null;
    setPlantillaUpload((prev) => ({
      ...prev,
      archivo,
      nombre: prev.nombre || archivo?.name.replace(/\.[^.]+$/, '') || '',
    }));
  }

  function importPlantilla() {
    if (!plantillaUpload.archivo || !plantillaUpload.nombre.trim() || !onImportPlantilla) return;
    onImportPlantilla({
      ...plantillaUpload,
      archivo: plantillaUpload.archivo,
      nombre: plantillaUpload.nombre.trim(),
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="receta-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={onFormSubmit}
      >
        <header className="modal-titlebar">
          <strong>Nueva receta - {fullName(paciente)}</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="inline-alert receta-provider-alert" role="status">
          {providerWarning}
        </div>

        <section className="receta-template-panel" aria-label="Plantilla de receta">
          <div className="receta-grid">
            <label className="wide">Plantilla oficial/importada *
              <select
                value={form.plantilla_id}
                onChange={(event) => setField('plantilla_id', event.target.value)}
                required
              >
                <option value="">Seleccione plantilla</option>
                {plantillas.map((plantilla) => (
                  <option key={plantilla.id} value={plantilla.id}>{plantilla.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          {plantillaSeleccionada ? (
            <p className="receta-help">
              {plantillaSeleccionada.nombre_original} - {plantillaSeleccionada.mime_type}
              {plantillaSeleccionada.requiere_dni ? ' - requiere DNI/NIE' : ''}
              {plantillaSeleccionada.requiere_fecha_nacimiento ? ' - requiere fecha de nacimiento' : ''}
            </p>
          ) : (
            <p className="receta-help">Sin plantilla seleccionada solo se puede guardar borrador.</p>
          )}

          {onImportPlantilla && (
            <div className="receta-template-upload">
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={handlePlantillaFile} />
              <input
                value={plantillaUpload.nombre}
                onChange={(event) => setPlantillaUpload((prev) => ({ ...prev, nombre: event.target.value }))}
                placeholder="Nombre visible de plantilla"
                aria-label="Nombre de plantilla"
              />
              <label>
                <input
                  type="checkbox"
                  checked={plantillaUpload.requiere_dni}
                  onChange={(event) => setPlantillaUpload((prev) => ({ ...prev, requiere_dni: event.target.checked }))}
                />
                DNI/NIE
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={plantillaUpload.requiere_fecha_nacimiento}
                  onChange={(event) => setPlantillaUpload((prev) => ({ ...prev, requiere_fecha_nacimiento: event.target.checked }))}
                />
                Fecha nac.
              </label>
              <button
                type="button"
                onClick={importPlantilla}
                disabled={!plantillaUpload.archivo || !plantillaUpload.nombre.trim() || importingPlantilla}
              >
                {importingPlantilla ? 'Importando...' : 'Importar'}
              </button>
            </div>
          )}
        </section>

        <div className="receta-grid">
          <label className="wide">Medicamento *
            <input
              autoFocus
              value={form.medicamento}
              onChange={(event) => setField('medicamento', event.target.value)}
              placeholder="Ej. Ibuprofeno 600 mg"
            />
          </label>
          <label>Principio activo
            <input value={form.principio_activo} onChange={(event) => setField('principio_activo', event.target.value)} />
          </label>
          <label>Forma farmaceutica
            <input value={form.forma_farmaceutica} onChange={(event) => setField('forma_farmaceutica', event.target.value)} placeholder="Comprimido, jarabe..." />
          </label>
          <label>Via de administracion
            <input value={form.via_administracion} onChange={(event) => setField('via_administracion', event.target.value)} placeholder="Oral, topica..." />
          </label>
          <label>Unidades/envases *
            <input value={form.unidades} onChange={(event) => setField('unidades', event.target.value)} placeholder="2 envases" />
          </label>
          <label>Duracion *
            <input value={form.duracion} onChange={(event) => setField('duracion', event.target.value)} placeholder="10 dias" />
          </label>

          <label className="wide">Posologia *
            <textarea
              value={form.posologia}
              onChange={(event) => setField('posologia', event.target.value)}
              rows={2}
              placeholder="1 comprimido cada 8 horas con comida"
            />
          </label>
          <label className="wide">Pauta
            <input value={form.pauta} onChange={(event) => setField('pauta', event.target.value)} placeholder="Si dolor; maximo 7 dias" />
          </label>

          <label>Doctor prescriptor *
            <select
              value={form.doctor_id}
              onChange={(event) => handleDoctorChange(event.target.value)}
              required
            >
              <option value="">-</option>
              {doctores.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
              ))}
            </select>
          </label>
          <label>Num. colegiado *
            <input value={form.prescriptor_num_colegiado} onChange={(event) => setField('prescriptor_num_colegiado', event.target.value)} />
          </label>
          <label>Colegio *
            <input value={form.prescriptor_colegio} onChange={(event) => setField('prescriptor_colegio', event.target.value)} />
          </label>
          <label>Provincia *
            <input value={form.prescriptor_provincia} onChange={(event) => setField('prescriptor_provincia', event.target.value)} />
          </label>
          <label>Especialidad
            <input value={form.prescriptor_especialidad} onChange={(event) => setField('prescriptor_especialidad', event.target.value)} />
          </label>
          <label>NIF prescriptor
            <input value={form.prescriptor_nif} onChange={(event) => setField('prescriptor_nif', event.target.value)} />
          </label>
          <label>Fecha prescripcion
            <input type="date" value={form.fecha_prescripcion} onChange={(event) => setField('fecha_prescripcion', event.target.value)} />
          </label>
          <label>Fecha dispensacion
            <input type="date" value={form.fecha_dispensacion} onChange={(event) => setField('fecha_dispensacion', event.target.value)} />
          </label>

          <label className="wide">Diagnostico
            <textarea value={form.diagnostico} onChange={(event) => setField('diagnostico', event.target.value)} rows={2} />
          </label>
          <label className="wide">Instrucciones al paciente
            <textarea value={form.instrucciones_paciente} onChange={(event) => setField('instrucciones_paciente', event.target.value)} rows={2} />
          </label>
          <label className="wide">Instrucciones a farmacia
            <textarea value={form.instrucciones_farmacia} onChange={(event) => setField('instrucciones_farmacia', event.target.value)} rows={2} />
          </label>
        </div>

        <section className="receta-preview" aria-label="Resumen de receta">
          <strong>Vista previa de datos</strong>
          <span>{form.medicamento.trim() || 'Medicamento pendiente'}</span>
          <small>{form.posologia.trim() || 'Posologia pendiente'}</small>
          <em>Se archivara como PDF final solo al emitir localmente o al recibir PDF del proveedor.</em>
        </section>

        <details className="receta-firma-block" data-testid="receta-firma" open={showFirma} onToggle={(event) => setShowFirma((event.target as HTMLDetailsElement).open)}>
          <summary>Firma del doctor (opcional)</summary>
          <p className="receta-help">Se guarda en el borrador y se incluye en el PDF local si se emite.</p>
          {showFirma && (
            <SignaturePad onChange={(dataUrl) => setField('firma_data_url', dataUrl)} />
          )}
        </details>

        {errorMessage && <div className="inline-alert" role="alert">{errorMessage}</div>}

        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" disabled={!canSaveDraft} onClick={() => submit('draft')}>
            {saving ? 'Guardando...' : 'Guardar borrador'}
          </button>
          <button type="submit" disabled={!canEmitLocal}>
            {saving ? 'Emitiendo...' : 'Emitir local'}
          </button>
          <button type="button" disabled={!canSendProvider} onClick={() => submit('send_provider')}>
            Enviar a proveedor
          </button>
        </footer>
      </form>
    </div>
  );
}

export function HistorialRecetasDrawer({
  paciente,
  recetas,
  loading = false,
  onClose,
  onAbrirPdf,
  onCrearNueva,
}: {
  paciente: ApiPaciente;
  recetas: RecetaClinica[];
  loading?: boolean;
  onClose: () => void;
  onAbrirPdf: (receta: RecetaClinica) => void;
  onCrearNueva: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="recetas-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-titlebar">
          <strong>Recetas de {fullName(paciente)}</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>
        <div className="recetas-drawer-actions">
          <button type="button" className="primary-action" onClick={onCrearNueva}>+ Nueva receta</button>
        </div>
        {loading ? (
          <p className="recetas-empty">Cargando recetas...</p>
        ) : recetas.length === 0 ? (
          <p className="recetas-empty">Este paciente aun no tiene recetas.</p>
        ) : (
          <ul className="recetas-list" aria-label="Recetas del paciente">
            {recetas.map((receta) => (
              <li key={receta.id}>
                <div>
                  <strong>{receta.medicamento || 'Borrador sin medicamento'}</strong>
                  <small>{receta.posologia || 'Sin posologia registrada'}</small>
                  <em>
                    {formatDate(receta.fecha_prescripcion)}
                    {receta.doctor?.nombre ? ` - ${receta.doctor.nombre}` : ''}
                    {` - ${estadoLabel(receta.estado)}`}
                    {` - ${certificationLabel(receta)}`}
                  </em>
                  {(receta.external_id || receta.provider_error) && (
                    <span className="receta-provider-meta">
                      {receta.external_id ? `ID externo: ${receta.external_id}` : ''}
                      {receta.provider_error ? ` Error proveedor: ${receta.provider_error}` : ''}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onAbrirPdf(receta)}
                  disabled={!receta.pdf_documento_id}
                  title={receta.pdf_documento_id ? 'Abrir PDF final' : 'La receta aun no tiene PDF final'}
                >
                  {receta.pdf_documento_id ? 'PDF final' : 'Sin PDF'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
