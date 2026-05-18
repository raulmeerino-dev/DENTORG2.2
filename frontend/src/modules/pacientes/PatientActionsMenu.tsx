import { useEffect, useRef, useState } from 'react';
import type { ApiPaciente } from '../../types/api';

export interface PatientActionsHandlers {
  onNuevaCita: () => void;
  onNuevoPresupuesto: () => void;
  onCobrar: () => void;
  onSubirDocumento: () => void;
  onCrearReceta?: () => void;            // Fase 3 — disabled si no se pasa
  onConsentimiento: () => void;
  onRevocarConsentimiento: () => void;
  onCircular: () => void;
  onCuestionarioMedico: () => void;
  onDocumentoLOPD: () => void;
  onPedidoLaboratorio?: () => void;       // Fase 4 — disabled si no se pasa
  onWhatsApp: () => void;
  onComentario: () => void;
  onCopiarDatos: () => void;
}

export function PatientActionsMenu({
  paciente,
  busy,
  handlers,
}: {
  paciente: ApiPaciente | null;
  busy?: boolean;
  handlers: PatientActionsHandlers;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const noPatient = !paciente;

  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function fire(action: () => void) {
    return () => {
      setOpen(false);
      action();
    };
  }

  const recetaEnabled = Boolean(handlers.onCrearReceta);
  const laboratorioEnabled = Boolean(handlers.onPedidoLaboratorio);

  return (
    <div className="patient-actions" ref={containerRef}>
      <div className="patient-actions-primary" aria-label="Acciones rapidas del paciente">
        <button type="button" onClick={handlers.onNuevaCita} disabled={noPatient}>Nueva cita</button>
        <button
          type="button"
          onClick={handlers.onNuevoPresupuesto}
          disabled={noPatient || busy}
        >
          Nuevo ppto.
        </button>
        <button type="button" onClick={handlers.onCobrar} disabled={noPatient}>Cobrar</button>
        <button type="button" onClick={handlers.onSubirDocumento} disabled={noPatient}>Subir doc.</button>
        <button
          type="button"
          className="patient-actions-more"
          onClick={() => setOpen((prev) => !prev)}
          disabled={noPatient}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Mas acciones"
        >
          <span aria-hidden="true">⋯</span>
          <span className="sr-only">Mas acciones</span>
        </button>
      </div>
      {open && !noPatient && (
        <div className="patient-actions-menu" role="menu" aria-label="Mas acciones del paciente">
          <span className="patient-actions-group">Clinico</span>
          <button
            type="button"
            role="menuitem"
            onClick={recetaEnabled ? fire(handlers.onCrearReceta!) : undefined}
            disabled={!recetaEnabled}
            title={recetaEnabled ? undefined : 'Disponible en proxima fase'}
          >
            Crear receta
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onConsentimiento)}>Consentimiento informado</button>
          <button type="button" role="menuitem" onClick={fire(handlers.onRevocarConsentimiento)}>Revocar consentimiento</button>
          <button type="button" role="menuitem" onClick={fire(handlers.onCircular)}>Circular / justificante</button>
          <button type="button" role="menuitem" onClick={fire(handlers.onCuestionarioMedico)}>Documento cuestionario medico</button>
          <button type="button" role="menuitem" onClick={fire(handlers.onDocumentoLOPD)}>Documento LOPD</button>
          <button
            type="button"
            role="menuitem"
            onClick={laboratorioEnabled ? fire(handlers.onPedidoLaboratorio!) : undefined}
            disabled={!laboratorioEnabled}
            title={laboratorioEnabled ? undefined : 'Disponible en proxima fase'}
          >
            Pedido de laboratorio
          </button>
          <span className="patient-actions-group">Comunicacion</span>
          <button type="button" role="menuitem" onClick={fire(handlers.onWhatsApp)}>WhatsApp</button>
          <button type="button" role="menuitem" onClick={fire(handlers.onComentario)}>Comentario / nota</button>
          <button type="button" role="menuitem" onClick={fire(handlers.onCopiarDatos)}>Copiar datos</button>
        </div>
      )}
    </div>
  );
}

export function buildWhatsAppUrl(paciente: ApiPaciente | null): string | null {
  const raw = paciente?.telefono || paciente?.telefono2;
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
