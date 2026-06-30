import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createClinica,
  createPedidoInventario,
  createProductoInventario,
  createProveedorInventario,
  enableTwoFactor,
  getAuditLog,
  getClinicas,
  getInventario,
  getMovimientosInventario,
  getPedidosInventario,
  getProveedoresInventario,
  importPacientes,
  recibirPedidoInventario,
  registrarMovimientoInventario,
  syncOffline,
  updatePedidoInventario,
  updateProductoInventario,
} from '../../lib/api';
import { addOfflinePending, clearOfflinePending, getOfflinePending } from '../../lib/offline';
import { ADMIN_TABS } from './tabs';
import type { AdminTabId } from './tabs';
import { AdminReportes } from './AdminReportes';
import { ConfiguracionWorkspace } from './ConfiguracionWorkspace';
import type { FicheroTab } from './configuracionTabs';

type Tab = AdminTabId;
type MovimientoTipo = 'entrada' | 'salida' | 'ajuste' | 'consumo_factura';

const ADMIN_TAB_ALIASES: Record<string, Tab> = {
  catalogo: 'tratamientos',
  tratamientos: 'tratamientos',
  usuarios: 'usuarios',
  roles: 'usuarios',
  doctores: 'doctores',
  agenda: 'agenda',
  caja: 'general',
  laboratorio: 'laboratorio',
  documentos: 'documentos',
  backups: 'seguridad',
  seguridad: 'seguridad',
};

const CONFIG_TAB_BY_ADMIN: Partial<Record<Tab, FicheroTab>> = {
  general: 'general',
  usuarios: 'roles',
  doctores: 'doctores',
  tratamientos: 'tratamientos',
  agenda: 'agenda',
  laboratorio: 'laboratorio',
  documentos: 'documentos',
  seguridad: 'seguridad',
};

export default function AdminExtrasPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') ?? 'general';
  const normalizedTab = (ADMIN_TAB_ALIASES[requestedTab] ?? requestedTab) as Tab;
  const tab = ADMIN_TABS.some((item) => item.id === normalizedTab) ? normalizedTab : 'general';
  const [clinicaForm, setClinicaForm] = useState({ nombre: '', direccion: '' });
  const [productoForm, setProductoForm] = useState({
    nombre: '',
    categoria: '',
    sku: '',
    stock_min: '0',
    stock_act: '0',
    unidad: 'ud',
    coste_unitario: '0',
    proveedor_id: '',
  });
  const [productoActivoId, setProductoActivoId] = useState('');
  const [movimientoForm, setMovimientoForm] = useState<{ tipo: MovimientoTipo; cantidad: string; motivo: string }>({
    tipo: 'entrada',
    cantidad: '1',
    motivo: '',
  });
  const [proveedorForm, setProveedorForm] = useState({ nombre: '', contacto: '', telefono: '', email: '', notas: '' });
  const [pedidoForm, setPedidoForm] = useState({ proveedor_id: '', producto_id: '', cantidad: '1', coste_unitario: '0', notas: '' });
  const [importText, setImportText] = useState('nombre,apellidos,dni_nie,telefono\nAna,Garcia,12345678A,600000000');
  const [twoFactor, setTwoFactor] = useState<{ secret: string; qrDataUrl: string; otpauthUrl: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const clinicasQuery = useQuery({ queryKey: ['clinicas'], queryFn: getClinicas });
  const inventarioQuery = useQuery({ queryKey: ['inventario'], queryFn: getInventario });
  const proveedoresQuery = useQuery({ queryKey: ['inventario-proveedores'], queryFn: getProveedoresInventario, enabled: tab === 'inventario' });
  const pedidosQuery = useQuery({ queryKey: ['inventario-pedidos'], queryFn: getPedidosInventario, enabled: tab === 'inventario' });
  const movimientosQuery = useQuery({
    queryKey: ['inventario-movimientos', productoActivoId],
    queryFn: () => getMovimientosInventario(productoActivoId),
    enabled: Boolean(productoActivoId),
  });
  const auditoriaQuery = useQuery({ queryKey: ['auditoria'], queryFn: () => getAuditLog(), enabled: tab === 'auditoria' });

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
      categoria: productoForm.categoria || null,
      sku: productoForm.sku || null,
      stock_min: Number(productoForm.stock_min),
      stock_act: Number(productoForm.stock_act),
      unidad: productoForm.unidad || 'ud',
      coste_unitario: Number(productoForm.coste_unitario),
      proveedor_id: productoForm.proveedor_id || null,
    }),
    onSuccess: () => {
      setProductoForm({ nombre: '', categoria: '', sku: '', stock_min: '0', stock_act: '0', unidad: 'ud', coste_unitario: '0', proveedor_id: '' });
      void queryClient.invalidateQueries({ queryKey: ['inventario'] });
    },
  });

  const actualizarProducto = useMutation({
    mutationFn: ({ id, stock_act }: { id: string; stock_act: number }) => updateProductoInventario(id, { stock_act }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['inventario'] }),
  });

  const registrarMovimiento = useMutation({
    mutationFn: () => registrarMovimientoInventario(productoActivoId, {
      tipo: movimientoForm.tipo,
      cantidad: Number(movimientoForm.cantidad),
      motivo: movimientoForm.motivo || null,
    }),
    onSuccess: () => {
      setMovimientoForm({ tipo: 'entrada', cantidad: '1', motivo: '' });
      void queryClient.invalidateQueries({ queryKey: ['inventario'] });
      void queryClient.invalidateQueries({ queryKey: ['inventario-movimientos', productoActivoId] });
    },
  });

  const crearProveedor = useMutation({
    mutationFn: () => createProveedorInventario({
      nombre: proveedorForm.nombre,
      contacto: proveedorForm.contacto || null,
      telefono: proveedorForm.telefono || null,
      email: proveedorForm.email || null,
      notas: proveedorForm.notas || null,
    }),
    onSuccess: () => {
      setProveedorForm({ nombre: '', contacto: '', telefono: '', email: '', notas: '' });
      void queryClient.invalidateQueries({ queryKey: ['inventario-proveedores'] });
    },
  });

  const crearPedido = useMutation({
    mutationFn: () => createPedidoInventario({
      proveedor_id: pedidoForm.proveedor_id,
      notas: pedidoForm.notas || null,
      lineas: [{
        producto_id: pedidoForm.producto_id,
        cantidad: Number(pedidoForm.cantidad),
        coste_unitario: Number(pedidoForm.coste_unitario),
      }],
    }),
    onSuccess: () => {
      setPedidoForm((prev) => ({ ...prev, cantidad: '1', coste_unitario: '0', notas: '' }));
      void queryClient.invalidateQueries({ queryKey: ['inventario-pedidos'] });
    },
  });

  const marcarPedidoEnviado = useMutation({
    mutationFn: (id: string) => updatePedidoInventario(id, { estado: 'enviado' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['inventario-pedidos'] }),
  });

  const recibirPedido = useMutation({
    mutationFn: (id: string) => recibirPedidoInventario(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventario'] });
      void queryClient.invalidateQueries({ queryKey: ['inventario-pedidos'] });
      if (productoActivoId) void queryClient.invalidateQueries({ queryKey: ['inventario-movimientos', productoActivoId] });
    },
  });

  const importar = useMutation({
    mutationFn: () => {
      const [header, ...rows] = importText.trim().split(/\r?\n/);
      const keys = header.split(',').map((item) => item.trim());
      return importPacientes(rows.map((row) => Object.fromEntries(row.split(',').map((value, index) => [keys[index], value.trim()]))));
    },
  });

  useEffect(() => {
    async function flushOfflineQueue() {
      if (!navigator.onLine) return;
      const pending = await getOfflinePending();
      if (!pending.length) {
        setPendingCount(0);
        return;
      }
      const pacientes = pending.filter((item) => item.type === 'paciente').map((item) => item.payload);
      const citas = pending.filter((item) => item.type === 'cita').map((item) => item.payload);
      await syncOffline({ pacientes, citas });
      await clearOfflinePending();
      setPendingCount(0);
    }
    window.addEventListener('online', flushOfflineQueue);
    void flushOfflineQueue();
    return () => window.removeEventListener('online', flushOfflineQueue);
  }, []);

  function selectTab(nextTab: Tab) {
    setSearchParams(nextTab === 'general' ? {} : { tab: nextTab }, { replace: true });
  }

  function renderConfigTab(nextTab: Tab) {
    const configTab = CONFIG_TAB_BY_ADMIN[nextTab];
    if (!configTab) return null;
    return (
      <ConfiguracionWorkspace
        activeTab={configTab}
        embedded
        showTabs={false}
        showToolbar={false}
      />
    );
  }

  function submitClinica(event: FormEvent) {
    event.preventDefault();
    crearClinica.mutate();
  }

  function submitProducto(event: FormEvent) {
    event.preventDefault();
    crearProducto.mutate();
  }

  function submitProveedor(event: FormEvent) {
    event.preventDefault();
    crearProveedor.mutate();
  }

  function submitPedido(event: FormEvent) {
    event.preventDefault();
    if (!pedidoForm.proveedor_id || !pedidoForm.producto_id) return;
    crearPedido.mutate();
  }

  return (
    <section className="page page-shell fichero-screen admin-extras">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Administracion</h1>
        </div>
        <span className={online ? 'online-pill' : 'offline-pill'}>{online ? 'Con conexión' : 'Sin conexión'}</span>
      </div>

      <nav className="file-tabs">
        {ADMIN_TABS.map((item) => (
          <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'clinicas' && (
        <div className="fichero-grid">
          <section className="desk-panel">
            <div className="panel-caption"><strong>Clínicas</strong></div>
            <table className="dentcore-table"><thead><tr><th>Nombre</th><th>Dirección</th><th>Activa</th></tr></thead><tbody>
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

      {['general', 'usuarios', 'doctores', 'tratamientos', 'agenda', 'laboratorio', 'documentos'].includes(tab) && renderConfigTab(tab)}

      {tab === 'inventario' && (
        <div className="fichero-grid inventory-layout">
          <section className="desk-panel inventory-stock-panel">
            <div className="panel-caption">
              <strong>Stock y alertas</strong>
              <span>{(inventarioQuery.data ?? []).filter((producto) => producto.stock_act < producto.stock_min).length} bajo mínimo</span>
            </div>
            <table className="dentcore-table">
              <thead><tr><th>Producto</th><th>Cat.</th><th>Proveedor</th><th>Mín.</th><th>Actual</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {(inventarioQuery.data ?? []).map((producto) => {
                  const proveedor = (proveedoresQuery.data ?? []).find((item) => item.id === producto.proveedor_id);
                  return (
                    <tr key={producto.id} className={producto.stock_act < producto.stock_min ? 'stock-alert-row' : ''}>
                      <td><strong>{producto.nombre}</strong><span className="muted-cell">{producto.sku || producto.unidad}</span></td>
                      <td>{producto.categoria || '-'}</td>
                      <td>{proveedor?.nombre || '-'}</td>
                      <td>{producto.stock_min}</td>
                      <td><input className="stock-input" defaultValue={producto.stock_act} onBlur={(e) => actualizarProducto.mutate({ id: producto.id, stock_act: Number(e.target.value) })} /></td>
                      <td>{producto.stock_act < producto.stock_min ? 'Bajo mínimo' : 'OK'}</td>
                      <td><button type="button" onClick={() => setProductoActivoId(producto.id)}>Mov.</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="desk-panel settings-form inventory-side">
            <details className="admin-create-panel">
              <summary>Nuevo producto</summary>
              <form onSubmit={submitProducto}>
              <label>Nombre<input value={productoForm.nombre} onChange={(e) => setProductoForm((p) => ({ ...p, nombre: e.target.value }))} required /></label>
              <div className="form-grid-2">
                <label>Categoría<input value={productoForm.categoria} onChange={(e) => setProductoForm((p) => ({ ...p, categoria: e.target.value }))} /></label>
                <label>SKU<input value={productoForm.sku} onChange={(e) => setProductoForm((p) => ({ ...p, sku: e.target.value }))} /></label>
                <label>Stock mínimo<input type="number" min="0" value={productoForm.stock_min} onChange={(e) => setProductoForm((p) => ({ ...p, stock_min: e.target.value }))} /></label>
                <label>Stock actual<input type="number" min="0" value={productoForm.stock_act} onChange={(e) => setProductoForm((p) => ({ ...p, stock_act: e.target.value }))} /></label>
                <label>Unidad<input value={productoForm.unidad} onChange={(e) => setProductoForm((p) => ({ ...p, unidad: e.target.value }))} /></label>
                <label>Coste<input type="number" min="0" step="0.01" value={productoForm.coste_unitario} onChange={(e) => setProductoForm((p) => ({ ...p, coste_unitario: e.target.value }))} /></label>
              </div>
              <label>Proveedor
                <select value={productoForm.proveedor_id} onChange={(e) => setProductoForm((p) => ({ ...p, proveedor_id: e.target.value }))}>
                  <option value="">Sin proveedor</option>
                  {(proveedoresQuery.data ?? []).map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                </select>
              </label>
                <button type="submit">Crear producto</button>
              </form>
            </details>
            {productoActivoId && (
              <details className="admin-create-panel movement-form" open>
                <summary>Movimiento</summary>
                <form onSubmit={(event) => { event.preventDefault(); registrarMovimiento.mutate(); }}>
                  <label>Tipo<select value={movimientoForm.tipo} onChange={(e) => setMovimientoForm((p) => ({ ...p, tipo: e.target.value as MovimientoTipo }))}>
                    <option value="entrada">Entrada</option>
                    <option value="salida">Salida</option>
                    <option value="ajuste">Ajuste a cantidad</option>
                    <option value="consumo_factura">Consumo por factura</option>
                  </select></label>
                  <div className="form-grid-2">
                    <label>Cantidad<input type="number" min="1" value={movimientoForm.cantidad} onChange={(e) => setMovimientoForm((p) => ({ ...p, cantidad: e.target.value }))} /></label>
                    <label>Motivo<input value={movimientoForm.motivo} onChange={(e) => setMovimientoForm((p) => ({ ...p, motivo: e.target.value }))} /></label>
                  </div>
                  <button type="submit">Registrar movimiento</button>
                  <div className="movement-list">
                    {(movimientosQuery.data ?? []).slice(0, 5).map((mov) => <p key={mov.id}><strong>{mov.tipo}</strong> {mov.cantidad} -&gt; {mov.stock_resultante}</p>)}
                  </div>
                </form>
              </details>
            )}
          </div>

          <section className="desk-panel settings-form">
            <details className="admin-create-panel">
              <summary>Nuevo proveedor</summary>
              <form onSubmit={submitProveedor}>
              <label>Nombre<input value={proveedorForm.nombre} onChange={(e) => setProveedorForm((p) => ({ ...p, nombre: e.target.value }))} required /></label>
              <div className="form-grid-2">
                <label>Contacto<input value={proveedorForm.contacto} onChange={(e) => setProveedorForm((p) => ({ ...p, contacto: e.target.value }))} /></label>
                <label>Teléfono<input value={proveedorForm.telefono} onChange={(e) => setProveedorForm((p) => ({ ...p, telefono: e.target.value }))} /></label>
                <label>Email<input value={proveedorForm.email} onChange={(e) => setProveedorForm((p) => ({ ...p, email: e.target.value }))} /></label>
                <label>Notas<input value={proveedorForm.notas} onChange={(e) => setProveedorForm((p) => ({ ...p, notas: e.target.value }))} /></label>
              </div>
                <button type="submit">Crear proveedor</button>
              </form>
            </details>
            <div className="compact-list">
              {(proveedoresQuery.data ?? []).slice(0, 6).map((proveedor) => (
                <p key={proveedor.id}><strong>{proveedor.nombre}</strong><span>{proveedor.telefono || proveedor.email || proveedor.contacto || '-'}</span></p>
              ))}
            </div>
          </section>

          <section className="desk-panel settings-form">
            <details className="admin-create-panel">
              <summary>Nuevo pedido</summary>
              <form onSubmit={submitPedido}>
              <label>Proveedor
                <select value={pedidoForm.proveedor_id} onChange={(e) => setPedidoForm((p) => ({ ...p, proveedor_id: e.target.value }))} required>
                  <option value="">Seleccionar</option>
                  {(proveedoresQuery.data ?? []).map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                </select>
              </label>
              <label>Producto
                <select value={pedidoForm.producto_id} onChange={(e) => {
                  const producto = (inventarioQuery.data ?? []).find((item) => item.id === e.target.value);
                  setPedidoForm((p) => ({ ...p, producto_id: e.target.value, coste_unitario: String(producto?.coste_unitario ?? p.coste_unitario) }));
                }} required>
                  <option value="">Seleccionar</option>
                  {(inventarioQuery.data ?? []).map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}
                </select>
              </label>
              <div className="form-grid-2">
                <label>Cantidad<input type="number" min="1" value={pedidoForm.cantidad} onChange={(e) => setPedidoForm((p) => ({ ...p, cantidad: e.target.value }))} /></label>
                <label>Coste<input type="number" min="0" step="0.01" value={pedidoForm.coste_unitario} onChange={(e) => setPedidoForm((p) => ({ ...p, coste_unitario: e.target.value }))} /></label>
              </div>
              <label>Notas<input value={pedidoForm.notas} onChange={(e) => setPedidoForm((p) => ({ ...p, notas: e.target.value }))} /></label>
                <button type="submit">Crear pedido</button>
              </form>
            </details>
            <div className="compact-list">
              {(pedidosQuery.data ?? []).slice(0, 6).map((pedido) => {
                const proveedor = (proveedoresQuery.data ?? []).find((item) => item.id === pedido.proveedor_id);
                return (
                  <p key={pedido.id}>
                    <strong>{proveedor?.nombre || 'Pedido'}</strong>
                    <span>{pedido.estado} · {pedido.lineas.reduce((total, linea) => total + linea.cantidad, 0)} ud.</span>
                    {pedido.estado === 'borrador' && <button type="button" onClick={() => marcarPedidoEnviado.mutate(pedido.id)}>Enviar</button>}
                    {pedido.estado !== 'recibido' && pedido.estado !== 'cancelado' && <button type="button" onClick={() => recibirPedido.mutate(pedido.id)}>Recibir</button>}
                  </p>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === 'reportes' && <AdminReportes />}

      {tab === 'auditoria' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Auditoría clínica y administrativa</strong></div>
          <table className="dentcore-table">
            <thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>Usuario</th><th>IP</th></tr></thead>
            <tbody>
              {(auditoriaQuery.data ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.timestamp).toLocaleString('es-ES')}</td>
                  <td>{entry.action}</td>
                  <td>{entry.entity_type}{entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ''}</td>
                  <td>{entry.user_id?.slice(0, 8) ?? '-'}</td>
                  <td>{entry.ip_address ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'backups' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Backups y modo offline</strong></div>
          <p>La app marca "Sin conexión" cuando el navegador pierde red. Los datos pendientes se guardan en IndexedDB y se sincronizan con `/api/sync` al volver.</p>
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
          <input type="file" accept=".csv,text/csv" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setImportText(await file.text());
          }} />
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} />
          <button onClick={() => importar.mutate()}>Importar</button>
          {importar.data && <p>Creados: {importar.data.creados}. Errores: {importar.data.errores.length}</p>}
        </section>
      )}

      {tab === 'seguridad' && (
        <div className="admin-security-stack">
          {renderConfigTab(tab)}
          <section className="desk-panel settings-form">
            <div className="panel-caption"><strong>Doble factor</strong><span>Cuenta administradora</span></div>
            <button onClick={async () => setTwoFactor(await enableTwoFactor())}>Activar/mostrar QR 2FA</button>
            {twoFactor?.qrDataUrl && <img className="qr-preview" src={twoFactor.qrDataUrl} alt="QR 2FA" />}
            {twoFactor && <p>Secret: {twoFactor.secret}</p>}
          </section>
          <section className="desk-panel">
            <div className="panel-caption"><strong>Modo offline y sincronizacion</strong><span>Cola local del navegador</span></div>
            <p>La app marca "Sin conexion" cuando el navegador pierde red. Los datos pendientes se guardan en IndexedDB y se sincronizan con `/api/sync` al volver.</p>
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
        </div>
      )}
    </section>
  );
}
