import {
CalendarPlus,
ClipboardList,
Copy,
CreditCard,
Eye,
FileSignature,
FileText,
FlaskConical,
MessageCircle,
MoreHorizontal,
Pill,
Receipt,
ShieldCheck,
StickyNote,
Upload,
XCircle,
} from 'lucide-react';
import { useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApiPaciente } from '../../api/types';
import { FloatingPopover } from '../../design-system/FloatingPopover';
import './patient-actions.css';

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
  onVistaCompleta?: () => void;
}

export function PatientActionsMenu({
  paciente,
  busy,
  canManageBilling = true,
  canViewClinicalDocuments = true,
  handlers,
}: {
  paciente: ApiPaciente | null;
  busy?: boolean;
  canManageBilling?: boolean;
  canViewClinicalDocuments?: boolean;
  handlers: PatientActionsHandlers;
}) {
  const [open, setOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const noPatient = !paciente;

  function toggleMenu() {
    setOpen((prev) => !prev);
  }

  function fire(action: () => void) {
    return () => {
      setOpen(false);
      action();
    };
  }

  const recetaEnabled = Boolean(handlers.onCrearReceta);
  const laboratorioEnabled = Boolean(handlers.onPedidoLaboratorio);
  const menu = open && !noPatient ? (
    <FloatingPopover
      anchorRef={moreButtonRef}
      onClose={() => setOpen(false)}
      width={276}
      className="patient-actions-menu"
      role="menu"
      aria-label="Mas acciones del paciente"
    >
      <div className="patient-actions-menu-group" role="group" aria-label="Clinico">
        <span className="patient-actions-group">Clinico</span>
        <button
          type="button"
          role="menuitem"
          onClick={fire(handlers.onNuevoPresupuesto)}
          disabled={busy}
        >
          <Receipt size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Nuevo presupuesto</span>
        </button>
        {canViewClinicalDocuments && <><button
          type="button"
          role="menuitem"
          onClick={recetaEnabled ? fire(handlers.onCrearReceta!) : undefined}
          disabled={!recetaEnabled}
          title={recetaEnabled ? undefined : 'Disponible cuando hay paciente'}
        >
          <Pill size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Nueva receta</span>
        </button>
        <button type="button" role="menuitem" onClick={fire(handlers.onConsentimiento)}>
          <FileSignature size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Consentimiento informado</span>
        </button>
        <button type="button" role="menuitem" onClick={fire(handlers.onRevocarConsentimiento)}>
          <XCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Revocar consentimiento</span>
        </button></>}
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
      </div>
      <div className="patient-actions-menu-group" role="group" aria-label="Documentos">
        <span className="patient-actions-group">Documentos</span>
        <button type="button" role="menuitem" onClick={fire(handlers.onSubirDocumento)}>
          <Upload size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Subir documento</span>
        </button>
        <button type="button" role="menuitem" onClick={fire(handlers.onCircular)}>
          <FileText size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Circular / justificante</span>
        </button>
        {canViewClinicalDocuments && <button type="button" role="menuitem" onClick={fire(handlers.onCuestionarioMedico)}>
          <ClipboardList size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Documento cuestionario medico</span>
        </button>}
        <button type="button" role="menuitem" onClick={fire(handlers.onDocumentoLOPD)}>
          <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Documento LOPD</span>
        </button>
      </div>
      <div className="patient-actions-menu-group" role="group" aria-label="Comunicacion">
        <span className="patient-actions-group">Comunicacion</span>
        <button type="button" role="menuitem" onClick={fire(handlers.onWhatsApp)}>
          <MessageCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>WhatsApp</span>
        </button>
      </div>
      <div className="patient-actions-menu-group" role="group" aria-label="Otros">
        <span className="patient-actions-group">Otros</span>
        <button
          type="button"
          role="menuitem"
          onClick={handlers.onVistaCompleta ? fire(handlers.onVistaCompleta) : undefined}
          disabled={!handlers.onVistaCompleta}
        >
          <Eye size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Vista completa</span>
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
    </FloatingPopover>
  ) : null;

  return (
    <div className="patient-actions">
      <div className="patient-actions-primary" aria-label="Acciones rapidas del paciente">
        <button type="button" aria-label="Nueva cita" title="Nueva cita" onClick={handlers.onNuevaCita} disabled={noPatient}>
          <CalendarPlus size={14} strokeWidth={2} aria-hidden="true" />
          <span>Nueva cita</span>
        </button>
        <button type="button" aria-label="Nuevo presupuesto" title="Nuevo presupuesto" onClick={handlers.onNuevoPresupuesto} disabled={noPatient || busy}>
          <Receipt size={14} strokeWidth={2} aria-hidden="true" />
          <span>Nuevo presupuesto</span>
        </button>
        {canManageBilling && (
          <button type="button" aria-label="Cobrar" title="Cobrar" onClick={handlers.onCobrar} disabled={noPatient}>
            <CreditCard size={14} strokeWidth={2} aria-hidden="true" />
            <span>Cobrar</span>
          </button>
        )}
        <button type="button" aria-label="Subir documento" title="Subir documento" onClick={handlers.onSubirDocumento} disabled={noPatient}>
          <Upload size={14} strokeWidth={2} aria-hidden="true" />
          <span>Subir documento</span>
        </button>
        <button
          ref={moreButtonRef}
          data-task-return
          type="button"
          className="patient-actions-more"
          onClick={toggleMenu}
          disabled={noPatient}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Mas acciones del paciente"
        >
          <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Mas acciones</span>
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
