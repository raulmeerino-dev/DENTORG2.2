import { useEffect, useRef, useState } from 'react';
import {
  MoreHorizontal,
  Pill,
  FileSignature,
  XCircle,
  FileText,
  ClipboardList,
  ShieldCheck,
  FlaskConical,
  MessageCircle,
  StickyNote,
  Copy,
  CalendarPlus,
  Receipt,
  CreditCard,
  Upload,
} from 'lucide-react';
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
        <button type="button" onClick={handlers.onNuevaCita} disabled={noPatient}>
          <CalendarPlus size={14} strokeWidth={2} aria-hidden="true" />
          <span>Nueva cita</span>
        </button>
        <button
          type="button"
          onClick={handlers.onNuevoPresupuesto}
          disabled={noPatient || busy}
        >
          <Receipt size={14} strokeWidth={2} aria-hidden="true" />
          <span>Nuevo ppto.</span>
        </button>
        <button type="button" onClick={handlers.onCobrar} disabled={noPatient}>
          <CreditCard size={14} strokeWidth={2} aria-hidden="true" />
          <span>Cobrar</span>
        </button>
        <button type="button" onClick={handlers.onSubirDocumento} disabled={noPatient}>
          <Upload size={14} strokeWidth={2} aria-hidden="true" />
          <span>Subir doc.</span>
        </button>
        <button
          type="button"
          className="patient-actions-more"
          onClick={() => setOpen((prev) => !prev)}
          disabled={noPatient}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Mas acciones"
        >
          <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
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
            <Pill size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Crear receta</span>
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onConsentimiento)}>
            <FileSignature size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Consentimiento informado</span>
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onRevocarConsentimiento)}>
            <XCircle size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Revocar consentimiento</span>
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onCircular)}>
            <FileText size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Circular / justificante</span>
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onCuestionarioMedico)}>
            <ClipboardList size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Documento cuestionario medico</span>
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onDocumentoLOPD)}>
            <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Documento LOPD</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={laboratorioEnabled ? fire(handlers.onPedidoLaboratorio!) : undefined}
            disabled={!laboratorioEnabled}
            title={laboratorioEnabled ? undefined : 'Disponible en proxima fase'}
          >
            <FlaskConical size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Pedido de laboratorio</span>
          </button>
          <span className="patient-actions-group">Comunicacion</span>
          <button type="button" role="menuitem" onClick={fire(handlers.onWhatsApp)}>
            <MessageCircle size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>WhatsApp</span>
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onComentario)}>
            <StickyNote size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Comentario / nota</span>
          </button>
          <button type="button" role="menuitem" onClick={fire(handlers.onCopiarDatos)}>
            <Copy size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Copiar datos</span>
          </button>
        </div>
      )}
    </div>
  );
}
