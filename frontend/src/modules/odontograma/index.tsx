import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPresupuestoFromOdontograma,
  duplicateOdontogramaVersion,
  getOdontogramaHistorial,
  getOdontogramaPaciente,
  updateOdontogramaPieza,
  updateOdontogramaSuperficie,
} from '../../lib/api';
import type {
  ApiPaciente,
  OdontogramaPaciente,
  OdontogramaPieza,
  OdontogramaStatus,
  OdontogramaSurfaceName,
  TratamientoCatalogo,
} from '../../types/api';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const STATUSES: Array<{ id: OdontogramaStatus; label: string; color: string }> = [
  { id: 'sano', label: 'Sano', color: '#d1fae5' },
  { id: 'caries', label: 'Caries', color: '#f97316' },
  { id: 'obturacion', label: 'Obturacion', color: '#3b82f6' },
  { id: 'endodoncia', label: 'Endodoncia', color: '#8b5cf6' },
  { id: 'corona', label: 'Corona', color: '#f59e0b' },
  { id: 'implante', label: 'Implante', color: '#14b8a6' },
  { id: 'ausente', label: 'Ausente', color: '#94a3b8' },
  { id: 'extraccion_indicada', label: 'Extraccion', color: '#ef4444' },
  { id: 'fractura', label: 'Fractura', color: '#e11d48' },
  { id: 'movilidad', label: 'Movilidad', color: '#06b6d4' },
  { id: 'protesis', label: 'Protesis', color: '#a16207' },
  { id: 'tratamiento_pendiente', label: 'Pendiente', color: '#eab308' },
  { id: 'tratamiento_realizado', label: 'Realizado', color: '#22c55e' },
];

interface Props {
  paciente: ApiPaciente;
  tratamientos: TratamientoCatalogo[];
  doctorId?: string | null;
  onPresupuestoCreado?: () => void;
  context?: 'paciente' | 'presupuesto';
  onBudgetDraftChange?: (draft: OdontogramaBudgetDraft) => void;
  onAddBudgetTreatment?: (draft: OdontogramaBudgetDraft) => void;
  onAddBudgetTreatments?: (drafts: OdontogramaBudgetDraft[]) => void;
}

export interface OdontogramaBudgetDraft {
  piezaFdi: number;
  superficie: OdontogramaSurfaceName;
  caras: string;
  estado: OdontogramaStatus;
  tratamientoId: string;
  precioUnitario: string | number;
}

interface BudgetDraftItem extends OdontogramaBudgetDraft {
  id: string;
}

function pieceMap(odontograma?: OdontogramaPaciente) {
  return new Map((odontograma?.piezas ?? []).map((pieza) => [pieza.pieza_fdi, pieza]));
}

function statusColor(status?: string | null) {
  return STATUSES.find((item) => item.id === status)?.color ?? '#f1f5f9';
}

function surfaceFor(piece: OdontogramaPieza | undefined, surface: OdontogramaSurfaceName) {
  if (surface === 'lingual_palatina') {
    return piece?.superficies.find((item) => item.superficie === surface || item.superficie === 'lingual_palatal');
  }
  return piece?.superficies.find((item) => item.superficie === surface);
}

function toothKind(fdi: number) {
  const unit = fdi % 10;
  if (unit <= 2) return 'incisor';
  if (unit === 3) return 'canine';
  if (unit <= 5) return 'premolar';
  return 'molar';
}

function toothGeometry(fdi: number, upper: boolean) {
  const kind = toothKind(fdi);
  const displayLeft = UPPER.includes(fdi) ? fdi >= 21 : fdi >= 31;
  const mirror = displayLeft;
  const rootPath = (() => {
    if (upper) {
      if (kind === 'incisor') return 'M27 58C21 42 23 23 34 7c14 15 15 36 7 52-4 2-10 2-14-1Z';
      if (kind === 'canine') return 'M26 60C18 40 21 18 35 5c14 13 17 36 8 56-5 2-12 2-17-1Z';
      if (kind === 'premolar') return 'M20 62C15 44 17 23 25 8c5 14 6 26 11 26s7-13 11-26c8 16 9 36 2 54-8 2-21 2-29 0Z';
      return 'M15 64C10 45 12 24 21 8c5 14 6 28 13 28s8-15 13-28c10 17 11 38 4 56-10 3-26 3-36 0Z';
    }
    if (kind === 'incisor') return 'M27 56c-6 17-5 36 8 51 13-15 14-36 6-52-4-2-10-1-14 1Z';
    if (kind === 'canine') return 'M26 55c-8 20-5 42 9 55 14-13 17-36 8-56-5-2-12-1-17 1Z';
    if (kind === 'premolar') return 'M20 54c-6 18-5 38 5 53 4-13 6-26 11-26s7 13 11 26c8-15 9-36 2-54-8-2-21-1-29 1Z';
    return 'M15 52c-6 18-5 39 6 55 4-13 6-27 13-27s8 14 13 27c9-16 10-37 4-55-10-3-26-3-36 0Z';
  })();
  const crownPath = (() => {
    if (upper) {
      if (kind === 'incisor') return 'M19 56c-6 5-9 15-7 26 2 16 11 25 24 25 12 0 21-10 22-26 1-11-3-20-9-25-7 4-21 5-30 0Z';
      if (kind === 'canine') return 'M18 58c-7 8-8 24-2 37 4 8 12 13 20 13 9 0 16-6 19-14 5-13 4-28-3-36-5 8-11 13-17 13-7 0-12-5-17-13Z';
      if (kind === 'premolar') return 'M12 58c-6 7-8 18-4 31 4 13 14 20 28 20 15 0 25-9 27-22 2-12 0-23-6-29-10 5-33 6-45 0Z';
      return 'M8 57c-8 7-10 21-6 35 5 14 18 22 33 22 16 0 28-9 33-23 4-13 1-27-7-34-13 7-39 8-53 0Z';
    }
    if (kind === 'incisor') return 'M19 60c-6-5-9-15-7-26 2-16 11-25 24-25 12 0 21 10 22 26 1 11-3 20-9 25-7-4-21-5-30 0Z';
    if (kind === 'canine') return 'M18 58c-7-8-8-24-2-37 4-8 12-13 20-13 9 0 16 6 19 14 5 13 4 28-3 36-5-8-11-13-17-13-7 0-12 5-17 13Z';
    if (kind === 'premolar') return 'M12 60c-6-7-8-18-4-31C12 16 22 9 36 9c15 0 25 9 27 22 2 12 0 23-6 29-10-5-33-6-45 0Z';
    return 'M8 61c-8-7-10-21-6-35C7 12 20 4 35 4c16 0 28 9 33 23 4 13 1 27-7 34-13-7-39-8-53 0Z';
  })();
  const vestibularPath = upper
    ? 'M17 69c7-7 29-7 36 0-4 7-10 10-18 10s-14-3-18-10Z'
    : 'M17 21c7-7 29-7 36 0-4 7-10 10-18 10s-14-3-18-10Z';
  const lingualPath = upper
    ? 'M17 98c7 7 29 7 36 0-4-7-10-10-18-10s-14 3-18 10Z'
    : 'M17 50c7 7 29 7 36 0-4-7-10-10-18-10s-14 3-18 10Z';
  const mesialPath = upper
    ? 'M9 83c0-7 3-12 8-15l13 15-13 15c-5-3-8-8-8-15Z'
    : 'M9 35c0-7 3-12 8-15l13 15-13 15c-5-3-8-8-8-15Z';
  const distalPath = upper
    ? 'M61 83c0-7-3-12-8-15L40 83l13 15c5-3 8-8 8-15Z'
    : 'M61 35c0-7-3-12-8-15L40 35l13 15c5-3 8-8 8-15Z';
  const occlusalY = upper ? 83 : 35;
  const linePath = upper
    ? 'M17 69c7-7 29-7 36 0M17 98c7 7 29 7 36 0M29 83h12M35 74v19'
    : 'M17 21c7-7 29-7 36 0M17 50c7 7 29 7 36 0M29 35h12M35 26v19';
  return {
    mirror,
    rootPath,
    crownPath,
    vestibularPath,
    lingualPath,
    mesialPath,
    distalPath,
    occlusalY,
    linePath,
  };
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function faceForSurface(surface: OdontogramaSurfaceName) {
  const map: Record<OdontogramaSurfaceName, string> = {
    mesial: 'M',
    distal: 'D',
    vestibular: 'V',
    lingual_palatina: 'L',
    lingual_palatal: 'L',
    oclusal_incisal: 'O',
    raiz: 'R',
  };
  return map[surface] ?? '';
}

function validStatus(value?: string | null): OdontogramaStatus {
  return (STATUSES.some((item) => item.id === value) ? value : 'tratamiento_pendiente') as OdontogramaStatus;
}

/** Compact face diagram: V on top, M/O/D in middle row, L on bottom */
function FaceDiagram({
  piece,
  selected,
  onSelect,
}: {
  piece: OdontogramaPieza | undefined;
  selected: OdontogramaSurfaceName;
  onSelect: (s: OdontogramaSurfaceName) => void;
}) {
  function btn(id: OdontogramaSurfaceName, label: string, extraClass?: string) {
    const surf = id === 'lingual_palatina'
      ? piece?.superficies.find((s) => s.superficie === 'lingual_palatina' || s.superficie === 'lingual_palatal')
      : piece?.superficies.find((s) => s.superficie === id);
    const color = statusColor(surf?.condicion);
    const isActive = selected === id;
    return (
      <button
        key={id}
        type="button"
        className={`face-btn${extraClass ? ` ${extraClass}` : ''}${isActive ? ' face-btn-active' : ''}`}
        style={{ background: color }}
        onClick={() => onSelect(id)}
        title={id}
      >
        {label}
      </button>
    );
  }
  return (
    <div className="face-diagram">
      <div className="face-row face-row-top">{btn('vestibular', 'V', 'face-v')}</div>
      <div className="face-row face-row-mid">
        {btn('mesial', 'M', 'face-m')}
        {btn('oclusal_incisal', 'O', 'face-o')}
        {btn('distal', 'D', 'face-d')}
      </div>
      <div className="face-row face-row-bot">{btn('lingual_palatina', 'L', 'face-l')}</div>
    </div>
  );
}

export function OdontogramaPacientePanel({
  paciente,
  tratamientos,
  doctorId,
  onPresupuestoCreado,
  context = 'paciente',
  onBudgetDraftChange,
  onAddBudgetTreatment,
  onAddBudgetTreatments,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedTooth, setSelectedTooth] = useState<number>(24);
  const [selectedSurface, setSelectedSurface] = useState<OdontogramaSurfaceName>('oclusal_incisal');
  const [selectedStatus, setSelectedStatus] = useState<OdontogramaStatus>('tratamiento_pendiente');
  const [selectedTreatment, setSelectedTreatment] = useState<string>(tratamientos[0]?.id ?? '');
  const [treatmentSearch, setTreatmentSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [budgetDrafts, setBudgetDrafts] = useState<BudgetDraftItem[]>([]);

  const odontogramaQuery = useQuery({
    queryKey: ['odontograma-paciente', paciente.id],
    queryFn: () => getOdontogramaPaciente(paciente.id),
    staleTime: 30_000,
  });
  const odontograma = odontogramaQuery.data;
  const pieces = useMemo(() => pieceMap(odontograma), [odontograma]);
  const selectedPiece = pieces.get(selectedTooth);
  const selectedSurfaceData = surfaceFor(selectedPiece, selectedSurface);
  const selectedTreatmentItem = tratamientos.find((tratamiento) => tratamiento.id === selectedTreatment) ?? null;
  const filteredTreatments = useMemo(() => {
    const query = treatmentSearch.trim().toLowerCase();
    const source = query
      ? tratamientos.filter((tratamiento) => `${tratamiento.codigo ?? ''} ${tratamiento.nombre} ${tratamiento.familia?.nombre ?? ''}`.toLowerCase().includes(query))
      : tratamientos;
    return source.slice(0, context === 'presupuesto' ? 8 : 80);
  }, [context, tratamientos, treatmentSearch]);
  const historialQuery = useQuery({
    queryKey: ['odontograma-historial', odontograma?.id],
    queryFn: () => getOdontogramaHistorial(odontograma!.id),
    enabled: Boolean(odontograma?.id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['odontograma-paciente', paciente.id] });
    if (odontograma?.id) void queryClient.invalidateQueries({ queryKey: ['odontograma-historial', odontograma.id] });
  };

  const pieceMutation = useMutation({
    mutationFn: () => updateOdontogramaPieza(odontograma!.id, selectedTooth, {
      estado_general: selectedStatus,
      notas: notes || selectedPiece?.notas || null,
    }),
    onSuccess: invalidate,
  });
  const surfaceMutation = useMutation({
    mutationFn: () => updateOdontogramaSuperficie(odontograma!.id, selectedTooth, selectedSurface, {
      condicion: selectedStatus,
      tratamiento_planificado_id: selectedStatus === 'tratamiento_pendiente' ? selectedTreatment || null : selectedSurfaceData?.tratamiento_planificado_id ?? null,
      color_estado: statusColor(selectedStatus),
      notas: notes || selectedSurfaceData?.notas || null,
    }),
    onSuccess: invalidate,
  });
  const planMutation = useMutation({
    mutationFn: () => createPresupuestoFromOdontograma(odontograma!.id, { doctor_id: doctorId || '', pie_pagina: 'Presupuesto generado desde odontograma clinico.' }),
    onSuccess: () => {
      onPresupuestoCreado?.();
      invalidate();
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: () => duplicateOdontogramaVersion(odontograma!.id),
    onSuccess: invalidate,
  });

  const plannedCount = (odontograma?.piezas ?? []).reduce(
    (acc, pieza) => acc + pieza.superficies.filter((surface) => surface.tratamiento_planificado_id || surface.condicion === 'tratamiento_pendiente').length,
    0,
  );
  const queuedCount = budgetDrafts.length;
  const queuedTotal = budgetDrafts.reduce((sum, draft) => sum + Number(draft.precioUnitario || 0), 0);
  const queuedByTooth = useMemo(() => {
    const map = new Map<number, number>();
    for (const draft of budgetDrafts) {
      map.set(draft.piezaFdi, (map.get(draft.piezaFdi) ?? 0) + 1);
    }
    return map;
  }, [budgetDrafts]);
  const selectionKey = `${selectedTooth}-${selectedSurface}-${selectedSurfaceData?.id ?? 'none'}-${selectedSurfaceData?.condicion ?? ''}-${selectedSurfaceData?.tratamiento_planificado_id ?? ''}-${selectedPiece?.estado_general ?? ''}`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedTreatment && tratamientos[0]) setSelectedTreatment(tratamientos[0].id);
  }, [selectedTreatment, tratamientos]);

  useEffect(() => {
    const nextStatus = validStatus(selectedSurfaceData?.condicion ?? selectedPiece?.estado_general);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedStatus(nextStatus);
    if (selectedSurfaceData?.tratamiento_planificado_id) setSelectedTreatment(selectedSurfaceData.tratamiento_planificado_id);
    setNotes(selectedSurfaceData?.notas ?? selectedPiece?.notas ?? '');
  }, [selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tratamiento = tratamientos.find((item) => item.id === selectedTreatment);
    if (!onBudgetDraftChange || context !== 'presupuesto') return;
    onBudgetDraftChange({
      piezaFdi: selectedTooth,
      superficie: selectedSurface,
      caras: faceForSurface(selectedSurface),
      estado: selectedStatus,
      tratamientoId: selectedTreatment,
      precioUnitario: tratamiento?.precio ?? 0,
    });
  }, [context, onBudgetDraftChange, selectedStatus, selectedSurface, selectedTooth, selectedTreatment, tratamientos]);

  function addSelectedTreatmentToBudget() {
    if (!selectedTreatmentItem) return;
    const draft: BudgetDraftItem = {
      id: `${selectedTooth}-${selectedSurface}-${selectedTreatmentItem.id}-${Date.now()}`,
      piezaFdi: selectedTooth,
      superficie: selectedSurface,
      caras: faceForSurface(selectedSurface),
      estado: selectedStatus,
      tratamientoId: selectedTreatmentItem.id,
      precioUnitario: selectedTreatmentItem.precio,
    };
    setBudgetDrafts((current) => [...current, draft]);
    setSelectedStatus('tratamiento_pendiente');
  }

  function removeBudgetDraft(id: string) {
    setBudgetDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  function confirmBudgetDrafts() {
    if (!budgetDrafts.length) return;
    const drafts = budgetDrafts.map(({ id: _id, ...draft }) => draft);
    if (onAddBudgetTreatments) {
      onAddBudgetTreatments(drafts);
    } else if (onAddBudgetTreatment) {
      drafts.forEach((draft) => onAddBudgetTreatment(draft));
    }
    setBudgetDrafts([]);
  }

  function renderTooth(fdi: number) {
    const piece = pieces.get(fdi);
    const mainColor = statusColor(piece?.estado_general);
    const selected = selectedTooth === fdi;
    const queued = queuedByTooth.get(fdi) ?? 0;
    const rootColor = statusColor(surfaceFor(piece, 'raiz')?.condicion);
    const upper = UPPER.includes(fdi);

    // Improved tooth SVG paths — cleaner molar shape
    const geometry = toothGeometry(fdi, upper);
    const mirrorTransform = geometry.mirror ? 'translate(70 0) scale(-1 1)' : undefined;
    return (
      <button
        key={fdi}
        type="button"
        className={`clinical-tooth ${upper ? 'upper-tooth' : 'lower-tooth'} ${toothKind(fdi)}${selected ? ' selected' : ''}${queued ? ' budget-queued' : ''}`}
        onClick={() => setSelectedTooth(fdi)}
        title={`Pieza ${fdi}`}
      >
        <svg viewBox="0 0 70 118" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          <g transform={mirrorTransform}>
            <path className="tooth-root" style={{ fill: rootColor }} d={geometry.rootPath} />
            <path className="tooth-crown" style={{ fill: mainColor }} d={geometry.crownPath} />
            <path style={{ fill: statusColor(surfaceFor(piece, 'vestibular')?.condicion) }} d={geometry.vestibularPath} />
            <path style={{ fill: statusColor(surfaceFor(piece, 'lingual_palatina')?.condicion) }} d={geometry.lingualPath} />
            <path style={{ fill: statusColor(surfaceFor(piece, 'mesial')?.condicion) }} d={geometry.mesialPath} />
            <path style={{ fill: statusColor(surfaceFor(piece, 'distal')?.condicion) }} d={geometry.distalPath} />
            <ellipse style={{ fill: statusColor(surfaceFor(piece, 'oclusal_incisal')?.condicion) }} cx="35" cy={geometry.occlusalY} rx={toothKind(fdi) === 'incisor' ? 7 : 10} ry={toothKind(fdi) === 'molar' ? 10 : 9} />
            <path className="tooth-line" d={geometry.linePath} />
          </g>
        </svg>
        <span>{fdi}</span>
        {queued > 0 && <b>{queued}</b>}
      </button>
    );
  }

  return (
    <div className={`odontograma-page ${context === 'presupuesto' ? 'odontograma-page-budget' : ''}`}>
      <section className="odontograma-board" aria-label="Odontograma adulto FDI">
        <div className="odontograma-board-head">
          <div>
            <strong>{context === 'presupuesto' ? 'Odontograma del presupuesto' : 'Odontograma clinico'}</strong>
            <span>{paciente.num_historial} - {paciente.apellidos}, {paciente.nombre}</span>
          </div>
          <div className="odontograma-kpis">
            <span>Version {odontograma?.version ?? 1}</span>
            <span>{plannedCount} planificados</span>
            {context === 'presupuesto' && <span>{queuedCount} en lista</span>}
          </div>
        </div>
        <div className="arch-label">Arcada superior</div>
        <div className="tooth-arch upper">{UPPER.map(renderTooth)}</div>
        <div className="arch-midline" />
        <div className="tooth-arch lower">{LOWER.map(renderTooth)}</div>
        <div className="arch-label">Arcada inferior</div>
        {/* Compact 2-column legend */}
        <div className="odontograma-legend">
          {STATUSES.map((status) => (
            <button key={status.id} type="button" className={`legend-chip${selectedStatus === status.id ? ' active' : ''}`} onClick={() => setSelectedStatus(status.id)}>
              <i style={{ background: status.color }} />{status.label}
            </button>
          ))}
        </div>
      </section>

      <aside className="odontograma-side">
        <div className="odontograma-side-section">
          <span className="eyebrow">Pieza seleccionada</span>
          <h3>Pieza {selectedTooth}</h3>
          {/* Interactive face diagram */}
          <FaceDiagram
            piece={selectedPiece}
            selected={selectedSurface}
            onSelect={(s) => setSelectedSurface(s)}
          />
          {/* Surface status indicator */}
          <div className="surface-status-row">
            <span className="surface-status-dot" style={{ background: statusColor(selectedSurfaceData?.condicion ?? selectedPiece?.estado_general) }} />
            <span className="surface-status-label">{selectedSurface.replace('_', ' ')} &mdash; {selectedStatus.replace(/_/g, ' ')}</span>
          </div>
        </div>
        {/* Status picker — compact grid */}
        <div className="status-picker-grid">
          {STATUSES.map((status) => (
            <button
              key={status.id}
              type="button"
              className={`status-pick-btn${selectedStatus === status.id ? ' active' : ''}`}
              style={{ '--status-color': status.color } as CSSProperties}
              onClick={() => setSelectedStatus(status.id)}
              title={status.label}
            >
              <i style={{ background: status.color }} />
              <span>{status.label}</span>
            </button>
          ))}
        </div>
        <label className="field compact-field">
          Tratamiento planificado
          <input value={treatmentSearch} onChange={(event) => setTreatmentSearch(event.target.value)} placeholder="Buscar tratamiento" />
        </label>
        <div className="odontograma-treatment-picker">
          {filteredTreatments.map((tratamiento) => (
            <button
              key={tratamiento.id}
              type="button"
              className={selectedTreatment === tratamiento.id ? 'active' : ''}
              onClick={() => {
                setSelectedTreatment(tratamiento.id);
                setSelectedStatus('tratamiento_pendiente');
                setTreatmentSearch('');
              }}
            >
              <span>{tratamiento.codigo ?? 'TR'}</span>
              <strong>{tratamiento.nombre}</strong>
              <em>{Number(tratamiento.precio).toLocaleString('es-ES')} EUR</em>
            </button>
          ))}
          {!filteredTreatments.length && <p className="empty-state compact">No hay tratamientos con ese criterio.</p>}
        </div>
        <label className="field compact-field">
          Notas
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder={selectedSurfaceData?.notas ?? selectedPiece?.notas ?? 'Notas clinicas'} />
        </label>
        <div className="odontograma-actions">
          <button type="button" onClick={() => pieceMutation.mutate()} disabled={!odontograma || pieceMutation.isPending}>Guardar pieza</button>
          <button type="button" className="primary" onClick={() => surfaceMutation.mutate()} disabled={!odontograma || surfaceMutation.isPending}>{context === 'presupuesto' ? 'Marcar cara' : 'Guardar superficie'}</button>
        </div>
        {context === 'presupuesto' && (
          <div className="odontograma-budget-queue">
            <button
              type="button"
              className="odontograma-add-budget"
              onClick={() => {
                if (odontograma) surfaceMutation.mutate();
                addSelectedTreatmentToBudget();
              }}
              disabled={!selectedTreatmentItem}
            >
              Añadir a lista
            </button>
            <div className="odontograma-queue-head">
              <strong>Tratamientos a presupuestar</strong>
              <span>{queuedCount} piezas / {queuedTotal.toLocaleString('es-ES')} EUR</span>
            </div>
            <div className="odontograma-queue-list">
              {budgetDrafts.map((draft) => {
                const treatment = tratamientos.find((item) => item.id === draft.tratamientoId);
                return (
                  <div key={draft.id} className="odontograma-queue-item">
                    <span>Pieza {draft.piezaFdi} · {draft.caras}</span>
                    <strong>{treatment?.nombre ?? 'Tratamiento'}</strong>
                    <em>{Number(draft.precioUnitario).toLocaleString('es-ES')} EUR</em>
                    <button type="button" onClick={() => removeBudgetDraft(draft.id)} aria-label="Quitar tratamiento">×</button>
                  </div>
                );
              })}
              {!budgetDrafts.length && <p>Seleccione un diente, elija tratamiento y pulse Añadir a lista.</p>}
            </div>
            <div className="odontograma-queue-actions">
              <button type="button" onClick={() => setBudgetDrafts([])} disabled={!budgetDrafts.length}>Limpiar</button>
              <button type="button" className="primary" onClick={confirmBudgetDrafts} disabled={!budgetDrafts.length || (!onAddBudgetTreatments && !onAddBudgetTreatment)}>
                Aceptar y generar líneas
              </button>
            </div>
          </div>
        )}
        {context !== 'presupuesto' && (
          <>
            <div className="odontograma-actions split">
              <button type="button" onClick={() => duplicateMutation.mutate()} disabled={!odontograma || duplicateMutation.isPending}>Nueva version</button>
              <button type="button" className="primary" onClick={() => planMutation.mutate()} disabled={!odontograma || !doctorId || plannedCount === 0 || planMutation.isPending}>
                Pasar a presupuesto
              </button>
            </div>
            {planMutation.isError && <p className="form-error">No se pudo crear el presupuesto desde el odontograma.</p>}
            {!doctorId && <p className="hint">Selecciona un doctor para generar presupuesto.</p>}
            <div className="odontograma-side-section">
              <span className="eyebrow">Historial</span>
              <div className="odontograma-events">
                {historialQuery.data?.slice(0, 6).map((event) => (
                  <div key={event.id}>
                    <strong>{event.accion.replaceAll('_', ' ')}</strong>
                    <span>{event.pieza_fdi ? `Pieza ${event.pieza_fdi}` : 'General'} {event.superficie ? `- ${event.superficie}` : ''}</span>
                    <small>{shortDate(event.created_at)}</small>
                  </div>
                ))}
                {!historialQuery.data?.length && <p className="empty-state compact">Aun no hay cambios registrados.</p>}
              </div>
            </div>
          </>
        )}
      </aside>
      {odontogramaQuery.isLoading && <div className="loading-overlay">Cargando odontograma...</div>}
    </div>
  );
}
