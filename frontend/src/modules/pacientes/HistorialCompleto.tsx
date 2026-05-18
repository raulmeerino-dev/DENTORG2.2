import { useMemo, useState } from 'react';
import type { ApiPaciente, Cita, Consentimiento, DocumentoPaciente, Factura, HistorialClinico, PagoAnticipadoPaciente, Presupuesto, RecetaClinica, TrabajoLaboratorio, UserRole } from '../../types/api';
import { formatDate, fullName, money } from '../../lib/utils';
import { PatientOdontogramFlow } from '../odontogram';

type HistoryFilter = 'todo' | 'clinico' | 'citas' | 'presupuestos' | 'facturacion' | 'cobros' | 'documentos' | 'consentimientos' | 'recetas' | 'laboratorio' | 'odontograma';

type TimelineEvent = {
  id: string;
  date: string;
  filter: HistoryFilter;
  label: string;
  title: string;
  detail: string;
  meta?: string;
  amount?: string;
  action?: () => void;
};

const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'todo', label: 'Todo' },
  { id: 'clinico', label: 'Clinico' },
  { id: 'citas', label: 'Citas' },
  { id: 'presupuestos', label: 'Presupuestos' },
  { id: 'facturacion', label: 'Facturacion' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'consentimientos', label: 'Consentimientos' },
  { id: 'recetas', label: 'Recetas' },
  { id: 'laboratorio', label: 'Laboratorio' },
  { id: 'odontograma', label: 'Odontograma' },
];

function sortDesc(a: TimelineEvent, b: TimelineEvent) {
  return b.date.localeCompare(a.date);
}

export function HistorialCompletoPanel({
  paciente,
  historial,
  citas,
  presupuestos,
  facturas,
  anticipos,
  documentos,
  consentimientos,
  recetas = [],
  laboratorio = [],
  onOpenDocumento,
  onOpenConsentimiento,
  onOpenFactura,
  onOpenReceta,
  userRole,
}: {
  paciente: ApiPaciente | null;
  historial: HistorialClinico[];
  citas: Cita[];
  presupuestos: Presupuesto[];
  facturas: Factura[];
  anticipos: PagoAnticipadoPaciente[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  recetas?: RecetaClinica[];
  laboratorio?: TrabajoLaboratorio[];
  onOpenDocumento: (documento: DocumentoPaciente) => void;
  onOpenConsentimiento: (consentimiento: Consentimiento) => void;
  onOpenFactura: (factura: Factura) => void;
  onOpenReceta?: (receta: RecetaClinica) => void;
  userRole?: UserRole | null;
}) {
  const [filter, setFilter] = useState<HistoryFilter>('todo');
  const events = useMemo<TimelineEvent[]>(() => {
    const next: TimelineEvent[] = [];

    historial.forEach((entrada) => {
      const tratamiento = entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental';
      next.push({
        id: `hist-${entrada.id}`,
        date: entrada.fecha,
        filter: 'clinico',
        label: 'Clinico',
        title: tratamiento,
        detail: entrada.observaciones || entrada.diagnostico || entrada.estado,
        meta: [entrada.pieza_dental ? `Pieza ${entrada.pieza_dental}` : null, entrada.caras, entrada.doctor?.nombre].filter(Boolean).join(' · '),
        amount: entrada.importe ? money(entrada.importe) : undefined,
      });
      if (entrada.pieza_dental) {
        next.push({
          id: `odon-${entrada.id}`,
          date: entrada.fecha,
          filter: 'odontograma',
          label: 'Odontograma',
          title: `Pieza ${entrada.pieza_dental}`,
          detail: `${tratamiento} - ${entrada.estado}`,
          meta: entrada.caras ? `Caras ${entrada.caras}` : 'Pieza completa',
        });
      }
    });

    citas.forEach((cita) => {
      next.push({
        id: `cita-${cita.id}`,
        date: cita.fecha_hora,
        filter: 'citas',
        label: 'Cita',
        title: cita.motivo || 'Cita dental',
        detail: cita.observaciones || cita.estado,
        meta: `${formatDate(cita.fecha_hora)} ${cita.fecha_hora.slice(11, 16)} · ${cita.duracion_min} min`,
      });
    });

    presupuestos.forEach((presupuesto) => {
      const aceptadas = presupuesto.lineas.filter((linea) => linea.aceptado).length;
      next.push({
        id: `pres-${presupuesto.id}`,
        date: presupuesto.fecha,
        filter: 'presupuestos',
        label: 'Presupuesto',
        title: `Presupuesto #${presupuesto.numero}`,
        detail: `${presupuesto.estado} · ${aceptadas}/${presupuesto.lineas.length} lineas aceptadas`,
        meta: `${presupuesto.lineas.length} lineas`,
        amount: money(presupuesto.total),
      });
    });

    facturas.forEach((factura) => {
      next.push({
        id: `fac-${factura.id}`,
        date: factura.fecha,
        filter: 'facturacion',
        label: 'Factura',
        title: `${factura.serie}/${factura.numero}`,
        detail: `${factura.estado} · pendiente ${money(factura.pendiente)}`,
        amount: money(factura.total),
        action: () => onOpenFactura(factura),
      });
      factura.cobros.forEach((cobro) => {
        next.push({
          id: `cobro-${cobro.id}`,
          date: cobro.fecha,
          filter: 'cobros',
          label: cobro.anulado_at ? 'Cobro anulado' : 'Cobro',
          title: `${factura.serie}/${factura.numero}`,
          detail: cobro.motivo_anulacion || cobro.notas || 'Pago registrado',
          amount: cobro.anulado_at ? '0,00' : money(cobro.importe),
          action: () => onOpenFactura(factura),
        });
      });
    });

    anticipos.forEach((anticipo) => {
      next.push({
        id: `anticipo-${anticipo.id}`,
        date: anticipo.fecha,
        filter: 'cobros',
        label: anticipo.anulado_at ? 'Anticipo anulado' : 'Anticipo',
        title: anticipo.concepto || 'Pago anticipado',
        detail: anticipo.motivo_anulacion || anticipo.notas || 'Pago a cuenta',
        amount: anticipo.anulado_at ? '0,00' : money(anticipo.importe),
      });
    });

    documentos.forEach((documento) => {
      next.push({
        id: `doc-${documento.id}`,
        date: documento.fecha_documento || documento.created_at || '',
        filter: 'documentos',
        label: 'Documento',
        title: documento.nombre_original,
        detail: documento.descripcion || documento.categoria || 'Documento del paciente',
        meta: documento.etiquetas || undefined,
        action: () => onOpenDocumento(documento),
      });
    });

    consentimientos.forEach((consentimiento) => {
      next.push({
        id: `cons-${consentimiento.id}`,
        date: consentimiento.fecha_firma || consentimiento.created_at,
        filter: 'consentimientos',
        label: 'Consentimiento',
        title: consentimiento.tipo,
        detail: consentimiento.estado,
        meta: consentimiento.documento_path ? 'PDF archivado' : 'Pendiente de documento',
        action: () => onOpenConsentimiento(consentimiento),
      });
    });

    recetas.forEach((receta) => {
      next.push({
        id: `receta-${receta.id}`,
        date: receta.fecha_prescripcion,
        filter: 'recetas',
        label: 'Receta',
        title: receta.medicamento,
        detail: receta.posologia,
        meta: [receta.doctor?.nombre, receta.firma_data_url ? 'firmada' : null].filter(Boolean).join(' · '),
        action: onOpenReceta ? () => onOpenReceta(receta) : undefined,
      });
    });

    laboratorio.forEach((trabajo) => {
      const fecha = trabajo.fecha_recepcion ?? trabajo.fecha_salida ?? trabajo.fecha_entrega_prevista ?? '';
      if (!fecha) return;
      next.push({
        id: `lab-${trabajo.id}`,
        date: fecha,
        filter: 'laboratorio',
        label: 'Laboratorio',
        title: trabajo.descripcion,
        detail: trabajo.estado.replace(/_/g, ' '),
        meta: [
          trabajo.numero_orden ? `Nº ${trabajo.numero_orden}` : null,
          trabajo.laboratorio?.nombre,
          trabajo.pieza_dental ? `Pieza ${trabajo.pieza_dental}` : null,
        ].filter(Boolean).join(' · '),
        amount: trabajo.coste_laboratorio ? money(trabajo.coste_laboratorio) : undefined,
      });
    });

    return next.sort(sortDesc);
  }, [anticipos, citas, consentimientos, documentos, facturas, historial, laboratorio, onOpenConsentimiento, onOpenDocumento, onOpenFactura, onOpenReceta, presupuestos, recetas]);

  const visibleEvents = filter === 'todo' ? events : events.filter((event) => event.filter === filter);

  return (
    <section className="complete-history-panel">
      <header className="complete-history-head">
        <div>
          <span>Historial completo</span>
          <strong>{paciente ? fullName(paciente) : 'Sin paciente seleccionado'}</strong>
        </div>
        <em>{visibleEvents.length} eventos visibles</em>
      </header>

      <nav className="history-filter-tabs" aria-label="Filtros del historial completo">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="complete-history-layout">
        <ol className="complete-history-timeline">
          {visibleEvents.map((event) => (
            <li key={event.id} className={`history-event history-event-${event.filter}`}>
              <time>{formatDate(event.date)}</time>
              <span>{event.label}</span>
              <div>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
                {(event.meta || event.amount || event.action) && (
                  <footer>
                    {event.meta && <small>{event.meta}</small>}
                    {event.amount && <b>{event.amount}</b>}
                    {event.action && <button type="button" onClick={event.action}>Abrir</button>}
                  </footer>
                )}
              </div>
            </li>
          ))}
          {!visibleEvents.length && <li className="history-event empty">No hay eventos para este filtro.</li>}
        </ol>

        <details className="odontogram-support-panel history-odontogram-panel">
          <summary>Ver odontograma asociado al historial</summary>
          <PatientOdontogramFlow
            paciente={paciente}
            mode="history"
            title="Odontograma historico"
            subtitle="Consulta de piezas vinculadas a eventos clinicos y documentos."
            readOnly
            enableQuickTreatments={false}
            userRole={userRole}
          />
        </details>
      </div>
    </section>
  );
}
