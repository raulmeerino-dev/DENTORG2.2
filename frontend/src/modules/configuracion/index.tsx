import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABELS, WORKFLOW_ITEMS, canRoleAccess } from '../../config/workflow';
import {
  crearBackup,
  createDoctor,
  createFamiliaTratamiento,
  createTratamientoCatalogo,
  deactivateTratamientoCatalogo,
  getDoctores,
  getBackups,
  getFamiliasTratamiento,
  getFormasPago,
  getHorarios,
  getLaboratorios,
  getTratamientosCatalogo,
  updateDoctor,
  updateHorarioDoctor,
  updateTratamientoCatalogo,
  verificarBackup,
} from '../../lib/api';
import type { Doctor, HorarioDoctor, TratamientoCatalogo } from '../../types/api';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const FICHEROS = ['general', 'doctores', 'tratamientos', 'agenda', 'roles', 'caja', 'laboratorio', 'documentos', 'seguridad'] as const;
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

type DoctorForm = {
  id: string | null;
  nombre: string;
  especialidad: string;
  color_agenda: string;
  porcentaje: string;
  es_auxiliar: boolean;
  activo: boolean;
};

type HorarioForm = {
  tipo_dia: string;
  manana_activa: boolean;
  manana_inicio: string;
  manana_fin: string;
  tarde_activa: boolean;
  tarde_inicio: string;
  tarde_fin: string;
  intervalo_min: string;
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

const EMPTY_DOCTOR_FORM: DoctorForm = {
  id: null,
  nombre: '',
  especialidad: '',
  color_agenda: '#2563eb',
  porcentaje: '0',
  es_auxiliar: false,
  activo: true,
};

const DEFAULT_HORARIO_FORM: HorarioForm = {
  tipo_dia: 'laborable',
  manana_activa: true,
  manana_inicio: '09:00',
  manana_fin: '13:30',
  tarde_activa: true,
  tarde_inicio: '15:00',
  tarde_fin: '20:30',
  intervalo_min: '10',
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

function formFromDoctor(doctor: Doctor): DoctorForm {
  return {
    id: doctor.id,
    nombre: doctor.nombre,
    especialidad: doctor.especialidad ?? '',
    color_agenda: doctor.color_agenda ?? '#2563eb',
    porcentaje: String(doctor.porcentaje ?? '0'),
    es_auxiliar: Boolean(doctor.es_auxiliar),
    activo: doctor.activo,
  };
}

function horarioToForm(horario?: HorarioDoctor): HorarioForm {
  const bloques = horario?.bloques ?? [];
  const manana = bloques.find((bloque) => bloque.inicio < '14:00');
  const tarde = bloques.find((bloque) => bloque.inicio >= '14:00');
  const isConfigured = Boolean(horario);
  return {
    tipo_dia: horario?.tipo_dia ?? DEFAULT_HORARIO_FORM.tipo_dia,
    manana_activa: isConfigured ? Boolean(manana) : DEFAULT_HORARIO_FORM.manana_activa,
    manana_inicio: manana?.inicio ?? DEFAULT_HORARIO_FORM.manana_inicio,
    manana_fin: manana?.fin ?? DEFAULT_HORARIO_FORM.manana_fin,
    tarde_activa: isConfigured ? Boolean(tarde) : DEFAULT_HORARIO_FORM.tarde_activa,
    tarde_inicio: tarde?.inicio ?? DEFAULT_HORARIO_FORM.tarde_inicio,
    tarde_fin: tarde?.fin ?? DEFAULT_HORARIO_FORM.tarde_fin,
    intervalo_min: String(horario?.intervalo_min ?? DEFAULT_HORARIO_FORM.intervalo_min),
  };
}

function horarioPayload(form: HorarioForm) {
  const bloques = form.tipo_dia === 'festivo' ? [] : [
    ...(form.manana_activa ? [{ inicio: form.manana_inicio, fin: form.manana_fin }] : []),
    ...(form.tarde_activa ? [{ inicio: form.tarde_inicio, fin: form.tarde_fin }] : []),
  ].filter((bloque) => bloque.inicio && bloque.fin && bloque.inicio < bloque.fin);
  return {
    tipo_dia: form.tipo_dia,
    bloques,
    intervalo_min: Number(form.intervalo_min || 10),
  };
}

function horarioResumen(form: HorarioForm) {
  if (form.tipo_dia === 'festivo') return 'No trabaja';
  const parts = [
    form.manana_activa ? `${form.manana_inicio}-${form.manana_fin}` : null,
    form.tarde_activa ? `${form.tarde_inicio}-${form.tarde_fin}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Sin bloques';
}

export default function ConfiguracionPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = FICHEROS.includes(searchParams.get('tab') as FicheroTab) ? searchParams.get('tab') as FicheroTab : 'general';
  const [tab, setTab] = useState<FicheroTab>(initialTab);
  const [doctorId, setDoctorId] = useState(searchParams.get('doctor_id') ?? '');
  const [doctorForm, setDoctorForm] = useState<DoctorForm>(EMPTY_DOCTOR_FORM);
  const [horarioForms, setHorarioForms] = useState<Record<number, HorarioForm>>({});
  const [horarioSavedMessage, setHorarioSavedMessage] = useState('');
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
  const backupsQuery = useQuery({ queryKey: ['backups'], queryFn: getBackups, enabled: tab === 'seguridad' });

  const isAdmin = user?.rol === 'admin';
  const canEditClinical = canRoleAccess(user?.rol, ['admin', 'doctor']);
  const canEditCaja = canRoleAccess(user?.rol, ['admin', 'recepcion']);
  const canEditTreatments = isAdmin;
  const familias = familiasQuery.data ?? [];
  const tratamientos = tratamientosQuery.data ?? [];
  const doctores = doctoresQuery.data ?? [];
  const activeDoctorRecord = doctores.find((doctor) => doctor.id === activeDoctor) ?? doctores[0] ?? null;
  const filteredTratamientos = tratamientos.filter((tratamiento) => {
    const q = tratamientoSearch.trim().toLowerCase();
    if (!q) return true;
    return `${tratamiento.codigo ?? ''} ${tratamiento.nombre} ${tratamiento.familia?.nombre ?? ''}`.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (activeDoctorRecord) {
      setDoctorForm(formFromDoctor(activeDoctorRecord));
    }
  }, [activeDoctorRecord?.id, activeDoctorRecord?.nombre, activeDoctorRecord?.color_agenda, activeDoctorRecord?.porcentaje]);

  useEffect(() => {
    const nextTab = searchParams.get('tab') as FicheroTab | null;
    const nextDoctorId = searchParams.get('doctor_id');
    if (nextTab && FICHEROS.includes(nextTab)) setTab(nextTab);
    if (nextDoctorId) setDoctorId(nextDoctorId);
  }, [searchParams]);

  useEffect(() => {
    const next: Record<number, HorarioForm> = {};
    DAYS.forEach((_, index) => {
      next[index] = horarioToForm((horariosQuery.data ?? []).find((horario) => horario.dia_semana === index));
    });
    setHorarioForms(next);
  }, [horariosQuery.data]);

  const saveDoctorMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nombre: doctorForm.nombre.trim(),
        especialidad: doctorForm.especialidad.trim() || null,
        color_agenda: doctorForm.color_agenda || '#2563eb',
        porcentaje: doctorForm.porcentaje ? Number(doctorForm.porcentaje.replace(',', '.')) : null,
        es_auxiliar: doctorForm.es_auxiliar,
        activo: doctorForm.activo,
      };
      if (!payload.nombre) throw new Error('Nombre requerido');
      if (doctorForm.id) {
        return updateDoctor(doctorForm.id, payload);
      }
      return createDoctor(payload);
    },
    onSuccess: (doctor) => {
      setDoctorId(doctor.id);
      setDoctorForm(formFromDoctor(doctor));
      void queryClient.invalidateQueries({ queryKey: ['doctores'] });
    },
  });

  const saveHorarioMutation = useMutation({
    mutationFn: async (diaSemana: number) => {
      if (!activeDoctor) throw new Error('Seleccione un doctor');
      const form = horarioForms[diaSemana] ?? DEFAULT_HORARIO_FORM;
      return updateHorarioDoctor(activeDoctor, diaSemana, horarioPayload(form));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['horarios', activeDoctor] });
      void queryClient.invalidateQueries({ queryKey: ['agenda-horarios'] });
      window.dispatchEvent(new CustomEvent('dentorg:horarios-updated'));
      window.localStorage.setItem('dentorg_horarios_updated_at', String(Date.now()));
      setHorarioSavedMessage('Horario guardado y enviado a la agenda.');
    },
  });

  const saveAllHorariosMutation = useMutation({
    mutationFn: async () => {
      if (!activeDoctor) throw new Error('Seleccione un doctor');
      return Promise.all(DAYS.map((_, index) => {
        const form = horarioForms[index] ?? DEFAULT_HORARIO_FORM;
        return updateHorarioDoctor(activeDoctor, index, horarioPayload(form));
      }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['horarios', activeDoctor] });
      void queryClient.invalidateQueries({ queryKey: ['agenda-horarios'] });
      window.dispatchEvent(new CustomEvent('dentorg:horarios-updated'));
      window.localStorage.setItem('dentorg_horarios_updated_at', String(Date.now()));
      setHorarioSavedMessage('Semana guardada. La agenda queda actualizada con estos tramos.');
    },
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

  function updateHorarioDia(index: number, patch: Partial<HorarioForm>) {
    setHorarioForms((prev) => ({
      ...prev,
      [index]: { ...(prev[index] ?? DEFAULT_HORARIO_FORM), ...patch },
    }));
  }

  function aplicarPlantillaLaborables(template: 'completo' | 'manana' | 'tarde') {
    setHorarioForms((prev) => {
      const next = { ...prev };
      for (let index = 0; index < 5; index += 1) {
        const base = next[index] ?? DEFAULT_HORARIO_FORM;
        next[index] = {
          ...base,
          tipo_dia: 'laborable',
          manana_activa: template !== 'tarde',
          tarde_activa: template !== 'manana',
        };
      }
      return next;
    });
  }

  function marcarFinDeSemanaFestivo() {
    setHorarioForms((prev) => ({
      ...prev,
      5: { ...(prev[5] ?? DEFAULT_HORARIO_FORM), tipo_dia: 'festivo', manana_activa: false, tarde_activa: false },
      6: { ...(prev[6] ?? DEFAULT_HORARIO_FORM), tipo_dia: 'festivo', manana_activa: false, tarde_activa: false },
    }));
  }

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

  const crearBackupMutation = useMutation({
    mutationFn: crearBackup,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });

  const verificarBackupMutation = useMutation({
    mutationFn: verificarBackup,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });

  return (
    <section className="page fichero-screen">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Ajustes generales de la clínica</h1>
        </div>
        <div className="role-status">
          <span>Rol activo</span>
          <strong>{user?.rol ? ROLE_LABELS[user.rol] : 'Sin sesion'}</strong>
        </div>
      </div>

      <nav className="file-tabs">
        {FICHEROS.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item === 'general' && 'General'}
            {item === 'doctores' && 'Doctores'}
            {item === 'tratamientos' && 'Tratamientos'}
            {item === 'agenda' && 'Agenda'}
            {item === 'laboratorio' && 'Protésicos'}
            {item === 'caja' && 'Caja'}
            {item === 'documentos' && 'Documentos'}
            {item === 'seguridad' && 'Seguridad/Backups'}
            {item === 'roles' && 'Usuarios/Roles'}
          </button>
        ))}
      </nav>

      {tab === 'general' && (
        <div className="settings-overview-grid">
          <section className="desk-panel">
            <div className="panel-caption"><strong>Resumen de ajustes</strong><AccessPill allowed={isAdmin} /></div>
            <div className="settings-kpis">
              <button onClick={() => setTab('doctores')}><strong>{doctores.length}</strong><span>Doctores/auxiliares</span></button>
              <button onClick={() => setTab('tratamientos')}><strong>{tratamientos.length}</strong><span>Tratamientos activos</span></button>
              <button onClick={() => setTab('agenda')}><strong>{horariosQuery.data?.length ?? 0}</strong><span>Horarios del doctor</span></button>
              <button onClick={() => setTab('roles')}><strong>{WORKFLOW_ITEMS.length}</strong><span>Secciones con permisos</span></button>
            </div>
          </section>
          <section className="desk-panel">
            <div className="panel-caption"><strong>Ficheros administrativos</strong><AccessPill allowed={isAdmin} /></div>
            <div className="file-card-grid">
              <div><strong>Doctores</strong><span>Nombre, especialidad, color de agenda, comisión y activo.</span></div>
              <div><strong>Tratamientos</strong><span>Precios, IVA, familia, iconos, pieza/caras y estado.</span></div>
              <div><strong>Horarios</strong><span>Agenda semanal por profesional, intervalos y festivos.</span></div>
              <div><strong>Gabinetes</strong><span>Boxes, sillones, tiempos y color.</span></div>
              <div><strong>Entidades sanitarias</strong><span>Mutuas, pólizas y pagadores.</span></div>
              <div><strong>Datos clínica</strong><span>Empresa, locales, series y documentos.</span></div>
            </div>
          </section>
        </div>
      )}

      {tab === 'doctores' && (
        <div className="fichero-grid">
          <section className="desk-panel">
            <div className="panel-caption"><strong>Doctores, auxiliares y colores</strong><AccessPill allowed={isAdmin} /></div>
            <table className="euro-table">
              <thead><tr><th>Color</th><th>Nombre</th><th>Especialidad</th><th>%</th><th>Tipo</th><th>Activo</th></tr></thead>
              <tbody>
                {doctores.map((doctor) => (
                  <tr
                    key={doctor.id}
                    className={doctorForm.id === doctor.id ? 'selected-row' : ''}
                    onClick={() => { setDoctorId(doctor.id); setDoctorForm(formFromDoctor(doctor)); }}
                  >
                    <td><span className="doctor-color-dot" style={{ background: doctor.color_agenda ?? '#8092a0' }} /></td>
                    <td>{doctor.nombre}</td>
                    <td>{doctor.especialidad ?? ''}</td>
                    <td className="num">{doctor.porcentaje ?? '0'}</td>
                    <td>{doctor.es_auxiliar ? 'Auxiliar' : 'Doctor'}</td>
                    <td>{doctor.activo ? 'Sí' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="desk-panel treatment-editor-panel">
            <div className="panel-caption"><strong>{doctorForm.id ? 'Editar profesional' : 'Nuevo profesional'}</strong><AccessPill allowed={isAdmin} /></div>
            <div className="treatment-editor doctor-editor">
              <label className="wide">Nombre
                <input value={doctorForm.nombre} disabled={!isAdmin} onChange={(event) => setDoctorForm((prev) => ({ ...prev, nombre: event.target.value }))} />
              </label>
              <label className="wide">Especialidad
                <input value={doctorForm.especialidad} disabled={!isAdmin} onChange={(event) => setDoctorForm((prev) => ({ ...prev, especialidad: event.target.value }))} />
              </label>
              <label>Color agenda
                <input type="color" value={doctorForm.color_agenda} disabled={!isAdmin} onChange={(event) => setDoctorForm((prev) => ({ ...prev, color_agenda: event.target.value }))} />
              </label>
              <label>% doctor
                <input value={doctorForm.porcentaje} disabled={!isAdmin} onChange={(event) => setDoctorForm((prev) => ({ ...prev, porcentaje: event.target.value }))} />
              </label>
              <label className="checkline"><input type="checkbox" checked={doctorForm.es_auxiliar} disabled={!isAdmin} onChange={(event) => setDoctorForm((prev) => ({ ...prev, es_auxiliar: event.target.checked }))} /> Auxiliar</label>
              <label className="checkline"><input type="checkbox" checked={doctorForm.activo} disabled={!isAdmin} onChange={(event) => setDoctorForm((prev) => ({ ...prev, activo: event.target.checked }))} /> Activo</label>
            </div>
            <div className="editor-actions">
              <button onClick={() => { setDoctorId(''); setDoctorForm(EMPTY_DOCTOR_FORM); }}>Nuevo</button>
              <button disabled={!isAdmin || saveDoctorMutation.isPending} onClick={() => saveDoctorMutation.mutate()}>Guardar</button>
            </div>
            {saveDoctorMutation.error && <p className="form-error">{String((saveDoctorMutation.error as Error).message)}</p>}
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
          <div className="panel-caption horario-caption">
            <strong>Horarios semanales por doctor</strong>
            <AccessPill allowed={isAdmin} />
            <select value={activeDoctor} onChange={(e) => setDoctorId(e.target.value)}>
              {doctores.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
              ))}
            </select>
            <button disabled={!isAdmin || saveAllHorariosMutation.isPending} onClick={() => saveAllHorariosMutation.mutate()}>
              Guardar toda la semana
            </button>
            <button onClick={() => navigate('/agenda')}>Ver agenda</button>
          </div>
          <div className="horario-tools">
            <button disabled={!isAdmin} onClick={() => aplicarPlantillaLaborables('completo')}>L-V completo</button>
            <button disabled={!isAdmin} onClick={() => aplicarPlantillaLaborables('manana')}>L-V solo mañana</button>
            <button disabled={!isAdmin} onClick={() => aplicarPlantillaLaborables('tarde')}>L-V solo tarde</button>
            <button disabled={!isAdmin} onClick={marcarFinDeSemanaFestivo}>S-D festivo</button>
          </div>
          <table className="euro-table horario-editor-table">
            <colgroup>
              <col className="horario-col-dia" />
              <col className="horario-col-tipo" />
              <col className="horario-col-turno" />
              <col className="horario-col-turno" />
              <col className="horario-col-intervalo" />
              <col className="horario-col-resumen" />
              <col className="horario-col-accion" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Tipo</th>
                <th scope="col">Mañana <small>inicio / fin</small></th>
                <th scope="col">Tarde <small>inicio / fin</small></th>
                <th scope="col">Intervalo <small>huecos</small></th>
                <th scope="col">Resumen</th>
                <th scope="col">Guardar</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, index) => {
                const form = horarioForms[index] ?? DEFAULT_HORARIO_FORM;
                return (
                  <tr key={day}>
                    <td>{day}</td>
                    <td>
                      <select disabled={!isAdmin} value={form.tipo_dia} onChange={(event) => updateHorarioDia(index, { tipo_dia: event.target.value })}>
                        <option value="laborable">Laborable</option>
                        <option value="semilaborable">Semi</option>
                        <option value="festivo">Festivo</option>
                      </select>
                    </td>
                    <td>
                      <label className="checkline horario-turno-toggle">
                        <input type="checkbox" checked={form.manana_activa && form.tipo_dia !== 'festivo'} disabled={!isAdmin || form.tipo_dia === 'festivo'} onChange={(event) => updateHorarioDia(index, { manana_activa: event.target.checked })} />
                        Mañana
                      </label>
                      <input type="time" disabled={!isAdmin || form.tipo_dia === 'festivo' || !form.manana_activa} value={form.manana_inicio} onChange={(event) => updateHorarioDia(index, { manana_inicio: event.target.value })} />
                      <input type="time" disabled={!isAdmin || form.tipo_dia === 'festivo' || !form.manana_activa} value={form.manana_fin} onChange={(event) => updateHorarioDia(index, { manana_fin: event.target.value })} />
                    </td>
                    <td>
                      <label className="checkline horario-turno-toggle">
                        <input type="checkbox" checked={form.tarde_activa && form.tipo_dia !== 'festivo'} disabled={!isAdmin || form.tipo_dia === 'festivo'} onChange={(event) => updateHorarioDia(index, { tarde_activa: event.target.checked })} />
                        Tarde
                      </label>
                      <input type="time" disabled={!isAdmin || form.tipo_dia === 'festivo' || !form.tarde_activa} value={form.tarde_inicio} onChange={(event) => updateHorarioDia(index, { tarde_inicio: event.target.value })} />
                      <input type="time" disabled={!isAdmin || form.tipo_dia === 'festivo' || !form.tarde_activa} value={form.tarde_fin} onChange={(event) => updateHorarioDia(index, { tarde_fin: event.target.value })} />
                    </td>
                    <td>
                      <select disabled={!isAdmin} value={form.intervalo_min} onChange={(event) => updateHorarioDia(index, { intervalo_min: event.target.value })}>
                        <option value="10">10 min</option>
                        <option value="15">15 min</option>
                        <option value="20">20 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">60 min</option>
                      </select>
                    </td>
                    <td><span className="horario-summary-pill">{horarioResumen(form)}</span></td>
                    <td><button disabled={!isAdmin || saveHorarioMutation.isPending} onClick={() => saveHorarioMutation.mutate(index)}>Guardar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {saveHorarioMutation.error && <p className="form-error">{String((saveHorarioMutation.error as Error).message)}</p>}
          {saveAllHorariosMutation.error && <p className="form-error">{String((saveAllHorariosMutation.error as Error).message)}</p>}
          {horarioSavedMessage && <p className="form-success">{horarioSavedMessage}</p>}
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
          <div className="panel-caption">
            <strong>Seguridad, privacidad y copias</strong>
            <AccessPill allowed={isAdmin} />
            <button disabled={!isAdmin || crearBackupMutation.isPending} onClick={() => crearBackupMutation.mutate()}>
              Crear backup cifrado
            </button>
          </div>
          <div className="security-grid">
            <div><strong>Accesos</strong><span>Usuarios por rol, sesiones con caducidad, bloqueo por intentos y permisos por modulo.</span><em>Activo</em></div>
            <div><strong>Historia clinica</strong><span>Acceso restringido, auditoria de lectura y separacion entre notas generales y clinicas.</span><em>Reforzado</em></div>
            <div><strong>Archivos medicos</strong><span>Subida validada por firma real de archivo, limite de tamano y descarga sin cache.</span><em>Protegido</em></div>
            <div><strong>Backups</strong><span>Backup automatico diario, archivo cifrado, hash SHA-256, registro de estado y verificacion.</span><em>Activo</em></div>
            <div><strong>Facturacion</strong><span>Facturas selladas sin borrado destructivo, RF encadenado y PDF fiscal persistido.</span><em>SIF</em></div>
            <div><strong>Auditoria</strong><span>Registro de acciones criticas, accesos a datos sensibles y cambios de agenda/documentos.</span><em>Activo</em></div>
          </div>
          <table className="euro-table backup-table">
            <thead><tr><th>Inicio</th><th>Estado</th><th>Tamaño</th><th>Cifrado</th><th>Hash</th><th></th></tr></thead>
            <tbody>
              {(backupsQuery.data ?? []).map((backup) => (
                <tr key={backup.id}>
                  <td>{new Date(backup.started_at).toLocaleString('es-ES')}</td>
                  <td>{backup.estado}</td>
                  <td>{backup.tamano_bytes ? `${Math.round(backup.tamano_bytes / 1024)} KB` : '-'}</td>
                  <td>{backup.cifrado ? 'Si' : 'No'}</td>
                  <td>{backup.hash_sha256 ? backup.hash_sha256.slice(0, 12) : backup.error ?? '-'}</td>
                  <td><button disabled={!isAdmin || verificarBackupMutation.isPending} onClick={() => verificarBackupMutation.mutate(backup.id)}>Verificar</button></td>
                </tr>
              ))}
              {!backupsQuery.isLoading && !(backupsQuery.data ?? []).length && <tr><td colSpan={6}>No hay copias registradas.</td></tr>}
            </tbody>
          </table>
          {verificarBackupMutation.data && (
            <p className={verificarBackupMutation.data.ok ? 'form-success' : 'form-error'}>
              {verificarBackupMutation.data.ok ? `Backup correcto: ${verificarBackupMutation.data.tablas} tablas verificadas.` : `Backup no válido: ${verificarBackupMutation.data.motivo}`}
            </p>
          )}
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
