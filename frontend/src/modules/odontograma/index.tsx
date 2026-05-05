import { useMemo, useState } from 'react';
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
const SURFACES: Array<{ id: OdontogramaSurfaceName; label: string }> = [
  { id: 'mesial', label: 'M' },
  { id: 'distal', label: 'D' },
  { id: 'vestibular', label: 'V' },
  { id: 'lingual_palatal', label: 'L/P' },
  { id: 'oclusal_incisal', label: 'O/I' },
  { id: 'raiz', label: 'R' },
];

const STATUSES: Array<{ id: OdontogramaStatus; label: string; color: string }> = [
  { id: 'sano', label: 'Sano', color: '#e8f5ee' },
  { id: 'caries', label: 'Caries', color: '#f97316' },
  { id: 'obturacion', label: 'Obturacion', color: '#2563eb' },
  { id: 'endodoncia', label: 'Endodoncia', color: '#7c3aed' },
  { id: 'corona', label: 'Corona', color: '#f59e0b' },
  { id: 'implante', label: 'Implante', color: '#0f766e' },
  { id: 'ausente', label: 'Ausente', color: '#94a3b8' },
  { id: 'extraccion_indicada', label: 'Extraccion indicada', color: '#dc2626' },
  { id: 'fractura', label: 'Fractura', color: '#be123c' },
  { id: 'movilidad', label: 'Movilidad', color: '#0891b2' },
  { id: 'tratamiento_pendiente', label: 'Pendiente', color: '#facc15' },
  { id: 'tratamiento_realizado', label: 'Realizado', color: '#22c55e' },
];

interface Props {
  paciente: ApiPaciente;
  tratamientos: TratamientoCatalogo[];
  doctorId?: string | null;
  onPresupuestoCreado?: () => void;
}

function pieceMap(odontograma?: OdontogramaPaciente) {
  return new Map((odontograma?.piezas ?? []).map((pieza) => [pieza.pieza_fdi, pieza]));
}

function statusColor(status?: string | null) {
  return STATUSES.find((item) => item.id === status)?.color ?? '#ffffff';
}

function surfaceFor(piece: OdontogramaPieza | undefined, surface: OdontogramaSurfaceName) {
  return piece?.superficies.find((item) => item.superficie === surface);
}

function toothKind(fdi: number) {
  const unit = fdi % 10;
  if (unit <= 2) return 'incisor';
  if (unit === 3) return 'canine';
  if (unit <= 5) return 'premolar';
  return 'molar';
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function OdontogramaPacientePanel({ paciente, tratamientos, doctorId, onPresupuestoCreado }: Props) {
  const queryClient = useQueryClient();
  const [selectedTooth, setSelectedTooth] = useState<number>(24);
  const [selectedSurface, setSelectedSurface] = useState<OdontogramaSurfaceName>('oclusal_incisal');
  const [selectedStatus, setSelectedStatus] = useState<OdontogramaStatus>('tratamiento_pendiente');
  const [selectedTreatment, setSelectedTreatment] = useState<string>(tratamientos[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  const odontogramaQuery = useQuery({
    queryKey: ['odontograma-paciente', paciente.id],
    queryFn: () => getOdontogramaPaciente(paciente.id),
    staleTime: 30_000,
  });
  const odontograma = odontogramaQuery.data;
  const pieces = useMemo(() => pieceMap(odontograma), [odontograma]);
  const selectedPiece = pieces.get(selectedTooth);
  const selectedSurfaceData = surfaceFor(selectedPiece, selectedSurface);
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

  function renderTooth(fdi: number) {
    const piece = pieces.get(fdi);
    const mainColor = statusColor(piece?.estado_general);
    const selected = selectedTooth === fdi;
    const rootColor = statusColor(surfaceFor(piece, 'raiz')?.condicion);
    return (
      <button
        key={fdi}
        type="button"
        className={`clinical-tooth ${toothKind(fdi)}${selected ? ' selected' : ''}`}
        onClick={() => setSelectedTooth(fdi)}
        title={`Pieza ${fdi}`}
      >
        <svg viewBox="0 0 70 92" aria-hidden="true">
          <path className="tooth-root" style={{ fill: rootColor }} d="M23 47c-5 14-7 28-2 35 5-5 8-15 14-15s9 10 14 15c5-7 3-21-2-35Z" />
          <path className="tooth-crown" style={{ fill: mainColor }} d="M35 6C20 6 12 17 12 33c0 15 8 25 23 25s23-10 23-25C58 17 50 6 35 6Z" />
          <path style={{ fill: statusColor(surfaceFor(piece, 'vestibular')?.condicion) }} d="M18 18c7-7 27-7 34 0-3 7-9 10-17 10s-14-3-17-10Z" />
          <path style={{ fill: statusColor(surfaceFor(piece, 'lingual_palatal')?.condicion) }} d="M18 46c7 7 27 7 34 0-3-7-9-10-17-10s-14 3-17 10Z" />
          <path style={{ fill: statusColor(surfaceFor(piece, 'mesial')?.condicion) }} d="M13 31c0-6 2-10 5-13l12 14-12 14c-3-3-5-8-5-15Z" />
          <path style={{ fill: statusColor(surfaceFor(piece, 'distal')?.condicion) }} d="M57 31c0-6-2-10-5-13L40 32l12 14c3-3 5-8 5-15Z" />
          <ellipse style={{ fill: statusColor(surfaceFor(piece, 'oclusal_incisal')?.condicion) }} cx="35" cy="32" rx="10" ry="9" />
          <path className="tooth-line" d="M18 18c7-7 27-7 34 0M18 46c7 7 27 7 34 0M30 32h10M35 23v19" />
        </svg>
        <span>{fdi}</span>
      </button>
    );
  }

  return (
    <div className="odontograma-page">
      <section className="odontograma-board" aria-label="Odontograma adulto FDI">
        <div className="odontograma-board-head">
          <div>
            <strong>Odontograma clinico</strong>
            <span>{paciente.num_historial} - {paciente.apellidos}, {paciente.nombre}</span>
          </div>
          <div className="odontograma-kpis">
            <span>Version {odontograma?.version ?? 1}</span>
            <span>{plannedCount} planificados</span>
          </div>
        </div>
        <div className="arch-label">Arcada superior</div>
        <div className="tooth-arch upper">{UPPER.map(renderTooth)}</div>
        <div className="arch-midline" />
        <div className="tooth-arch lower">{LOWER.map(renderTooth)}</div>
        <div className="arch-label">Arcada inferior</div>
        <div className="odontograma-legend">
          {STATUSES.map((status) => (
            <button key={status.id} type="button" className={selectedStatus === status.id ? 'active' : ''} onClick={() => setSelectedStatus(status.id)}>
              <i style={{ background: status.color }} />{status.label}
            </button>
          ))}
        </div>
      </section>

      <aside className="odontograma-side">
        <div className="odontograma-side-section">
          <span className="eyebrow">Seleccion</span>
          <h3>Pieza {selectedTooth}</h3>
          <div className="surface-grid">
            {SURFACES.map((surface) => (
              <button
                key={surface.id}
                type="button"
                className={selectedSurface === surface.id ? 'active' : ''}
                onClick={() => setSelectedSurface(surface.id)}
              >
                {surface.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field compact-field">
          Tratamiento planificado
          <select value={selectedTreatment} onChange={(event) => setSelectedTreatment(event.target.value)}>
            <option value="">Sin tratamiento</option>
            {tratamientos.map((tratamiento) => (
              <option key={tratamiento.id} value={tratamiento.id}>
                {tratamiento.codigo ? `${tratamiento.codigo} - ` : ''}{tratamiento.nombre} ({Number(tratamiento.precio).toLocaleString('es-ES')} EUR)
              </option>
            ))}
          </select>
        </label>
        <label className="field compact-field">
          Notas de pieza/superficie
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder={selectedSurfaceData?.notas ?? selectedPiece?.notas ?? 'Notas clinicas concretas'} />
        </label>
        <div className="odontograma-actions">
          <button type="button" onClick={() => pieceMutation.mutate()} disabled={!odontograma || pieceMutation.isPending}>Guardar pieza</button>
          <button type="button" className="primary" onClick={() => surfaceMutation.mutate()} disabled={!odontograma || surfaceMutation.isPending}>Guardar superficie</button>
        </div>
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
      </aside>
      {odontogramaQuery.isLoading && <div className="loading-overlay">Cargando odontograma...</div>}
    </div>
  );
}
