import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ApiPaciente, Doctor, RecetaClinica, RecetaCreateInput } from '../../types/api';
import { formatDate, fullName } from '../../lib/utils';
import { SignaturePad } from './Consentimientos';

interface RecetaFormState {
  doctor_id: string;
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
  firma_data_url: string | null;
}

function emptyForm(defaultDoctorId: string): RecetaFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    doctor_id: defaultDoctorId,
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
    firma_data_url: null,
  };
}

function stripPayload(form: RecetaFormState): RecetaCreateInput {
  const opt = (value: string) => (value.trim() ? value.trim() : null);
  return {
    doctor_id: form.doctor_id,
    medicamento: form.medicamento.trim(),
    posologia: form.posologia.trim(),
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
    firma_data_url: form.firma_data_url,
  };
}

export function RecetaModal({
  paciente,
  doctores,
  saving = false,
  errorMessage,
  onClose,
  onSubmit,
}: {
  paciente: ApiPaciente;
  doctores: Doctor[];
  saving?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (data: RecetaCreateInput) => void;
}) {
  const defaultDoctor = paciente.doctor_habitual_id
    ?? doctores[0]?.id
    ?? '';
  const [form, setForm] = useState<RecetaFormState>(() => emptyForm(defaultDoctor));
  const [showFirma, setShowFirma] = useState(false);

  function setField<K extends keyof RecetaFormState>(field: K, value: RecetaFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.medicamento.trim() || !form.posologia.trim() || !form.doctor_id) return;
    onSubmit(stripPayload(form));
  }

  const canSubmit = Boolean(form.medicamento.trim() && form.posologia.trim() && form.doctor_id) && !saving;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="receta-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal-titlebar">
          <strong>Nueva receta — {fullName(paciente)}</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="receta-grid">
          <label className="wide">Medicamento *
            <input
              autoFocus
              value={form.medicamento}
              onChange={(event) => setField('medicamento', event.target.value)}
              required
              placeholder="Ej. Ibuprofeno 600 mg"
            />
          </label>
          <label>Principio activo
            <input value={form.principio_activo} onChange={(event) => setField('principio_activo', event.target.value)} />
          </label>
          <label>Forma farmacéutica
            <input value={form.forma_farmaceutica} onChange={(event) => setField('forma_farmaceutica', event.target.value)} placeholder="Comprimido, jarabe..." />
          </label>
          <label>Vía de administración
            <input value={form.via_administracion} onChange={(event) => setField('via_administracion', event.target.value)} placeholder="Oral, tópica..." />
          </label>
          <label>Unidades
            <input value={form.unidades} onChange={(event) => setField('unidades', event.target.value)} placeholder="2 envases" />
          </label>
          <label>Duración
            <input value={form.duracion} onChange={(event) => setField('duracion', event.target.value)} placeholder="10 días" />
          </label>

          <label className="wide">Posología *
            <textarea
              value={form.posologia}
              onChange={(event) => setField('posologia', event.target.value)}
              required
              rows={2}
              placeholder="1 comprimido cada 8 horas con comida"
            />
          </label>
          <label className="wide">Pauta
            <input value={form.pauta} onChange={(event) => setField('pauta', event.target.value)} placeholder="Si dolor; máximo 7 días" />
          </label>

          <label>Doctor prescriptor *
            <select
              value={form.doctor_id}
              onChange={(event) => setField('doctor_id', event.target.value)}
              required
            >
              <option value="">—</option>
              {doctores.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
              ))}
            </select>
          </label>
          <label>Fecha prescripción
            <input type="date" value={form.fecha_prescripcion} onChange={(event) => setField('fecha_prescripcion', event.target.value)} />
          </label>
          <label>Fecha dispensación
            <input type="date" value={form.fecha_dispensacion} onChange={(event) => setField('fecha_dispensacion', event.target.value)} />
          </label>

          <label className="wide">Diagnóstico
            <textarea value={form.diagnostico} onChange={(event) => setField('diagnostico', event.target.value)} rows={2} />
          </label>
          <label className="wide">Instrucciones al paciente
            <textarea value={form.instrucciones_paciente} onChange={(event) => setField('instrucciones_paciente', event.target.value)} rows={2} />
          </label>
          <label className="wide">Instrucciones a farmacia
            <textarea value={form.instrucciones_farmacia} onChange={(event) => setField('instrucciones_farmacia', event.target.value)} rows={2} />
          </label>
        </div>

        <details className="receta-firma-block" data-testid="receta-firma" open={showFirma} onToggle={(event) => setShowFirma((event.target as HTMLDetailsElement).open)}>
          <summary>Firma del doctor (opcional)</summary>
          <p className="receta-help">Trazo en pad. Se incluye en el PDF si la guardas.</p>
          {showFirma && (
            <SignaturePad onChange={(dataUrl) => setField('firma_data_url', dataUrl)} />
          )}
        </details>

        {errorMessage && <div className="inline-alert" role="alert">{errorMessage}</div>}

        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={!canSubmit}>
            {saving ? 'Generando...' : 'Crear receta'}
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
          <p className="recetas-empty">Este paciente aún no tiene recetas.</p>
        ) : (
          <ul className="recetas-list" aria-label="Recetas del paciente">
            {recetas.map((receta) => (
              <li key={receta.id}>
                <div>
                  <strong>{receta.medicamento}</strong>
                  <small>{receta.posologia}</small>
                  <em>
                    {formatDate(receta.fecha_prescripcion)}
                    {receta.doctor?.nombre ? ` · ${receta.doctor.nombre}` : ''}
                    {receta.firma_data_url ? ' · firmada' : ''}
                  </em>
                </div>
                <button type="button" onClick={() => onAbrirPdf(receta)}>Ver PDF</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
