import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Chart from 'chart.js/auto';
import {
  createClinica,
  createProductoInventario,
  enableTwoFactor,
  getClinicas,
  getIngresosReporte,
  getInventario,
  importPacientes,
  syncOffline,
  updateProductoInventario,
} from '../../lib/api';
import { addOfflinePending, clearOfflinePending, getOfflinePending } from '../../lib/offline';

type Tab = 'clinicas' | 'inventario' | 'reportes' | 'offline' | 'importacion' | 'seguridad';

export default function AdminExtrasPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('clinicas');
  const [clinicaForm, setClinicaForm] = useState({ nombre: '', direccion: '' });
  const [productoForm, setProductoForm] = useState({ nombre: '', stock_min: '0', stock_act: '0' });
  const [desde, setDesde] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));
  const [importText, setImportText] = useState('nombre,apellidos,dni_nie,telefono\nAna,Garcia,12345678A,600000000');
  const [twoFactor, setTwoFactor] = useState<{ secret: string; qrDataUrl: string; otpauthUrl: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const reportCanvas = useRef<HTMLCanvasElement | null>(null);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const clinicasQuery = useQuery({ queryKey: ['clinicas'], queryFn: getClinicas });
  const inventarioQuery = useQuery({ queryKey: ['inventario'], queryFn: getInventario });
  const ingresosQuery = useQuery({ queryKey: ['ingresos', desde, hasta], queryFn: () => getIngresosReporte(desde, hasta) });

  const crearClinica = useMutation({
    mutationFn: () => createClinica(clinicaForm),
    onSuccess: () => {
      setClinicaForm({ nombre: '', direccion: '' });
      void queryClient.invalidateQueries({ queryKey: ['clinicas'] });
    },
  });

  const crearProducto = useMutation({
    mutationFn: () => createProductoInventario({
      nombre: productoForm.nombre,
      stock_min: Number(productoForm.stock_min),
      stock_act: Number(productoForm.stock_act),
    }),
    onSuccess: () => {
      setProductoForm({ nombre: '', stock_min: '0', stock_act: '0' });
      void queryClient.invalidateQueries({ queryKey: ['inventario'] });
    },
  });

  const actualizarProducto = useMutation({
    mutationFn: ({ id, stock_act }: { id: string; stock_act: number }) => updateProductoInventario(id, { stock_act }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['inventario'] }),
  });

  const importar = useMutation({
    mutationFn: () => {
      const [header, ...rows] = importText.trim().split(/\r?\n/);
      const keys = header.split(',').map((item) => item.trim());
      return importPacientes(rows.map((row) => Object.fromEntries(row.split(',').map((value, index) => [keys[index], value.trim()]))));
    },
  });

  useEffect(() => {
    if (!reportCanvas.current || tab !== 'reportes') return undefined;
    const data = ingresosQuery.data ?? { total: 0, pac: 0, seg: 0 };
    const chart = new Chart(reportCanvas.current, {
      type: 'bar',
      data: {
        labels: ['Total', 'Pacientes', 'Seguros'],
        datasets: [{
          label: 'Ingresos',
          data: [data.total, data.pac, data.seg],
          backgroundColor: ['#2563eb', '#16a34a', '#f59e0b'],
          borderRadius: 6,
          maxBarThickness: 54,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) => `${Number(context.raw).toFixed(2)} €` } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (value) => `${value} €` } },
        },
      },
    });
    return () => chart.destroy();
  }, [ingresosQuery.data, tab]);

  function submitClinica(event: FormEvent) {
    event.preventDefault();
    crearClinica.mutate();
  }

  function submitProducto(event: FormEvent) {
    event.preventDefault();
    crearProducto.mutate();
  }

  return (
    <section className="page fichero-screen admin-extras">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Clínicas, inventario, BI y seguridad</h1>
        </div>
        <span className={online ? 'online-pill' : 'offline-pill'}>{online ? 'Con conexión' : 'Sin conexión'}</span>
      </div>

      <nav className="file-tabs">
        {(['clinicas', 'inventario', 'reportes', 'offline', 'importacion', 'seguridad'] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item === 'clinicas' && 'Clínicas'}
            {item === 'inventario' && 'Inventario'}
            {item === 'reportes' && 'Reportes'}
            {item === 'offline' && 'Offline'}
            {item === 'importacion' && 'Importación'}
            {item === 'seguridad' && '2FA'}
          </button>
        ))}
      </nav>

      {tab === 'clinicas' && (
        <div className="fichero-grid">
          <section className="desk-panel">
            <div className="panel-caption"><strong>Clínicas</strong></div>
            <table className="euro-table"><thead><tr><th>Nombre</th><th>Dirección</th><th>Activa</th></tr></thead><tbody>
              {(clinicasQuery.data ?? []).map((clinica) => <tr key={clinica.id}><td>{clinica.nombre}</td><td>{clinica.direccion}</td><td>{clinica.activa ? 'Sí' : 'No'}</td></tr>)}
            </tbody></table>
          </section>
          <form className="desk-panel settings-form" onSubmit={submitClinica}>
            <div className="panel-caption"><strong>Nueva clínica</strong></div>
            <label>Nombre<input value={clinicaForm.nombre} onChange={(e) => setClinicaForm((p) => ({ ...p, nombre: e.target.value }))} required /></label>
            <label>Dirección<input value={clinicaForm.direccion} onChange={(e) => setClinicaForm((p) => ({ ...p, direccion: e.target.value }))} /></label>
            <button type="submit">Crear clínica</button>
          </form>
        </div>
      )}

      {tab === 'inventario' && (
        <div className="fichero-grid">
          <section className="desk-panel">
            <div className="panel-caption"><strong>Stock y alertas</strong></div>
            <table className="euro-table"><thead><tr><th>Producto</th><th>Mín.</th><th>Actual</th><th>Alerta</th><th></th></tr></thead><tbody>
              {(inventarioQuery.data ?? []).map((producto) => (
                <tr key={producto.id} className={producto.stock_act < producto.stock_min ? 'stock-alert-row' : ''}>
                  <td>{producto.nombre}</td><td>{producto.stock_min}</td>
                  <td><input className="stock-input" defaultValue={producto.stock_act} onBlur={(e) => actualizarProducto.mutate({ id: producto.id, stock_act: Number(e.target.value) })} /></td>
                  <td>{producto.stock_act < producto.stock_min ? 'Bajo mínimo' : 'OK'}</td><td></td>
                </tr>
              ))}
            </tbody></table>
          </section>
          <form className="desk-panel settings-form" onSubmit={submitProducto}>
            <div className="panel-caption"><strong>Nuevo producto</strong></div>
            <label>Nombre<input value={productoForm.nombre} onChange={(e) => setProductoForm((p) => ({ ...p, nombre: e.target.value }))} required /></label>
            <label>Stock mínimo<input value={productoForm.stock_min} onChange={(e) => setProductoForm((p) => ({ ...p, stock_min: e.target.value }))} /></label>
            <label>Stock actual<input value={productoForm.stock_act} onChange={(e) => setProductoForm((p) => ({ ...p, stock_act: e.target.value }))} /></label>
            <button type="submit">Crear producto</button>
          </form>
        </div>
      )}

      {tab === 'reportes' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Ingresos</strong><label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label></div>
          <div className="bi-chart"><canvas ref={reportCanvas} aria-label="Ingresos por origen" /></div>
        </section>
      )}

      {tab === 'offline' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Modo offline</strong></div>
          <p>La app marca “Sin conexión” cuando el navegador pierde red. Los datos pendientes se guardan en IndexedDB y se sincronizan con `/api/sync` al volver.</p>
          <div className="editor-actions">
            <button onClick={async () => {
              await addOfflinePending({ type: 'paciente', payload: { idTemp: `tmp-${Date.now()}`, nombre: 'Paciente offline' } });
              setPendingCount((await getOfflinePending()).length);
            }}>Crear pendiente demo</button>
            <button onClick={async () => {
              const pending = await getOfflinePending();
              const pacientes = pending.filter((item) => item.type === 'paciente').map((item) => item.payload);
              const citas = pending.filter((item) => item.type === 'cita').map((item) => item.payload);
              await syncOffline({ pacientes, citas });
              await clearOfflinePending();
              setPendingCount(0);
            }}>Sincronizar ahora</button>
          </div>
          <p>Pendientes locales: {pendingCount}</p>
        </section>
      )}

      {tab === 'importacion' && (
        <section className="desk-panel settings-form">
          <div className="panel-caption"><strong>Importar pacientes CSV</strong></div>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} />
          <button onClick={() => importar.mutate()}>Importar</button>
          {importar.data && <p>Creados: {importar.data.creados}. Errores: {importar.data.errores.length}</p>}
        </section>
      )}

      {tab === 'seguridad' && (
        <section className="desk-panel settings-form">
          <div className="panel-caption"><strong>Doble factor</strong></div>
          <button onClick={async () => setTwoFactor(await enableTwoFactor())}>Activar/mostrar QR 2FA</button>
          {twoFactor?.qrDataUrl && <img className="qr-preview" src={twoFactor.qrDataUrl} alt="QR 2FA" />}
          {twoFactor && <p>Secret: {twoFactor.secret}</p>}
        </section>
      )}
    </section>
  );
}
