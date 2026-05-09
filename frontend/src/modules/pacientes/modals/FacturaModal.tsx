import { useEffect, useState } from 'react';
import type { ApiPaciente, FormaPago, HistorialSinFacturar } from '../../../types/api';
import { formatDate, money } from '../../../lib/utils';

function asNumber(value?: string | number | null) {
  return Number(value ?? 0) || 0;
}

export function InvoiceCreationModal({
  paciente,
  lineas,
  formasPago,
  loading,
  saving,
  onClose,
  onGenerate,
}: {
  paciente: ApiPaciente;
  lineas: HistorialSinFacturar[];
  formasPago: FormaPago[];
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onGenerate: (data: {
    lineas: HistorialSinFacturar[];
    fecha: string;
    serie: string;
    formaPagoId: string | null;
    descuento: number;
    generarCobro: boolean;
  }) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [serie, setSerie] = useState('A');
  const [formaPagoId, setFormaPagoId] = useState<string>(formasPago[0]?.id ?? '');
  const [descuento, setDescuento] = useState(0);
  const [generarCobro, setGenerarCobro] = useState(false);
  const selectedLineas = lineas.filter((linea) => selectedIds.includes(linea.id));
  const availableLineas = lineas.filter((linea) => !selectedIds.includes(linea.id));
  const discountFactor = 1 - Math.max(0, Math.min(100, descuento)) / 100;
  const subtotal = selectedLineas.reduce((sum, linea) => sum + asNumber(linea.tratamiento_precio), 0);
  const base = selectedLineas.reduce((sum, linea) => sum + asNumber(linea.tratamiento_precio) * discountFactor, 0);
  const iva = selectedLineas.reduce((sum, linea) => {
    const neto = asNumber(linea.tratamiento_precio) * discountFactor;
    return sum + (neto * asNumber(linea.tratamiento_iva)) / 100;
  }, 0);
  const total = base + iva;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!formaPagoId && formasPago[0]?.id) setFormaPagoId(formasPago[0].id);
  }, [formaPagoId, formasPago]);

  function move(id: string) {
    setSelectedIds((current) => current.includes(id) ? current : [...current, id]);
  }

  function remove(id: string) {
    setSelectedIds((current) => current.filter((item) => item !== id));
  }

  function renderRows(rows: HistorialSinFacturar[], action: (id: string) => void) {
    return rows.map((linea) => (
      <tr key={linea.id} onDoubleClick={() => action(linea.id)}>
        <td>{formatDate(linea.fecha)}</td>
        <td>
          <strong>{linea.tratamiento_nombre}</strong>
          <small>{linea.pieza_dental ? `Pieza ${linea.pieza_dental}` : linea.doctor_nombre}</small>
        </td>
        <td className="num">{money(linea.tratamiento_precio)}</td>
      </tr>
    ));
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="document-modal invoice-creation-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-titlebar">
          <strong>Creación de facturas</strong>
          <button onClick={onClose}>Cerrar</button>
        </header>
        <div className="invoice-creation-shell">
          <div className="invoice-creation-top">
            <label>Nombre
              <input readOnly value={`${paciente.apellidos}, ${paciente.nombre}`} />
            </label>
            <label>Nº Historial
              <input readOnly value={paciente.num_historial} />
            </label>
            <span className="invoice-sif-stamp">SIF / VERI*FACTU listo</span>
          </div>

          <div className="invoice-creation-grid">
            <section>
              <h3>Tratamientos no facturados</h3>
              <div className="invoice-picker-table">
                <table className="euro-table">
                  <thead><tr><th>Fecha</th><th>Tratamiento</th><th>Importe</th></tr></thead>
                  <tbody>
                    {loading && <tr><td colSpan={3}>Cargando tratamientos pendientes...</td></tr>}
                    {!loading && renderRows(availableLineas, move)}
                    {!loading && !availableLineas.length && <tr><td colSpan={3}>No hay tratamientos pendientes de facturar.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="invoice-transfer-buttons">
              <button onClick={() => setSelectedIds(lineas.map((linea) => linea.id))} title="Pasar todos">→</button>
              <button onClick={() => setSelectedIds([])} title="Quitar todos">←</button>
            </div>

            <section>
              <h3>Tratamientos a facturar</h3>
              <div className="invoice-picker-table">
                <table className="euro-table">
                  <thead><tr><th>Fecha</th><th>Tratamiento</th><th>Importe</th></tr></thead>
                  <tbody>
                    {renderRows(selectedLineas, remove)}
                    {!selectedLineas.length && <tr><td colSpan={3}>Selecciona tratamientos con doble clic o con la flecha.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="invoice-patient-data">
              <h3>Datos del paciente</h3>
              <dl>
                <dt>DNI/NIE</dt><dd>{paciente.dni_nie || '-'}</dd>
                <dt>Dirección</dt><dd>{paciente.direccion || '-'}</dd>
                <dt>Población</dt><dd>{[paciente.codigo_postal, paciente.ciudad, paciente.provincia].filter(Boolean).join(' - ') || '-'}</dd>
                <dt>Teléfono</dt><dd>{paciente.telefono || '-'}</dd>
              </dl>
            </section>

            <section className="invoice-fiscal-data">
              <h3>Datos de factura</h3>
              <div className="invoice-fiscal-form">
                <label>Fecha<input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} /></label>
                <label>Serie<input value={serie} onChange={(event) => setSerie(event.target.value.toUpperCase().slice(0, 5))} /></label>
                <label>Número<input readOnly value="Auto" /></label>
                <label>Forma de pago
                  <select value={formaPagoId} onChange={(event) => setFormaPagoId(event.target.value)}>
                    <option value="">Sin forma</option>
                    {formasPago.map((forma) => <option key={forma.id} value={forma.id}>{forma.nombre}</option>)}
                  </select>
                </label>
                <label>Descuento %
                  <input type="number" min={0} max={100} value={descuento} onChange={(event) => setDescuento(Number(event.target.value) || 0)} />
                </label>
                <label>Subtotal<input readOnly value={money(subtotal)} /></label>
                <label>Base imponible<input readOnly value={money(base)} /></label>
                <label>IVA<input readOnly value={money(iva)} /></label>
                <label>Total<input readOnly value={money(total)} /></label>
              </div>
              <label className="invoice-paid-toggle">
                <input type="checkbox" checked={generarCobro} onChange={(event) => setGenerarCobro(event.currentTarget.checked)} />
                Generar cobro y marcar como pagada
              </label>
              <p>Al generar se crea RF, huella, QR fiscal, PDF archivado y evento SIF.</p>
              <button className="primary-action" disabled={!selectedLineas.length || saving} onClick={() => onGenerate({
                lineas: selectedLineas,
                fecha,
                serie,
                formaPagoId: formaPagoId || null,
                descuento,
                generarCobro,
              })}>
                {saving ? 'Generando...' : 'Generar factura'}
              </button>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
