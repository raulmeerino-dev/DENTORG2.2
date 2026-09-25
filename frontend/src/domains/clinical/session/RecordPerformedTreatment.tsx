import { useRef, useState } from 'react';
import type {
  ApiPaciente,
  Cita,
  Doctor,
  HistorialClinico,
  SesionClinicaItem,
  SesionClinicaItemCreateInput,
  SesionTratamientoRealizadoInput,
  TratamientoCatalogo,
} from '../../../api/types';
import { Dialog } from '../../../design-system/Dialog';
import { clinicDate, clinicDateKey, clinicTime } from '../../../shared/time/clinicTime';
import { sessionVisit } from './sessionTreatments';
import { CatalogTreatmentSelector } from '../treatment-selection/TreatmentSelector';
import './treatment-flow.css';

export function RecordPerformedTreatment({
  paciente,
  citas,
  doctores,
  doctorId,
  tratamientos,
  target,
  onCreateItem,
  onSave,
  onClose,
}: {
  paciente: ApiPaciente;
  citas: Cita[];
  doctores: Doctor[];
  doctorId?: string | null;
  tratamientos: TratamientoCatalogo[];
  target?: { pieza: string; caras: string } | null;
  onCreateItem: (input: SesionClinicaItemCreateInput) => Promise<SesionClinicaItem>;
  onSave: (input: SesionTratamientoRealizadoInput) => Promise<HistorialClinico>;
  onClose: () => void;
}) {
  const visit = sessionVisit(citas, doctorId);
  const [citaId, setCitaId] = useState(visit?.id ?? '');
  const [professional, setProfessional] = useState(
    visit?.doctor_id ?? doctorId ?? (doctores.length === 1 ? doctores[0].id : ''),
  );
  const [date, setDate] = useState(clinicDate(new Date()));
  const [search, setSearch] = useState('');
  const [treatmentId, setTreatmentId] = useState('');
  const [piece, setPiece] = useState(target?.pieza ?? '');
  const [surfaces, setSurfaces] = useState(target?.caras ?? '');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Retain the persisted item across retries: completion is idempotent by item.
  const itemId = useRef<string | null>(null);
  const saving = useRef(false);
  const treatment = tratamientos.find((item) => item.id === treatmentId);
  const sessions = citas.filter(
    (cita) =>
      clinicDateKey(cita.fecha_hora) === date &&
      !['anulada', 'cancelada', 'no_presentado', 'falta', 'cancelled_by_patient'].includes(cita.estado),
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!treatment || !professional || saving.current) return;
    if (piece && !/^(?:[1-4][1-8]|[5-8][1-5])$/.test(piece)) {
      setError('Indica una pieza FDI válida.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!itemId.current) {
        const item = await onCreateItem({
          tratamiento_id: treatment.id,
          doctor_id: professional,
          cita_id: citaId || null,
          titulo: treatment.nombre,
          pieza_dental: piece ? Number(piece) : null,
          caras: surfaces || null,
          observaciones: notes.trim() || null,
          estado: 'en_curso',
          origen: 'manual',
        });
        itemId.current = item.id;
      }
      await onSave({
        paciente_id: paciente.id,
        tratamiento_id: treatment.id,
        doctor_id: professional,
        cita_id: citaId || null,
        sesion_item_id: itemId.current,
        fecha: date,
        pieza_dental: piece ? Number(piece) : null,
        caras: surfaces || null,
        procedimiento: treatment.nombre,
        observaciones: notes.trim() || null,
        importe: Number(amount),
        origen: 'manual',
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar el tratamiento. Puedes reintentar sin duplicarlo.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      label="Añadir tratamiento realizado"
      onClose={onClose}
      closeDisabled={busy}
      className="dc-performed-dialog"
    >
      <form onSubmit={save}>
        <header className="modal-titlebar">
          <strong>Añadir tratamiento realizado</strong>
          <button type="button" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </header>
        <p className="performed-context">
          {paciente.nombre} {paciente.apellidos} · Registro clínico sin presupuesto previo
        </p>
        <fieldset disabled={busy} className="performed-fields">
          <div className="wide">
            <CatalogTreatmentSelector items={tratamientos} query={search} selectedId={treatmentId} disabled={busy} showPrice
              label="Tratamiento" placeholder="Nombre o código del tratamiento"
              onQueryChange={query => { setSearch(query); setTreatmentId(''); }}
              onSelect={item => { setTreatmentId(item.id); setSearch(item.nombre); setAmount(item.precio); }} />
          </div>
          <label>
            Pieza FDI
            <input
              inputMode="numeric"
              maxLength={2}
              required={treatment?.requiere_pieza}
              value={piece}
              onChange={(event) => setPiece(event.target.value.replace(/\D/g, ''))}
              placeholder="24"
            />
          </label>
          <label>
            Superficies
            <input
              required={treatment?.requiere_caras}
              value={surfaces}
              maxLength={6}
              onChange={(event) =>
                setSurfaces([...new Set(event.target.value.toUpperCase().replace(/[^MODVLP]/g, ''))].join(''))
              }
              placeholder="O, M, D…"
            />
          </label>
          <label>
            Profesional
            <select required value={professional} onChange={(event) => setProfessional(event.target.value)}>
              <option value="">Seleccionar profesional</option>
              {doctores
                .filter((item) => item.activo || item.id === professional)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Fecha
            <input
              type="date"
              required
              max={clinicDate(new Date())}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setCitaId('');
              }}
            />
          </label>
          <label>
            Sesión
            <select
              value={citaId}
              onChange={(event) => {
                setCitaId(event.target.value);
                const cita = citas.find((item) => item.id === event.target.value);
                if (cita) setProfessional(cita.doctor_id);
              }}
            >
              <option value="">Acto sin cita vinculada</option>
              {sessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {clinicTime(item.fecha_hora)} · {item.motivo || 'Visita'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Importe (€)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="wide">
            Observación clínica
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </fieldset>
        {error && (
          <p className="session-save-error" role="alert">
            {error}
          </p>
        )}
        <footer className="performed-footer">
          <small>
            {amount === '0' ? 'Cortesía · 0 €' : 'Quedará pendiente de facturar.'} No genera factura ni cobro.
          </small>
          <button type="submit" className="primary-action" disabled={busy || !treatment || !professional}>
            {busy ? 'Registrando…' : 'Guardar tratamiento realizado'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
