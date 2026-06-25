import type { FormEvent } from 'react';
import { AlertTriangle, Bot, Calendar, Check, Clock, Loader2, Mic, Minus, Pencil, Plus, Search, Send, ShieldCheck, Stethoscope, Trash2, UserRound, X } from 'lucide-react';
import type { AssistantBudgetLine, AssistantContextSnapshot, AssistantDraftEditableField, AssistantIntent, AssistantMessage, AssistantPatientOption, AssistantPhase, AssistantProfessionalOption, AssistantSlot, AssistantTreatmentOption } from './types';

function phaseLabel(phase: AssistantPhase) {
  const labels: Record<AssistantPhase, string> = {
    idle: 'Listo',
    listening: 'Escuchando',
    transcribing: 'Transcribiendo',
    interpreting: 'Interpretando',
    draft: 'Borrador',
    needs_clarification: 'Aclaracion',
    awaiting_confirmation: 'Confirmacion',
    ready: 'Listo',
    executing: 'Ejecutando',
    completed: 'Completado',
    cancelled: 'Cancelado',
    error: 'Error',
  };
  return labels[phase];
}

function fieldValue(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return 'Pendiente';
  return String(value);
}

function moneyValue(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toFixed(2);
}

type DraftFieldState = 'resolved' | 'missing' | 'ambiguous' | 'not_found';

function stateLabel(state: DraftFieldState) {
  const labels: Record<DraftFieldState, string> = {
    resolved: 'Resuelto',
    missing: 'Pendiente',
    ambiguous: 'Ambiguo',
    not_found: 'No encontrado',
  };
  return labels[state];
}

function draftFieldState(draft: AssistantIntent, field: AssistantDraftEditableField) {
  const resolution = draft.operationalResolution;
  if (field === 'patient' && resolution?.patientResolution) return resolution.patientResolution.status;
  if (field === 'treatment' && resolution?.treatmentResolution) return resolution.treatmentResolution.status;
  if (field === 'professional' && resolution?.professionalResolution) {
    if (resolution.professionalResolution.flexible && !draft.fields.professionalId) return 'resolved';
    return resolution.professionalResolution.status;
  }
  if (field === 'date' && resolution?.dateResolution) return resolution.dateResolution.status === 'resolved' ? 'resolved' : resolution.dateResolution.status;
  if (field === 'time' && resolution?.slotsResolution) {
    if (draft.fields.slot?.fechaHora) return 'resolved';
    if (resolution.slotsResolution.status === 'found') return 'ambiguous';
    if (resolution.slotsResolution.status === 'no_slots') return 'not_found';
    if (resolution.slotsResolution.status === 'missing_data') return 'missing';
  }
  if (field === 'patient' && (draft.missingFields.includes('patientId') || (draft.fields.patientOptions?.length && !draft.fields.patientId))) return 'missing';
  if (field === 'treatment' && (draft.missingFields.includes('treatmentType') || (draft.fields.treatmentOptions?.length && !draft.fields.treatmentId))) return 'missing';
  if (field === 'professional' && (draft.missingFields.includes('professional') || (draft.fields.professionalOptions?.length && !draft.fields.professionalId))) return 'missing';
  if (field === 'date' && draft.missingFields.includes('dateRange')) return 'missing';
  if (field === 'time' && draft.missingFields.includes('slot')) return 'missing';
  return 'resolved';
}

function DraftField({
  label,
  value,
  state,
  type = 'text',
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  state: DraftFieldState;
  type?: 'text' | 'number';
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`assistant-draft-field ${state}`}>
      <b>{label}<em>{stateLabel(state)}</em></b>
      <input
        type={type}
        value={value}
        min={type === 'number' ? 5 : undefined}
        step={type === 'number' ? 5 : undefined}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PatientOptions({
  draft,
  onSelectPatientOption,
}: {
  draft: AssistantIntent;
  onSelectPatientOption: (option: AssistantPatientOption) => void;
}) {
  const options = draft.fields.patientOptions ?? [];
  if (!options.length || draft.fields.patientId) return null;
  return (
    <div className="assistant-patient-options">
      {options.map((option) => (
        <button type="button" key={option.id} onClick={() => onSelectPatientOption(option)}>
          <strong>{option.displayName}</strong>
          <span>{option.historyNumber ? `H${option.historyNumber}` : 'Sin historia'}{option.phone ? ` · ${option.phone}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

function ProfessionalOptions({
  draft,
  onSelectProfessionalOption,
}: {
  draft: AssistantIntent;
  onSelectProfessionalOption: (option: AssistantProfessionalOption) => void;
}) {
  const options = draft.fields.professionalOptions ?? [];
  if (!options.length || draft.fields.professionalId) return null;
  return (
    <div className="assistant-patient-options">
      {options.map((option) => (
        <button type="button" key={option.id} onClick={() => onSelectProfessionalOption(option)}>
          <strong>{option.displayName}</strong>
          <span>{option.specialty ?? 'Profesional activo'}</span>
        </button>
      ))}
    </div>
  );
}

function SlotOptions({
  draft,
  onSelectSlot,
}: {
  draft: AssistantIntent;
  onSelectSlot: (slot: AssistantSlot) => void;
}) {
  const slots = draft.fields.suggestedSlots ?? [];
  if (!slots.length) return null;
  return (
    <div className="assistant-slot-options" aria-label="Huecos sugeridos">
      {slots.map((slot, index) => (
        <button
          type="button"
          className={draft.fields.slot?.fechaHora === slot.fechaHora ? 'active' : ''}
          key={`${slot.fechaHora}-${slot.doctorId}`}
          onClick={() => onSelectSlot(slot)}
        >
          <strong>{index + 1}. {slot.fechaHora?.slice(0, 16).replace('T', ' ') ?? slot.label}</strong>
          <span>{slot.doctorName ?? 'Profesional'} · {slot.durationMinutes ?? draft.fields.durationMinutes ?? 30} min</span>
        </button>
      ))}
    </div>
  );
}

function TreatmentOptions({
  draft,
  onSelectTreatmentOption,
}: {
  draft: AssistantIntent;
  onSelectTreatmentOption: (option: AssistantTreatmentOption) => void;
}) {
  const options = draft.fields.treatmentOptions ?? [];
  if (!options.length || draft.fields.treatmentId) return null;
  return (
    <div className="assistant-patient-options">
      {options.map((option) => (
        <button type="button" key={option.id} onClick={() => onSelectTreatmentOption(option)}>
          <strong>{option.displayName}</strong>
          <span>{option.code ?? option.familyName ?? 'Tratamiento activo'}</span>
        </button>
      ))}
    </div>
  );
}

function BudgetTreatmentOptions({
  line,
  onSelectTreatmentOption,
}: {
  line: AssistantBudgetLine;
  onSelectTreatmentOption: (option: AssistantTreatmentOption) => void;
}) {
  const options = line.treatmentOptions ?? [];
  if (!options.length || line.treatmentId) return null;
  return (
    <div className="assistant-patient-options assistant-budget-treatment-options">
      {options.map((option) => (
        <button type="button" key={option.id} onClick={() => onSelectTreatmentOption(option)}>
          <strong>{option.displayName}</strong>
          <span>{option.code ?? option.familyName ?? 'Tratamiento activo'}</span>
        </button>
      ))}
    </div>
  );
}

function BudgetDraftCard({
  draft,
  onConfirmDraft,
  onCancelDraft,
  onSelectPatientOption,
  onEditDraftField,
  onBudgetLineChange,
  onAddBudgetLine,
  onRemoveBudgetLine,
  onSelectBudgetTreatmentOption,
  onDraftPrompt,
}: {
  draft: AssistantIntent;
  onConfirmDraft: () => void;
  onCancelDraft: () => void;
  onSelectPatientOption: (option: AssistantPatientOption) => void;
  onEditDraftField: (field: AssistantDraftEditableField, value: string) => void;
  onBudgetLineChange: (index: number, patch: Partial<AssistantBudgetLine>) => void;
  onAddBudgetLine: () => void;
  onRemoveBudgetLine: (index?: number) => void;
  onSelectBudgetTreatmentOption: (index: number, option: AssistantTreatmentOption) => void;
  onDraftPrompt: (value: string) => void;
}) {
  const lines = draft.fields.budgetLines ?? [];
  const canConfirm = draft.requiresConfirmation && !draft.needsClarification && draft.operationalCanConfirm !== false;
  const patientValue = draft.fields.patientDisplayName ?? draft.fields.patientQuery ?? '';
  const total = draft.fields.budgetTotal ?? lines.reduce((sum, line) => sum + (line.total ?? 0), 0);

  return (
    <section className={`assistant-draft-card assistant-budget-card risk-${draft.riskLevel}`} aria-label="Borrador de presupuesto">
      <header>
        <div>
          <span>Presupuesto en borrador</span>
          <strong>{draft.summary}</strong>
        </div>
        <em><ShieldCheck size={13} strokeWidth={2.1} /> Requiere confirmacion</em>
      </header>

      <div className="assistant-draft-grid assistant-budget-summary">
        <DraftField label="Paciente" value={patientValue} state={draftFieldState(draft, 'patient')} placeholder="Nombre del paciente" onChange={(value) => onEditDraftField('patient', value)} />
        <span className={`assistant-draft-state ${draft.needsClarification ? 'missing' : 'resolved'}`}><b>Estado</b>{draft.fields.budgetStatus ?? 'draft'}</span>
        <span className="assistant-draft-state resolved"><b>Lineas</b>{lines.length || 'Pendiente'}</span>
        <span className="assistant-draft-state resolved"><b>Total</b>{moneyValue(total) || 'Pendiente'}</span>
      </div>

      <PatientOptions draft={draft} onSelectPatientOption={onSelectPatientOption} />

      <div className="assistant-budget-lines" aria-label="Lineas del presupuesto">
        <div className="assistant-budget-line-head">
          <span>Tratamiento</span>
          <span>Pieza</span>
          <span>Cant.</span>
          <span>Precio</span>
          <span>Total</span>
          <span />
        </div>
        {lines.map((line, index) => {
          const state = line.resolutionStatus ?? (line.treatmentId ? 'resolved' : 'missing');
          return (
            <div className={`assistant-budget-line ${state}`} key={`${line.treatmentId ?? line.treatmentQuery ?? 'line'}-${index}`}>
              <input
                aria-label={`Tratamiento linea ${index + 1}`}
                value={line.treatmentName ?? line.treatmentQuery ?? ''}
                placeholder="Tratamiento"
                onChange={(event) => onBudgetLineChange(index, {
                  treatmentQuery: event.target.value,
                  treatmentId: null,
                  treatmentName: null,
                  unitPrice: null,
                  total: null,
                })}
              />
              <input
                aria-label={`Pieza linea ${index + 1}`}
                value={line.tooth ?? ''}
                placeholder="FDI"
                onChange={(event) => onBudgetLineChange(index, { tooth: event.target.value })}
              />
              <input
                aria-label={`Cantidad linea ${index + 1}`}
                type="number"
                min={1}
                value={line.quantity ?? 1}
                onChange={(event) => onBudgetLineChange(index, { quantity: Number(event.target.value) || 1 })}
              />
              <input
                aria-label={`Precio linea ${index + 1}`}
                type="number"
                min={0}
                step="0.01"
                value={line.unitPrice ?? ''}
                placeholder="0.00"
                onChange={(event) => onBudgetLineChange(index, { unitPrice: event.target.value === '' ? null : Number(event.target.value) })}
              />
              <output>{moneyValue(line.total)}</output>
              <button type="button" aria-label={`Quitar linea ${index + 1}`} title="Quitar linea" onClick={() => onRemoveBudgetLine(index)}>
                <Minus size={13} />
              </button>
              {line.missingFields?.length ? (
                <small>{line.missingFields.join(', ')}</small>
              ) : null}
              <BudgetTreatmentOptions line={line} onSelectTreatmentOption={(option) => onSelectBudgetTreatmentOption(index, option)} />
            </div>
          );
        })}
        {!lines.length && <p className="assistant-budget-empty">Sin lineas todavia.</p>}
      </div>

      {draft.clarificationQuestion && (
        <p className="assistant-clarification"><AlertTriangle size={14} strokeWidth={2} /> {draft.clarificationQuestion}</p>
      )}

      <div className="assistant-draft-actions" aria-label="Acciones rapidas del presupuesto">
        <button type="button" onClick={() => onDraftPrompt('Cambia el presupuesto: ')}><Pencil size={13} /> Editar</button>
        <button type="button" onClick={onAddBudgetLine}><Plus size={13} /> Anadir linea</button>
        <button type="button" onClick={() => onRemoveBudgetLine()} disabled={!lines.length}><Minus size={13} /> Quitar linea</button>
      </div>

      <footer>
        <button type="button" className="assistant-confirm" disabled={!canConfirm} onClick={onConfirmDraft}>
          <Check size={15} strokeWidth={2.2} /> Confirmar presupuesto
        </button>
        <button type="button" className="assistant-secondary" onClick={onCancelDraft}>
          <Trash2 size={15} strokeWidth={2.1} /> Cancelar
        </button>
      </footer>
    </section>
  );
}

function SimpleDraftCard({
  draft,
  title,
  valueLabel,
  value,
  onConfirmDraft,
  onCancelDraft,
  onEdit,
}: {
  draft: AssistantIntent;
  title: string;
  valueLabel: string;
  value: string;
  onConfirmDraft: () => void;
  onCancelDraft: () => void;
  onEdit: (value: string) => void;
}) {
  const canConfirm = draft.requiresConfirmation && !draft.needsClarification && draft.operationalCanConfirm !== false;
  return (
    <section className={`assistant-draft-card risk-${draft.riskLevel}`} aria-label={title}>
      <header>
        <div>
          <span>{title}</span>
          <strong>{draft.summary}</strong>
        </div>
        {draft.requiresConfirmation && <em><ShieldCheck size={13} strokeWidth={2.1} /> Requiere confirmacion</em>}
      </header>
      <div className="assistant-draft-grid">
        <DraftField label={valueLabel} value={value} state={value ? 'resolved' : 'missing'} placeholder={valueLabel} onChange={onEdit} />
        <span className={`assistant-draft-state ${draft.needsClarification ? 'missing' : 'resolved'}`}><b>Estado</b>{draft.needsClarification ? 'Faltan datos' : 'Pendiente de confirmar'}</span>
      </div>
      {draft.clarificationQuestion && (
        <p className="assistant-clarification"><AlertTriangle size={14} strokeWidth={2} /> {draft.clarificationQuestion}</p>
      )}
      <footer>
        {draft.requiresConfirmation && (
          <button type="button" className="assistant-confirm" disabled={!canConfirm} onClick={onConfirmDraft}>
            <Check size={15} strokeWidth={2.2} /> Confirmar
          </button>
        )}
        <button type="button" className="assistant-secondary" onClick={onCancelDraft}>
          <Trash2 size={15} strokeWidth={2.1} /> Cancelar
        </button>
      </footer>
    </section>
  );
}

function UnknownIntentCard({
  draft,
  onCancelDraft,
}: {
  draft: AssistantIntent;
  onCancelDraft: () => void;
}) {
  return (
    <section className="assistant-draft-card risk-low" aria-label="Intencion no reconocida">
      <header>
        <div>
          <span>No entendido</span>
          <strong>{draft.spokenSummary || 'No he entendido la accion.'}</strong>
        </div>
      </header>
      {draft.clarificationQuestion && (
        <p className="assistant-clarification"><AlertTriangle size={14} strokeWidth={2} /> {draft.clarificationQuestion}</p>
      )}
      <footer>
        <button type="button" className="assistant-secondary" onClick={onCancelDraft}>
          <Trash2 size={15} strokeWidth={2.1} /> Cancelar
        </button>
      </footer>
    </section>
  );
}

function DraftCard({
  draft,
  onConfirmDraft,
  onCancelDraft,
  onSelectPatientOption,
  onSelectProfessionalOption,
  onSelectTreatmentOption,
  onSelectSlot,
  onEditDraftField,
  onFindSlots,
  onDraftPrompt,
}: {
  draft: AssistantIntent | null;
  onConfirmDraft: () => void;
  onCancelDraft: () => void;
  onSelectPatientOption: (option: AssistantPatientOption) => void;
  onSelectProfessionalOption: (option: AssistantProfessionalOption) => void;
  onSelectTreatmentOption: (option: AssistantTreatmentOption) => void;
  onSelectSlot: (slot: AssistantSlot) => void;
  onEditDraftField: (field: AssistantDraftEditableField, value: string) => void;
  onFindSlots: () => void;
  onDraftPrompt: (value: string) => void;
}) {
  if (!draft) return null;
  if (draft.intent === 'create_budget_draft' || draft.intent === 'update_budget_draft') return null;
  const canConfirm = draft.requiresConfirmation && !draft.needsClarification && draft.operationalCanConfirm !== false;
  const title = draft.intent === 'create_appointment' ? 'Nueva cita en borrador' : 'Borrador';
  const slotTime = draft.fields.slot?.fechaHora?.slice(11, 16) ?? draft.fields.preferredTime ?? draft.fields.timePreference;
  const duration = draft.fields.slot?.durationMinutes ?? draft.fields.durationMinutes ?? null;
  const patientValue = draft.fields.patientDisplayName ?? draft.fields.patientQuery ?? '';
  const treatmentValue = draft.fields.treatmentType ?? '';
  const professionalValue = draft.fields.professional ?? draft.fields.professionalQuery ?? '';
  const dateValue = draft.fields.slot?.fechaHora?.slice(0, 10) ?? draft.fields.datePreference ?? draft.fields.preferredDate ?? draft.fields.dateRange ?? '';
  const notesValue = draft.fields.taskText ?? draft.fields.noteText ?? '';
  const treatmentDuration = draft.operationalResolution?.treatmentResolution?.selected?.defaultDurationMinutes ?? duration;
  return (
    <section className={`assistant-draft-card risk-${draft.riskLevel}`} aria-label="Borrador del asistente">
      <header>
        <div>
          <span>{title}</span>
          <strong>{draft.summary}</strong>
        </div>
        {draft.requiresConfirmation && (
          <em><ShieldCheck size={13} strokeWidth={2.1} /> Requiere confirmacion</em>
        )}
      </header>
      <div className="assistant-draft-grid">
        <DraftField label="Paciente" value={patientValue} state={draftFieldState(draft, 'patient')} placeholder="Nombre del paciente" onChange={(value) => onEditDraftField('patient', value)} />
        <DraftField label="Tratamiento" value={treatmentValue} state={draftFieldState(draft, 'treatment')} placeholder="Tratamiento" onChange={(value) => onEditDraftField('treatment', value)} />
        <DraftField label="Profesional" value={professionalValue} state={draftFieldState(draft, 'professional')} placeholder="Profesional" onChange={(value) => onEditDraftField('professional', value)} />
        <DraftField label="Fecha/rango" value={dateValue} state={draftFieldState(draft, 'date')} placeholder="manana, jueves, 2026-07-01" onChange={(value) => onEditDraftField('date', value)} />
        <DraftField label="Hora" value={fieldValue(slotTime) === 'Pendiente' ? '' : String(slotTime)} state={draftFieldState(draft, 'time')} placeholder="09:30, tarde..." onChange={(value) => onEditDraftField('time', value)} />
        <DraftField label="Duracion" value={treatmentDuration ? String(treatmentDuration) : ''} type="number" state="resolved" placeholder="30" onChange={(value) => onEditDraftField('duration', value)} />
        <DraftField label="Motivo/notas" value={notesValue} state="resolved" placeholder="Opcional" onChange={(value) => onEditDraftField('notes', value)} />
        <span className={`assistant-draft-state ${draft.needsClarification ? 'missing' : 'resolved'}`}><b>Estado</b>{draft.needsClarification ? 'Faltan datos' : draft.requiresConfirmation ? 'Pendiente de confirmar' : 'Listo'}</span>
      </div>
      {draft.clarificationQuestion && (
        <p className="assistant-clarification"><AlertTriangle size={14} strokeWidth={2} /> {draft.clarificationQuestion}</p>
      )}
      <PatientOptions draft={draft} onSelectPatientOption={onSelectPatientOption} />
      <ProfessionalOptions draft={draft} onSelectProfessionalOption={onSelectProfessionalOption} />
      <TreatmentOptions draft={draft} onSelectTreatmentOption={onSelectTreatmentOption} />
      <SlotOptions draft={draft} onSelectSlot={onSelectSlot} />
      <div className="assistant-draft-actions" aria-label="Acciones rapidas del borrador">
        <button type="button" onClick={onFindSlots}><Search size={13} /> Buscar huecos</button>
        <button type="button" onClick={() => onDraftPrompt('El paciente es ')}><UserRound size={13} /> Cambiar paciente</button>
        <button type="button" onClick={() => onDraftPrompt('Con ')}><Stethoscope size={13} /> Cambiar profesional</button>
        <button type="button" onClick={() => onDraftPrompt('Mejor ')}><Calendar size={13} /> Cambiar fecha</button>
        <button type="button" onClick={() => onDraftPrompt('El tratamiento es ')}><Pencil size={13} /> Cambiar tratamiento</button>
        <button type="button" onClick={() => onDraftPrompt('A las ')}><Clock size={13} /> Cambiar hora</button>
      </div>
      <footer>
        {draft.requiresConfirmation && (
          <button type="button" className="assistant-confirm" disabled={!canConfirm} onClick={onConfirmDraft}>
            <Check size={15} strokeWidth={2.2} /> Confirmar
          </button>
        )}
        <button type="button" className="assistant-secondary" onClick={onCancelDraft}>
          <Trash2 size={15} strokeWidth={2.1} /> Cancelar
        </button>
      </footer>
    </section>
  );
}

function isAppointmentDraft(draft: AssistantIntent | null) {
  return Boolean(draft && ['create_appointment', 'find_available_slots', 'move_appointment', 'cancel_appointment'].includes(draft.intent));
}

export default function AssistantPanel({
  phase,
  context,
  messages,
  transcript,
  draft,
  input,
  loadingData,
  onInputChange,
  onSubmit,
  onVoice,
  onConfirmDraft,
  onCancelDraft,
  onSelectPatientOption,
  onSelectProfessionalOption,
  onSelectTreatmentOption,
  onSelectSlot,
  onEditDraftField,
  onBudgetLineChange,
  onAddBudgetLine,
  onRemoveBudgetLine,
  onSelectBudgetTreatmentOption,
  onFindSlots,
  onDraftPrompt,
  onClose,
}: {
  phase: AssistantPhase;
  context: AssistantContextSnapshot;
  messages: AssistantMessage[];
  transcript: string;
  draft: AssistantIntent | null;
  input: string;
  loadingData: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onVoice: () => void;
  onConfirmDraft: () => void;
  onCancelDraft: () => void;
  onSelectPatientOption: (option: AssistantPatientOption) => void;
  onSelectProfessionalOption: (option: AssistantProfessionalOption) => void;
  onSelectTreatmentOption: (option: AssistantTreatmentOption) => void;
  onSelectSlot: (slot: AssistantSlot) => void;
  onEditDraftField: (field: AssistantDraftEditableField, value: string) => void;
  onBudgetLineChange: (index: number, patch: Partial<AssistantBudgetLine>) => void;
  onAddBudgetLine: () => void;
  onRemoveBudgetLine: (index?: number) => void;
  onSelectBudgetTreatmentOption: (index: number, option: AssistantTreatmentOption) => void;
  onFindSlots: () => void;
  onDraftPrompt: (value: string) => void;
  onClose: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(input);
  }

  const busy = ['listening', 'transcribing', 'interpreting', 'executing'].includes(phase);

  return (
    <aside className="assistant-panel" aria-label="Asistente DentOrg">
      <header className="assistant-panel-header">
        <div className="assistant-panel-title">
          <Bot size={18} strokeWidth={2.1} aria-hidden="true" />
          <div>
            <strong>Asistente</strong>
            <span>{context.screen} · {phaseLabel(phase)}</span>
          </div>
        </div>
        <button type="button" className="assistant-icon-button" aria-label="Cerrar asistente" title="Cerrar" onClick={onClose}>
          <X size={17} strokeWidth={2.1} />
        </button>
      </header>

      <div className="assistant-context-strip">
        <span>{context.currentPatientDisplayName ?? 'Sin paciente activo'}</span>
        {loadingData && <em><Loader2 size={12} className="assistant-spin" /> Sincronizando</em>}
      </div>

      <div className="assistant-transcript" aria-live="polite">
        <span>Transcripcion</span>
        <strong>{transcript || 'Sin entrada reciente'}</strong>
      </div>

      <div className="assistant-messages" aria-live="polite">
        {messages.slice(-5).map((message) => (
          <p key={message.id} className={`assistant-message ${message.role}`}>
            {message.text}
          </p>
        ))}
        {!messages.length && (
          <p className="assistant-message system">Listo para una accion operativa.</p>
        )}
      </div>

      {draft && (draft.intent === 'create_budget_draft' || draft.intent === 'update_budget_draft') ? (
        <BudgetDraftCard
          draft={draft}
          onConfirmDraft={onConfirmDraft}
          onCancelDraft={onCancelDraft}
          onSelectPatientOption={onSelectPatientOption}
          onEditDraftField={onEditDraftField}
          onBudgetLineChange={onBudgetLineChange}
          onAddBudgetLine={onAddBudgetLine}
          onRemoveBudgetLine={onRemoveBudgetLine}
          onSelectBudgetTreatmentOption={onSelectBudgetTreatmentOption}
          onDraftPrompt={onDraftPrompt}
        />
      ) : draft?.intent === 'create_task' ? (
        <SimpleDraftCard
          draft={draft}
          title="Tarea en borrador"
          valueLabel="Tarea"
          value={draft.fields.taskText ?? draft.fields.taskTitle ?? ''}
          onConfirmDraft={onConfirmDraft}
          onCancelDraft={onCancelDraft}
          onEdit={(value) => onEditDraftField('notes', value)}
        />
      ) : draft?.intent === 'create_clinical_note_draft' ? (
        <SimpleDraftCard
          draft={draft}
          title="Nota clinica en borrador"
          valueLabel="Nota"
          value={draft.fields.noteText ?? ''}
          onConfirmDraft={onConfirmDraft}
          onCancelDraft={onCancelDraft}
          onEdit={(value) => onEditDraftField('notes', value)}
        />
      ) : draft?.intent === 'unknown' ? (
        <UnknownIntentCard draft={draft} onCancelDraft={onCancelDraft} />
      ) : isAppointmentDraft(draft) ? (
        <DraftCard
          draft={draft}
          onConfirmDraft={onConfirmDraft}
          onCancelDraft={onCancelDraft}
          onSelectPatientOption={onSelectPatientOption}
          onSelectProfessionalOption={onSelectProfessionalOption}
          onSelectTreatmentOption={onSelectTreatmentOption}
          onSelectSlot={onSelectSlot}
          onEditDraftField={onEditDraftField}
          onFindSlots={onFindSlots}
          onDraftPrompt={onDraftPrompt}
        />
      ) : null}

      <form className="assistant-input-row" onSubmit={submit}>
        <button
          type="button"
          className={`assistant-mic ${phase === 'listening' ? 'active' : ''}`}
          aria-label="Pulsar para hablar"
          title="Pulsar para hablar"
          disabled={busy}
          onClick={onVoice}
        >
          {busy ? <Loader2 size={17} className="assistant-spin" /> : <Mic size={17} strokeWidth={2.2} />}
        </button>
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Pedir una accion..."
          disabled={busy}
        />
        <button type="submit" className="assistant-send" aria-label="Enviar" title="Enviar" disabled={busy || !input.trim()}>
          <Send size={16} strokeWidth={2.2} />
        </button>
      </form>
    </aside>
  );
}
