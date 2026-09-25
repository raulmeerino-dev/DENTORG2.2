import { useMemo, useRef, useState } from 'react';
import './patient-finder.css';
import type { ApiPaciente } from '../../api/types';
import { FloatingPopover } from '../../design-system/FloatingPopover';


function normalizePatientFinderText(value?: string | number | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function PatientFinder({
  pacientes,
  selectedId,
  onSelect,
  onNew,
  query: controlledQuery,
  onQueryChange,
  loading = false,
  pageLabel,
  hasPreviousPage = false,
  hasNextPage = false,
  onPreviousPage,
  onNextPage,
}: {
  pacientes: ApiPaciente[];
  selectedId: string | null;
  onSelect: (paciente: ApiPaciente) => void;
  onNew?: () => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  pageLabel?: string;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
}) {
  const [localQuery, setLocalQuery] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const restoringFocus = useRef(false);
  const query = controlledQuery ?? localQuery;
  const usesServerSearch = Boolean(onQueryChange);
  const filtered = useMemo(() => {
    if (usesServerSearch) return pacientes;
    const q = normalizePatientFinderText(query).trim();
    if (!q) return pacientes.slice(0, 12);
    const tokens = q.split(/\s+/).filter(Boolean);
    return pacientes.filter((p) => {
      const haystack = normalizePatientFinderText([
        p.num_historial,
        p.codigo,
        p.nombre,
        p.apellidos,
        p.telefono,
        p.telefono2,
        p.dni_nie,
        p.email,
      ].filter(Boolean).join(' '));
      return tokens.every((token) => haystack.includes(token));
    }).slice(0, 10);
  }, [pacientes, query, usesServerSearch]);

  function updateQuery(value: string) {
    if (onQueryChange) {
      onQueryChange(value);
    } else {
      setLocalQuery(value);
    }
  }

  function selectPaciente(paciente: ApiPaciente) {
    onSelect(paciente);
    setResultsOpen(false);
    updateQuery('');
  }

  function closeResults() {
    setResultsOpen(false);
    // Escape restores the anchor focus; that focus event must not reopen the search.
    restoringFocus.current = true;
    queueMicrotask(() => { restoringFocus.current = false; });
  }

  return (
    <div className="dc-patient-finder" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setResultsOpen(false);
    }}>
      {onNew && <button
        type="button"
        className="dc-patient-new-shortcut"
        onClick={onNew}
        title="Nueva ficha de paciente"
        aria-label="Nueva ficha de paciente"
      >
        <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M2 19c0-3.314 3.134-6 7-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="16" y1="13" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>}
      <label className="dc-patient-search-label">
        <input
          ref={searchRef}
          id="patient-search-input"
          aria-label="Buscar paciente"
          value={query}
          onChange={(event) => {
            updateQuery(event.target.value);
            setResultsOpen(true);
          }}
          onFocus={() => { if (!restoringFocus.current) setResultsOpen(true); }}
          placeholder="Buscar paciente..."
          autoComplete="off"
        />
      </label>
      {resultsOpen && (
        <FloatingPopover anchorRef={searchRef} width={420} maxHeight={420} align="start" onClose={closeResults} className="dc-patient-live-results dc-patient-finder-results" role="region" aria-label="Resultados de pacientes">
          {loading && <span>Buscando pacientes...</span>}
          {filtered.map((paciente) => (
            <button
              type="button"
              className={paciente.id === selectedId ? 'active' : ''}
              key={paciente.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectPaciente(paciente)}
            >
              <strong>{paciente.apellidos}, {paciente.nombre}</strong>
              <span>{paciente.telefono ?? 'sin telefono'} · H{String(paciente.num_historial).padStart(4, '0')}</span>
            </button>
          ))}
          {!loading && !filtered.length && <span>No hay pacientes con ese criterio. Revisa telefono, DNI o crea una ficha nueva.</span>}
          {(pageLabel || hasPreviousPage || hasNextPage) && (
            <div className="dc-patient-finder-pagination" aria-label="Paginacion de pacientes">
              <button
                type="button"
                disabled={!hasPreviousPage}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPreviousPage?.()}
              >
                Anterior
              </button>
              {pageLabel && <small>{pageLabel}</small>}
              <button
                type="button"
                disabled={!hasNextPage}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onNextPage?.()}
              >
                Siguiente
              </button>
            </div>
          )}
        </FloatingPopover>
      )}
    </div>
  );
}
