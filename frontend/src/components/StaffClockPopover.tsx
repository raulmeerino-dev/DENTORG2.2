import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage, getTrabajadoresFichaje, getUltimoFichajeTrabajador, registrarFichaje } from '../lib/api';
import type { FichajeTrabajador, TipoFichaje } from '../types/api';

type StaffClockPopoverProps = {
  label: string;
};

function formatFichajeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function lastFichajeLabel(fichaje?: FichajeTrabajador | null) {
  if (!fichaje) return 'Sin fichajes previos.';
  const tipo = fichaje.tipo === 'entrada' ? 'Entrada' : 'Salida';
  return `Ultimo fichaje: ${tipo} - ${formatFichajeTime(fichaje.hora_exacta)}`;
}

export default function StaffClockPopover({ label }: StaffClockPopoverProps) {
  const queryClient = useQueryClient();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [trabajadorId, setTrabajadorId] = useState('');
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const trabajadoresQuery = useQuery({
    queryKey: ['fichaje', 'trabajadores'],
    queryFn: getTrabajadoresFichaje,
    enabled: open,
    staleTime: 60_000,
  });

  const trabajadores = useMemo(() => trabajadoresQuery.data ?? [], [trabajadoresQuery.data]);
  const effectiveTrabajadorId = useMemo(() => {
    if (trabajadores.some((trabajador) => trabajador.id === trabajadorId)) return trabajadorId;
    return trabajadores[0]?.id ?? '';
  }, [trabajadorId, trabajadores]);
  const selectedTrabajador = useMemo(
    () => trabajadores.find((trabajador) => trabajador.id === effectiveTrabajadorId) ?? null,
    [effectiveTrabajadorId, trabajadores],
  );

  const ultimoQuery = useQuery({
    queryKey: ['fichaje', 'ultimo', effectiveTrabajadorId],
    queryFn: () => getUltimoFichajeTrabajador(effectiveTrabajadorId),
    enabled: open && Boolean(effectiveTrabajadorId),
  });

  const fichajeMutation = useMutation({
    mutationFn: (tipo: TipoFichaje) => registrarFichaje({
      trabajador_id: effectiveTrabajadorId,
      pin,
      tipo,
    }),
    onSuccess: (data) => {
      setPin('');
      setFormError(null);
      setOpen(false);
      queryClient.setQueryData(['fichaje', 'ultimo', data.fichaje.trabajador_id], data.fichaje);
      void queryClient.invalidateQueries({ queryKey: ['fichaje'] });
      toast.success(data.fichaje.tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'No se pudo registrar el fichaje.'));
    },
  });

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function submit(tipo: TipoFichaje) {
    if (!effectiveTrabajadorId) {
      setFormError('Selecciona un trabajador.');
      return;
    }
    if (!pin.trim()) {
      setFormError('Introduce el PIN del trabajador.');
      return;
    }
    setFormError(null);
    fichajeMutation.mutate(tipo);
  }

  const canSubmit = Boolean(effectiveTrabajadorId && pin.trim()) && !fichajeMutation.isPending;

  return (
    <div className="staff-clock" ref={wrapperRef}>
      <button
        type="button"
        className="title-clock app-launcher-clock staff-clock-trigger"
        aria-label={`Fichaje: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Fichaje"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open && (
        <section className="staff-clock-popover" role="dialog" aria-label="Fichaje">
          <header>
            <strong>Fichaje</strong>
            <small>{label}</small>
          </header>

          <div className="staff-clock-form">
            <label>
              <span>Trabajador</span>
              <select
                value={effectiveTrabajadorId}
                onChange={(event) => {
                  setTrabajadorId(event.target.value);
                  setFormError(null);
                }}
                disabled={trabajadoresQuery.isLoading || !trabajadores.length}
              >
                {trabajadores.map((trabajador) => (
                  <option key={`${trabajador.origen}-${trabajador.id}`} value={trabajador.id}>
                    {trabajador.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>PIN</span>
              <input
                type="password"
                value={pin}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Codigo personal"
                onChange={(event) => {
                  setPin(event.target.value);
                  setFormError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit('entrada');
                }}
              />
            </label>

            <p className="staff-clock-last" aria-live="polite">
              {trabajadoresQuery.isLoading && 'Cargando trabajadores...'}
              {!trabajadoresQuery.isLoading && trabajadoresQuery.isError && 'No se pudo cargar el personal.'}
              {!trabajadoresQuery.isLoading && !trabajadoresQuery.isError && !trabajadores.length && 'No hay trabajadores disponibles.'}
              {!trabajadoresQuery.isLoading && !trabajadoresQuery.isError && trabajadores.length > 0 && !effectiveTrabajadorId && 'Selecciona trabajador.'}
              {!trabajadoresQuery.isLoading && selectedTrabajador && ultimoQuery.isLoading && 'Cargando ultimo fichaje...'}
              {!trabajadoresQuery.isLoading && selectedTrabajador && !ultimoQuery.isLoading && lastFichajeLabel(ultimoQuery.data)}
            </p>

            {formError && <p className="staff-clock-error" role="alert">{formError}</p>}

            <div className="staff-clock-actions">
              <button type="button" onClick={() => submit('entrada')} disabled={!canSubmit}>
                {fichajeMutation.isPending ? <Loader2 size={14} strokeWidth={2} aria-hidden="true" /> : null}
                Registrar entrada
              </button>
              <button type="button" onClick={() => submit('salida')} disabled={!canSubmit}>
                Registrar salida
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
