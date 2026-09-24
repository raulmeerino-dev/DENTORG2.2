import { formatDate, money } from '../../shared/format';
import { fullName } from './patientName';
import type { ApiPaciente,Cita,Consentimiento,DocumentoPaciente,Factura,HistorialClinico,Presupuesto,TrabajoLaboratorio } from '../../api/types';
import { getBillingTotals } from '../billing/patient-account/billingUtils';
import { readableHealthData } from './healthDisplay';
import type { WorkTab } from './index';

export function PatientFullViewModal({
  paciente,
  facturas,
  canManageBilling = true,
  historial,
  citas,
  presupuestos,
  documentos,
  consentimientos,
  laboratorio,
  onClose,
  onEdit,
  onOpenTab,
}: {
  paciente: ApiPaciente;
  facturas: Factura[];
  canManageBilling?: boolean;
  historial: HistorialClinico[];
  citas: Cita[];
  presupuestos: Presupuesto[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  laboratorio: TrabajoLaboratorio[];
  onClose: () => void;
  onEdit: () => void;
  onOpenTab: (tab: WorkTab) => void;
}) {
  const address = [paciente.direccion, paciente.codigo_postal, paciente.ciudad, paciente.provincia].filter(Boolean).join(' - ');
  const healthText = readableHealthData(paciente.datos_salud);
  const recentHistory = historial.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const nowIso = new Date().toISOString();
  const nextCita = citas
    .filter((cita) => cita.fecha_hora >= nowIso && !['anulada', 'falta', 'cancelled_by_patient'].includes(cita.estado))
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0] ?? null;
  const lastVisit = recentHistory[0] ?? null;
  const billingTotals = getBillingTotals(facturas);
  const tratamientosPendientes = presupuestos.flatMap((presupuesto) => presupuesto.lineas).filter((linea) => linea.aceptado && !linea.pasado_trabajo_pendiente);
  const initials = `${paciente.nombre?.[0] ?? ''}${paciente.apellidos?.[0] ?? ''}`.toUpperCase();

  function go(tab: WorkTab) {
    onOpenTab(tab);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <section className="patient-full-modal" aria-label="Vista completa del paciente">
        <header className="patient-full-head">
          <div className="patient-full-identity">
            <span className="patient-full-avatar">{initials}</span>
            <div>
              <span>Ficha completa</span>
              <strong>{fullName(paciente)}</strong>
              <em>Historia {paciente.num_historial} - {paciente.codigo ?? `#${String(paciente.num_historial).padStart(6, '0')}`}</em>
            </div>
          </div>
          <div className="patient-full-actions">
            <button type="button" onClick={() => go('facturacion')}>Historial / fact.</button>
            <button type="button" onClick={() => go('presupuestos')}>Presupuestos</button>
            <button type="button" onClick={onEdit}>Editar ficha</button>
            <button type="button" onClick={onClose}>Cerrar</button>
          </div>
        </header>

        <div className="patient-full-kpis">
          <div><span>Proxima cita</span><strong>{nextCita ? `${formatDate(nextCita.fecha_hora)} ${nextCita.fecha_hora.slice(11, 16)}` : 'Sin cita'}</strong><small>{nextCita?.motivo ?? 'No hay tratamiento previsto'}</small></div>
          <div><span>Ultima visita</span><strong>{lastVisit ? formatDate(lastVisit.fecha) : 'Sin historial'}</strong><small>{lastVisit?.procedimiento || lastVisit?.tratamiento?.nombre || 'Sin tratamiento registrado'}</small></div>
          {canManageBilling && (
            <div><span>Pendiente</span><strong className={billingTotals.pendiente > 0 ? 'debt' : ''}>{money(billingTotals.pendiente)}</strong><small>Facturado {money(billingTotals.facturado)} - cobrado {money(billingTotals.cobrado)}</small></div>
          )}
          <div><span>Documentos</span><strong>{documentos.length}</strong><small>{consentimientos.length} consentimientos - {laboratorio.length} trabajos lab.</small></div>
        </div>

        <div className="patient-full-grid">
          <section>
            <h3>Datos personales</h3>
            <dl>
              <div><dt>Nombre</dt><dd>{paciente.apellidos}, {paciente.nombre}</dd></div>
              <div><dt>DNI/NIE</dt><dd>{paciente.dni_nie || '-'}</dd></div>
              <div><dt>Nacimiento</dt><dd>{formatDate(paciente.fecha_nacimiento) || '-'}</dd></div>
              <div><dt>Telefono</dt><dd>{paciente.telefono || '-'}</dd></div>
              <div><dt>Movil</dt><dd>{paciente.telefono2 || '-'}</dd></div>
              <div><dt>Email</dt><dd>{paciente.email || '-'}</dd></div>
              <div className="wide"><dt>Direccion</dt><dd>{address || '-'}</dd></div>
            </dl>
          </section>

          <section>
            <h3>Clinica y avisos</h3>
            <dl>
              <div className="wide"><dt>Salud</dt><dd>{healthText || 'Sin alertas registradas.'}</dd></div>
              <div className="wide"><dt>Observaciones generales</dt><dd>{paciente.observaciones || 'Sin observaciones generales.'}</dd></div>
            </dl>
          </section>

          <section className="span-2">
            <h3>Historial reciente</h3>
            <div className="patient-full-list">
              {recentHistory.slice(0, 6).map((entrada) => (
                <article key={entrada.id}>
                  <time>{formatDate(entrada.fecha)}</time>
                  <strong>{entrada.procedimiento || entrada.tratamiento?.nombre || 'Tratamiento dental'}</strong>
                  <span>Pieza {entrada.pieza_dental ?? '-'} - {entrada.estado}</span>
                  <small>{entrada.observaciones || entrada.diagnostico || 'Sin comentario.'}</small>
                </article>
              ))}
              {!recentHistory.length && <p>Sin entradas clinicas.</p>}
            </div>
          </section>

          <section>
            <h3>Presupuestos y pendientes</h3>
            <div className="patient-full-list compact">
              {tratamientosPendientes.slice(0, 5).map((linea) => (
                <article key={linea.id}>
                  <strong>{linea.tratamiento?.nombre ?? 'Tratamiento'}</strong>
                  <span>Pieza {linea.pieza_dental ?? '-'} - {money(linea.importe_neto)}</span>
                </article>
              ))}
              {!tratamientosPendientes.length && <p>Sin tratamientos pendientes aceptados.</p>}
            </div>
          </section>

          {canManageBilling && (
            <section>
              <h3>Facturacion</h3>
              <div className="patient-full-list compact">
                {facturas.slice(0, 5).map((factura) => (
                  <article key={factura.id}>
                    <strong>{factura.serie}-{factura.numero}</strong>
                    <span>{formatDate(factura.fecha)} - {factura.estado}</span>
                    <small>Total {money(factura.total)} - pendiente {money(factura.pendiente)}</small>
                  </article>
                ))}
                {!facturas.length && <p>Sin facturas.</p>}
              </div>
            </section>
          )}

          <section>
            <h3>Proximas citas</h3>
            <div className="patient-full-list compact">
              {citas.filter((cita) => cita.fecha_hora >= nowIso).slice(0, 5).map((cita) => (
                <article key={cita.id}>
                  <strong>{formatDate(cita.fecha_hora)} {cita.fecha_hora.slice(11, 16)}</strong>
                  <span>{cita.motivo || 'Cita dental'} - {cita.estado}</span>
                  <small>{cita.observaciones || 'Sin observaciones.'}</small>
                </article>
              ))}
              {!citas.filter((cita) => cita.fecha_hora >= nowIso).length && <p>Sin citas proximas.</p>}
            </div>
          </section>

          <section>
            <h3>Documentos y consentimientos</h3>
            <div className="patient-full-list compact">
              {documentos.slice(0, 4).map((documento) => (
                <article key={documento.id}>
                  <strong>{documento.nombre_original}</strong>
                  <span>{documento.categoria} - {formatDate(documento.fecha_documento ?? documento.created_at)}</span>
                </article>
              ))}
              {consentimientos.slice(0, 3).map((consentimiento) => (
                <article key={consentimiento.id}>
                  <strong>{consentimiento.tipo}</strong>
                  <span>{consentimiento.estado} - {formatDate(consentimiento.created_at)}</span>
                </article>
              ))}
              {!documentos.length && !consentimientos.length && <p>Sin documentos ni consentimientos.</p>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
