import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Eye,
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
  onVistaCompleta?: () => void;
}

type MenuPosition = {
  top: number;
  left: number;
  maxHeight: number;
};

const MENU_WIDTH = 300;
const MENU_GAP = 8;
const MENU_MARGIN = 10;
const MENU_MAX_HEIGHT = 420;

function getMenuPosition(anchor: HTMLElement): MenuPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.min(
    Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
    Math.max(MENU_MARGIN, viewportWidth - MENU_WIDTH - MENU_MARGIN),
  );
  const belowTop = rect.bottom + MENU_GAP;
  const belowSpace = viewportHeight - belowTop - MENU_MARGIN;
  const aboveSpace = rect.top - MENU_GAP - MENU_MARGIN;
  const opensUp = belowSpace < 220 && aboveSpace > belowSpace;
  const maxHeight = Math.max(180, Math.min(MENU_MAX_HEIGHT, opensUp ? aboveSpace : belowSpace));
  const top = opensUp
    ? Math.max(MENU_MARGIN, rect.top - MENU_GAP - maxHeight)
    : belowTop;

  return { top, left, maxHeight };
}

export function PatientActionsMenu({
  paciente,
  busy,
  canManageBilling = true,
  handlers,
}: {
  paciente: ApiPaciente | null;
  busy?: boolean;
  canManageBilling?: boolean;
  handlers: PatientActionsHandlers;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const noPatient = !paciente;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function refreshPosition() {
      if (moreButtonRef.current) setMenuPosition(getMenuPosition(moreButtonRef.current));
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', refreshPosition);
    window.addEventListener('scroll', refreshPosition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', refreshPosition);
      window.removeEventListener('scroll', refreshPosition, true);
    };
  }, [open]);

  function toggleMenu() {
    if (!moreButtonRef.current) return;
    setMenuPosition(getMenuPosition(moreButtonRef.current));
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
  const menu = open && !noPatient && menuPosition ? (
    <div
      ref={menuRef}
      className="patient-actions-menu"
      role="menu"
      aria-label="Mas acciones del paciente"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
        maxHeight: menuPosition.maxHeight,
      }}
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
        <button
          type="button"
          role="menuitem"
          onClick={recetaEnabled ? fire(handlers.onCrearReceta!) : undefined}
          disabled={!recetaEnabled}
          title={recetaEnabled ? undefined : 'Disponible cuando hay paciente'}
        >
          <Pill size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Recetas</span>
        </button>
        <button type="button" role="menuitem" onClick={fire(handlers.onConsentimiento)}>
          <FileSignature size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Consentimiento informado</span>
        </button>
        <button type="button" role="menuitem" onClick={fire(handlers.onRevocarConsentimiento)}>
          <XCircle size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Revocar consentimiento</span>
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
        <button type="button" role="menuitem" onClick={fire(handlers.onCuestionarioMedico)}>
          <ClipboardList size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>Documento cuestionario medico</span>
        </button>
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
    </div>
  ) : null;

  return (
    <div className="patient-actions" ref={containerRef}>
      <div className="patient-actions-primary" aria-label="Acciones rapidas del paciente">
        <button type="button" onClick={handlers.onNuevaCita} disabled={noPatient}>
          <CalendarPlus size={14} strokeWidth={2} aria-hidden="true" />
          <span>Nueva cita</span>
        </button>
        {canManageBilling && (
          <button type="button" onClick={handlers.onCobrar} disabled={noPatient}>
            <CreditCard size={14} strokeWidth={2} aria-hidden="true" />
            <span>Cobrar</span>
          </button>
        )}
        <button
          ref={moreButtonRef}
          type="button"
          className="patient-actions-more"
          onClick={toggleMenu}
          disabled={noPatient}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Mas acciones"
        >
          <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Mas acciones</span>
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
