import type { FormEvent } from 'react';
import { useState } from 'react';
import type { ApiPaciente,Doctor,PacienteSexo } from '../../api/types';


export function PatientEditModal({
  paciente,
  doctores = [],
  onClose,
  onSave,
}: {
  paciente: ApiPaciente;
  doctores?: Doctor[];
  onClose: () => void;
  onSave: (data: Partial<ApiPaciente>) => void;
}) {
  const [baseline, setBaseline] = useState(paciente);
  const [original] = useState(paciente);
  const [reviewing, setReviewing] = useState(false);
  const [form, setForm] = useState({
    nombre: paciente.nombre ?? '',
    apellidos: paciente.apellidos ?? '',
    fecha_nacimiento: paciente.fecha_nacimiento ?? '',
    dni_nie: paciente.dni_nie ?? '',
    telefono: paciente.telefono ?? '',
    telefono2: paciente.telefono2 ?? '',
    email: paciente.email ?? '',
    direccion: paciente.direccion ?? '',
    codigo_postal: paciente.codigo_postal ?? '',
    ciudad: paciente.ciudad ?? '',
    provincia: paciente.provincia ?? '',
    observaciones: paciente.observaciones ?? '',
    alergias: typeof paciente.datos_salud?.alergias === 'string' ? paciente.datos_salud.alergias : '',
    sexo: (paciente.sexo ?? '') as PacienteSexo | '',
    profesion: paciente.profesion ?? '',
    pais: paciente.pais ?? '',
    doctor_habitual_id: paciente.doctor_habitual_id ?? '',
    num_poliza: paciente.num_poliza ?? '',
    pagador_distinto: Boolean(paciente.pagador_distinto),
    pagador_nombre: paciente.pagador_nombre ?? '',
    pagador_dni: paciente.pagador_dni ?? '',
    pagador_direccion: paciente.pagador_direccion ?? '',
  });

  function setField<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const data: Partial<ApiPaciente> = {
      revision: baseline.revision,
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      fecha_nacimiento: form.fecha_nacimiento || null,
      dni_nie: form.dni_nie || null,
      telefono: form.telefono || null,
      telefono2: form.telefono2 || null,
      email: form.email || null,
      direccion: form.direccion || null,
      codigo_postal: form.codigo_postal || null,
      ciudad: form.ciudad || null,
      provincia: form.provincia || null,
      observaciones: form.observaciones || null,
      datos_salud: { ...(baseline.datos_salud ?? {}), alergias: form.alergias },
      sexo: form.sexo || null,
      profesion: form.profesion.trim() || null,
      pais: form.pais.trim() || null,
      doctor_habitual_id: form.doctor_habitual_id || null,
      num_poliza: form.num_poliza.trim() || null,
      pagador_distinto: form.pagador_distinto,
      pagador_nombre: form.pagador_distinto ? form.pagador_nombre.trim() || null : null,
      pagador_dni: form.pagador_distinto ? form.pagador_dni.trim() || null : null,
      pagador_direccion: form.pagador_distinto ? form.pagador_direccion.trim() || null : null,
    };
    const changes = Object.fromEntries(Object.entries(data).filter(([key, value]) => {
      if (key === 'revision') return true;
      if (key === 'datos_salud') return form.alergias !== (original.datos_salud?.alergias ?? '');
      return JSON.stringify(value ?? null) !== JSON.stringify(original[key as keyof ApiPaciente] ?? null);
    }));
    onSave(changes);
  }

  return (
    <div className="modal-backdrop">
      <form className="patient-edit-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <strong>Editar ficha del paciente</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        {baseline.revision !== paciente.revision && <div role="status" className="alert alert-warning">
          <p>Esta ficha cambió mientras la estabas editando. Tu borrador se conserva.</p>
          <button type="button" onClick={() => setReviewing(!reviewing)}>Revisar versión actual</button>
          {reviewing && <>
            <dl>{Object.entries(form).filter(([key]) => key !== 'alergias').map(([key, value]) => (
              String(paciente[key as keyof ApiPaciente] ?? '') !== String(baseline[key as keyof ApiPaciente] ?? '')
                ? <div key={key}><dt>{key}</dt><dd>Actual: {String(paciente[key as keyof ApiPaciente] ?? '—')} · Tu borrador: {String(value)}</dd></div> : null
            ))}</dl>
            <p>Comprueba también los datos de salud antes de volver a guardar.</p>
            <button type="button" onClick={() => { setBaseline(paciente); setReviewing(false); }}>He revisado los cambios; conservar mi borrador</button>
          </>}
        </div>}
        <div className="patient-edit-grid">
          <label>Nombre<input value={form.nombre} onChange={(event) => setField('nombre', event.target.value)} required /></label>
          <label>Apellidos<input value={form.apellidos} onChange={(event) => setField('apellidos', event.target.value)} required /></label>
          <label>F. nacimiento<input type="date" value={form.fecha_nacimiento} onChange={(event) => setField('fecha_nacimiento', event.target.value)} /></label>
          <label>N.I.F.<input value={form.dni_nie} onChange={(event) => setField('dni_nie', event.target.value)} /></label>
          <label>Teléfono<input value={form.telefono} onChange={(event) => setField('telefono', event.target.value)} /></label>
          <label>Móvil<input value={form.telefono2} onChange={(event) => setField('telefono2', event.target.value)} /></label>
          <label className="wide">E-mail<input value={form.email} onChange={(event) => setField('email', event.target.value)} /></label>
          <label className="wide">Dirección<input value={form.direccion} onChange={(event) => setField('direccion', event.target.value)} /></label>
          <label>Cód. postal<input value={form.codigo_postal} onChange={(event) => setField('codigo_postal', event.target.value)} /></label>
          <label>Población<input value={form.ciudad} onChange={(event) => setField('ciudad', event.target.value)} /></label>
          <label>Provincia<input value={form.provincia} onChange={(event) => setField('provincia', event.target.value)} /></label>
          <label className="wide">Alergias / contraindicaciones<textarea value={form.alergias} onChange={(event) => setField('alergias', event.target.value)} /></label>
          <label className="wide">Observaciones generales<textarea value={form.observaciones} onChange={(event) => setField('observaciones', event.target.value)} /></label>
        </div>
        <details className="patient-edit-extras" data-testid="patient-edit-extras">
          <summary>Datos adicionales</summary>
          <div className="patient-edit-grid">
            <label>Sexo
              <select value={form.sexo} onChange={(event) => setField('sexo', event.target.value as PacienteSexo | '')}>
                <option value="">—</option>
                <option value="M">Hombre</option>
                <option value="F">Mujer</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label>Profesión<input value={form.profesion} onChange={(event) => setField('profesion', event.target.value)} /></label>
            <label>País<input value={form.pais} onChange={(event) => setField('pais', event.target.value)} /></label>
            <label>Doctor habitual
              <select value={form.doctor_habitual_id} onChange={(event) => setField('doctor_habitual_id', event.target.value)}>
                <option value="">—</option>
                {doctores.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.nombre}</option>
                ))}
              </select>
            </label>
            <label className="wide">Número de póliza<input value={form.num_poliza} onChange={(event) => setField('num_poliza', event.target.value)} /></label>
            <label className="wide checkbox-line">
              <input type="checkbox" checked={form.pagador_distinto} onChange={(event) => setField('pagador_distinto', event.target.checked)} />
              <span>Pagador de factura distinto del paciente</span>
            </label>
            {form.pagador_distinto && (
              <>
                <label className="wide">Pagador — nombre<input value={form.pagador_nombre} onChange={(event) => setField('pagador_nombre', event.target.value)} /></label>
                <label>Pagador — DNI/NIF<input value={form.pagador_dni} onChange={(event) => setField('pagador_dni', event.target.value)} /></label>
                <label className="wide">Pagador — dirección<input value={form.pagador_direccion} onChange={(event) => setField('pagador_direccion', event.target.value)} /></label>
              </>
            )}
          </div>
        </details>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit">Guardar ficha</button>
        </footer>
      </form>
    </div>
  );
}
