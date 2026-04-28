import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABELS, WORKFLOW_ITEMS, canRoleAccess } from '../../config/workflow';
import {
  createFamiliaTratamiento,
  createTratamientoCatalogo,
  deactivateTratamientoCatalogo,
  getDoctores,
  getFamiliasTratamiento,
  getFormasPago,
  getHorarios,
  getLaboratorios,
  getTratamientosCatalogo,
  updateTratamientoCatalogo,
} from '../../lib/api';
import type { TratamientoCatalogo } from '../../types/api';

const DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const FICHEROS = ['clinica', 'tratamientos', 'agenda', 'laboratorio', 'caja', 'documentos', 'seguridad', 'roles'] as const;
type FicheroTab = typeof FICHEROS[number];

const FAMILY_COLORS: Record<string, string> = {
  diagnostico: '#2a7de1',
  prevencion: '#2a7de1',
  conservadora: '#16a06f',
  endodoncia: '#d94b4b',
  periodoncia: '#6fae35',
  cirugia: '#d97828',
  implantologia: '#7b61d1',
  protesis: '#9b6a32',
  ortodoncia: '#d08c00',
  estetica: '#d64f91',
  odontopediatria: '#00a3a3',
  otros: '#5f6f89',
};

function normalizeText(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function treatmentColor(familia?: string | null, nombre?: string | null) {
  const source = `${normalizeText(familia)} ${normalizeText(nombre)}`;
  const key = Object.keys(FAMILY_COLORS).find((item) => source.includes(item));
  return key ? FAMILY_COLORS[key] : '#5f6f89';
}

function money(value: string | number) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function AccessPill({ allowed }: { allowed: boolean }) {
  return <span className={allowed ? 'access-pill ok' : 'access-pill locked'}>{allowed ? 'Permitido' : 'Solo lectura'}</span>;
}

type TreatmentForm = {
  id: string | null;
  familia_id: string;
  codigo: string;
  nombre: string;
  precio: string;
  iva_porcentaje: string;
  requiere_pieza: boolean;
  requiere_caras: boolean;
  activo: boolean;
};

const EMPTY_TREATMENT_FORM: TreatmentForm = {
  id: null,
  familia_id: '',
  codigo: '',
  nombre: '',
  precio: '0',
  iva_porcentaje: '0',
  requiere_pieza: false,
  requiere_caras: false,
  activo: true,
};

function formFromTreatment(tratamiento: TratamientoCatalogo): TreatmentForm {
  return {
    id: tratamiento.id,
    familia_id: tratamiento.familia_id,
    codigo: tratamiento.codigo ?? '',
    nombre: tratamiento.nombre,
    precio: String(tratamiento.precio ?? '0'),
    iva_porcentaje: String(tratamiento.iva_porcentaje ?? '0'),
    requiere_pieza: tratamiento.requiere_pieza,
    requiere_caras: tratamiento.requiere_caras,
    activo: tratamiento.activo,
  };
}

export default function ConfiguracionPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FicheroTab>('clinica');
  const [doctorId, setDoctorId] = useState('');
  const [tratamientoForm, setTratamientoForm] = useState<TreatmentForm>(EMPTY_TREATMENT_FORM);
  const [tratamientoSearch, setTratamientoSearch] = useState('');

  const doctoresQuery = useQuery({ queryKey: ['doctores'], queryFn: getDoctores });
  const activeDoctor = doctorId || doctoresQuery.data?.[0]?.id || '';
  const horariosQuery = useQuery({
    queryKey: ['horarios', activeDoctor],
    queryFn: () => getHorarios(activeDoctor),
    enabled: Boolean(activeDoctor),
  });
  const familiasQuery = useQuery({ queryKey: ['familias-tratamiento'], queryFn: getFamiliasTratamiento });
  const tratamientosQuery = useQuery({ queryKey: ['tratamientos-catalogo'], queryFn: () => getTratamientosCatalogo({ solo_activos: true }) });
  const laboratoriosQuery = useQuery({ queryKey: ['laboratorios'], queryFn: () => getLaboratorios({ solo_activos: true }) });
  const formasPagoQuery = useQuery({ queryKey: ['formas-pago'], queryFn: getFormasPago });

  const isAdmin = user?.rol === 'admin';
  const canEditClinical = canRoleAccess(user?.rol, ['admin', 'doctor']);
  const canEditCaja = canRoleAccess(user?.rol, ['admin', 'recepcion']);
  const canEditTreatments = isAdmin;
  const familias = familiasQuery.data ?? [];
  const tratamientos = tratamientosQuery.data ?? [];
  const filteredTratamientos = tratamientos.filter((tratamiento) => {
    const q = tratamientoSearch.trim().toLowerCase();
    if (!q) return true;
    return `${tratamiento.codigo ?? ''} ${tratamiento.nombre} ${tratamiento.familia?.nombre ?? ''}`.toLowerCase().includes(q);
  });

  const saveTreatmentMutation = useMutation({
    mutationFn: async () => {
      const familiaId = tratamientoForm.familia_id || familias[0]?.id;
      if (!familiaId) throw new Error('Cree una familia antes de guardar tratamientos');
      const payload = {
        familia_id: familiaId,
        codigo: tratamientoForm.codigo.trim() || null,
        nombre: tratamientoForm.nombre.trim(),
        precio: Number(tratamientoForm.precio.replace(',', '.')),
        iva_porcentaje: Number(tratamientoForm.iva_porcentaje.replace(',', '.')),
        requiere_pieza: tratamientoForm.requiere_pieza,
        requiere_caras: tratamientoForm.requiere_caras,
        activo: tratamientoForm.activo,
      };
      if (!payload.nombre) throw new Error('Nombre requerido');
      if (!Number.isFinite(payload.precio) || payload.precio < 0) throw new Error('Precio no valido');
      if (tratamientoForm.id) {
        return updateTratamientoCatalogo(tratamientoForm.id, payload);
      }
      return createTratamientoCatalogo(payload);
    },
    onSuccess: (saved) => {
      setTratamientoForm(formFromTreatment(saved));
      void queryClient.invalidateQueries({ queryKey: ['tratamientos-catalogo'] });
    },
  });

  const deactivateTreatmentMutation = useMutation({
    mutationFn: async () => {
      if (!tratamientoForm.id) throw new Error('Seleccione un tratamiento');
      return deactivateTratamientoCatalogo(tratamientoForm.id);
    },
    onSuccess: () => {
      setTratamientoForm(EMPTY_TREATMENT_FORM);
      void queryClient.invalidateQueries({ queryKey: ['tratamientos-catalogo'] });
    },
  });

  const createFamilyMutation = useMutation({
    mutationFn: async () => {
      const nombre = window.prompt('Nombre de la nueva familia');
      if (!nombre) throw new Error('Cancelado');
      const icono = window.prompt('Icono/codigo corto', nombre.slice(0, 2).toUpperCase()) ?? nombre.slice(0, 2).toUpperCase();
      return createFamiliaTratamiento({ nombre, icono, orden: familias.length + 1 });
    },
    onSuccess: (familia) => {
      setTratamientoForm((prev) => ({ ...prev, familia_id: familia.id }));
      void queryClient.invalidateQueries({ queryKey: ['familias-tratamiento'] });
    },
  });

  return (
    <section className="page fichero-screen">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Ficheros</p>
          <h1>Datos maestros y organizacion de la clinica</h1>
        </div>
        <div className="role-status">
          <span>Rol activo</span>
          <strong>{user?.rol ? ROLE_LABELS[user.rol] : 'Sin sesion'}</strong>
        </div>
      </div>

      <nav className="file-tabs">
        {FICHEROS.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item === 'clinica' && 'Clinica'}
            {item === 'tratamientos' && 'Tratamientos'}
            {item === 'agenda' && 'Agenda'}
            {item === 'laboratorio' && 'Protesicos'}
            {item === 'caja' && 'Caja'}
            {item === 'documentos' && 'Documentos'}
            {item === 'seguridad' && 'Seguridad/Backups'}
            {item === 'roles' && 'Usuarios/Roles'}
          </button>
        ))}
      </nav>

      {tab === 'clinica' && (
        <div className="fichero-grid">
          <section className="desk-panel">
            <div className="panel-caption"><strong>Doctores y auxiliares</strong><AccessPill allowed={isAdmin} /></div>
            <table className="euro-table">
              <thead><tr><th>Nombre</th><th>Color agenda</th><th>Activo</th></tr></thead>
              <tbody>
                {(doctoresQuery.data ?? []).map((doctor) => (
                  <tr key={doctor.id}><td>{doctor.nombre}</td><td>{doctor.color_agenda ?? ''}</td><td>{doctor.activo ? 'Si' : 'No'}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="desk-panel">
            <div className="panel-caption"><strong>Gabinetes, entidades y referencias</strong><AccessPill allowed={isAdmin} /></div>
            <div className="file-card-grid">
              <div><strong>Gabinetes</strong><span>Boxes, sillones, tiempos y color.</span></div>
              <div><strong>Entidades sanitarias</strong><span>Mutuas, polizas y pagadores.</span></div>
              <div><strong>Referencias</strong><span>Origen del paciente y campanas.</span></div>
              <div><strong>Datos clinica</strong><span>Empresa, locales, series y documentos.</span></div>
            </div>
          </section>
        </div>
      )}

      {tab === 'tratamientos' && (
        <div className="fichero-grid wide-left">
          <section className="desk-panel">
            <div className="panel-caption">
              <strong>Catalogo de tratamientos</strong>
              <AccessPill allowed={isAdmin || canEditClinical} />
              <input
                className="catalog-search"
                value={tratamientoSearch}
                onChange={(event) => setTratamientoSearch(event.target.value)}
                placeholder="Buscar tratamiento..."
              />
            </div>
            <table className="euro-table">
              <thead><tr><th>Codigo</th><th>Tratamiento</th><th>Familia</th><th>Pieza</th><th>Caras</th><th>IVA</th><th>Precio</th></tr></thead>
              <tbody>
                {filteredTratamientos.map((tratamiento) => (
                  <tr
                    key={tratamiento.id}
                    className={`treatment-coded-row ${tratamientoForm.id === tratamiento.id ? 'selected-row' : ''}`}
                    style={{ '--treatment-color': treatmentColor(tratamiento.familia?.nombre, tratamiento.nombre) } as CSSProperties}
                    onClick={() => setTratamientoForm(formFromTreatment(tratamiento))}
                  >
                    <td>
                      <span className="treatment-badge">
                        <span>{tratamiento.familia?.icono ?? tratamiento.codigo?.slice(0, 2) ?? 'TR'}</span>
                        {tratamiento.codigo ?? 'TR'}
                      </span>
                    </td>
                    <td>{tratamiento.nombre}</td>
                    <td>{tratamiento.familia?.nombre ?? ''}</td>
                    <td>{tratamiento.requiere_pieza ? 'Si' : 'No'}</td>
                    <td>{tratamiento.requiere_caras ? 'Si' : 'No'}</td>
                    <td className="num">{money(tratamiento.iva_porcentaje)}</td>
                    <td className="num">{money(tratamiento.precio)}</td>
                  </tr>
                ))}
                {!filteredTratamientos.length && <tr><td colSpan={7}>No hay tratamientos con ese filtro.</td></tr>}
              </tbody>
            </table>
          </section>
          <section className="desk-panel treatment-editor-panel">
            <div className="panel-caption"><strong>{tratamientoForm.id ? 'Editar tratamiento' : 'Nuevo tratamiento'}</strong><AccessPill allowed={canEditTreatments} /></div>
            <div className="treatment-editor">
              <label>Codigo
                <input value={tratamientoForm.codigo} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, codigo: event.target.value }))} />
              </label>
              <label className="wide">Nombre
                <input value={tratamientoForm.nombre} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, nombre: event.target.value }))} />
              </label>
              <label>Familia
                <select value={tratamientoForm.familia_id || familias[0]?.id || ''} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, familia_id: event.target.value }))}>
                  {familias.map((familia) => <option key={familia.id} value={familia.id}>{familia.nombre}</option>)}
                </select>
              </label>
              <label>Precio
                <input value={tratamientoForm.precio} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, precio: event.target.value }))} />
              </label>
              <label>IVA %
                <input value={tratamientoForm.iva_porcentaje} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, iva_porcentaje: event.target.value }))} />
              </label>
              <label className="checkline"><input type="checkbox" checked={tratamientoForm.requiere_pieza} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, requiere_pieza: event.target.checked }))} /> Requiere pieza</label>
              <label className="checkline"><input type="checkbox" checked={tratamientoForm.requiere_caras} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, requiere_caras: event.target.checked }))} /> Requiere caras</label>
              <label className="checkline"><input type="checkbox" checked={tratamientoForm.activo} disabled={!canEditTreatments} onChange={(event) => setTratamientoForm((prev) => ({ ...prev, activo: event.target.checked }))} /> Activo</label>
            </div>
            <div className="editor-actions">
              <button onClick={() => setTratamientoForm({ ...EMPTY_TREATMENT_FORM, familia_id: familias[0]?.id ?? '' })}>Nuevo</button>
              <button disabled={!canEditTreatments || saveTreatmentMutation.isPending} onClick={() => saveTreatmentMutation.mutate()}>Guardar</button>
              <button disabled={!canEditTreatments || !tratamientoForm.id || deactivateTreatmentMutation.isPending} onClick={() => deactivateTreatmentMutation.mutate()}>Desactivar</button>
              <button disabled={!canEditTreatments || createFamilyMutation.isPending} onClick={() => createFamilyMutation.mutate()}>Nueva familia</button>
            </div>
            {saveTreatmentMutation.error && <p className="form-error">{String((saveTreatmentMutation.error as Error).message)}</p>}
            <div className="mini-family-list">
              {familias.map((familia) => (
                <button
                  key={familia.id}
                  className={tratamientoForm.familia_id === familia.id ? 'active' : ''}
                  onClick={() => setTratamientoForm((prev) => ({ ...prev, familia_id: familia.id }))}
                >
                  {familia.icono ?? familia.nombre.slice(0, 2)} {familia.nombre}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'agenda' && (
        <section className="desk-panel">
          <div className="panel-caption">
            <strong>Horarios semanales por doctor</strong>
            <AccessPill allowed={isAdmin} />
            <select value={activeDoctor} onChange={(e) => setDoctorId(e.target.value)}>
              {(doctoresQuery.data ?? []).map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
              ))}
            </select>
          </div>
          <table className="euro-table">
            <thead><tr><th>Dia</th><th>Tipo</th><th>Bloques</th><th>Intervalo</th><th>Excepciones</th></tr></thead>
            <tbody>
              {DAYS.map((day, index) => {
                const horario = (horariosQuery.data ?? []).find((item) => item.dia_semana === index);
                return (
                  <tr key={day}>
                    <td>{day}</td>
                    <td>{horario?.tipo_dia ?? 'sin configurar'}</td>
                    <td>{horario?.bloques.map((b) => `${b.inicio}-${b.fin}`).join(', ') ?? '-'}</td>
                    <td>{horario ? `${horario.intervalo_min} min` : '-'}</td>
                    <td>Festivos, vacaciones, bloqueos y permisos puntuales</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'laboratorio' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Laboratorios y protesicos</strong><AccessPill allowed={isAdmin || canEditClinical} /></div>
          <table className="euro-table">
            <thead><tr><th>Nombre</th><th>Contacto</th><th>Telefono</th><th>WhatsApp</th><th>Email</th><th>Notas</th><th>Activo</th></tr></thead>
            <tbody>
              {(laboratoriosQuery.data ?? []).map((lab) => (
                <tr key={lab.id}>
                  <td>{lab.nombre}</td><td>{lab.contacto ?? ''}</td><td>{lab.telefono ?? ''}</td>
                  <td>{lab.whatsapp ?? ''}</td><td>{lab.email ?? ''}</td><td>{lab.notas ?? ''}</td><td>{lab.activo ? 'Si' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'caja' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Formas de pago, recibos y caja</strong><AccessPill allowed={isAdmin || canEditCaja} /></div>
          <table className="euro-table">
            <thead><tr><th>Forma de pago</th><th>Activo</th><th>Uso recomendado</th></tr></thead>
            <tbody>
              {(formasPagoQuery.data ?? []).map((forma) => (
                <tr key={forma.id}><td>{forma.nombre}</td><td>{forma.activo ? 'Si' : 'No'}</td><td>Cobros, recibos y arqueo</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'documentos' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Archivo documental</strong><AccessPill allowed={isAdmin || canEditClinical} /></div>
          <div className="file-card-grid documents-map">
            <div><strong>Clinicos</strong><span>Radiografias, fotografias, informes y adjuntos.</span></div>
            <div><strong>Consentimientos</strong><span>Plantillas, firma, version y trazabilidad.</span></div>
            <div><strong>Facturas PDF</strong><span>Documento fiscal original archivado y copia marcada.</span></div>
            <div><strong>Privacidad</strong><span>Descarga protegida, no-cache y auditoria de acceso.</span></div>
          </div>
        </section>
      )}

      {tab === 'seguridad' && (
        <section className="desk-panel security-map">
          <div className="panel-caption"><strong>Seguridad, privacidad y copias</strong><AccessPill allowed={isAdmin} /></div>
          <div className="security-grid">
            <div><strong>Accesos</strong><span>Usuarios por rol, sesiones con caducidad, bloqueo por intentos y permisos por modulo.</span><em>Activo</em></div>
            <div><strong>Historia clinica</strong><span>Acceso restringido, auditoria de lectura y separacion entre notas generales y clinicas.</span><em>Reforzado</em></div>
            <div><strong>Archivos medicos</strong><span>Subida validada por firma real de archivo, limite de tamano y descarga sin cache.</span><em>Protegido</em></div>
            <div><strong>Backups</strong><span>Preparado para diario completo, cifrado, registro de estado y prueba de restauracion.</span><em>Pendiente tarea</em></div>
            <div><strong>Facturacion</strong><span>Facturas selladas sin borrado destructivo, RF encadenado y PDF fiscal persistido.</span><em>SIF</em></div>
            <div><strong>Auditoria</strong><span>Registro de acciones criticas, accesos a datos sensibles y cambios de agenda/documentos.</span><em>Activo</em></div>
          </div>
        </section>
      )}

      {tab === 'roles' && (
        <section className="desk-panel">
          <div className="panel-caption"><strong>Mapa de roles y permisos visibles</strong><AccessPill allowed={isAdmin} /></div>
          <table className="euro-table">
            <thead><tr><th>Seccion</th><th>Admin</th><th>Doctor</th><th>Recepcion</th><th>Contenido</th></tr></thead>
            <tbody>
              {WORKFLOW_ITEMS.map((item) => (
                <tr key={item.id}>
                  <td>{item.label}</td>
                  <td>{item.roles.includes('admin') ? 'Si' : 'No'}</td>
                  <td>{item.roles.includes('doctor') ? 'Si' : 'No'}</td>
                  <td>{item.roles.includes('recepcion') ? 'Si' : 'No'}</td>
                  <td>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
