import type { FormEvent } from 'react';
import { useState } from 'react';


export function NuevoPacienteModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (data: { nombre: string; apellidos: string; fecha_nacimiento?: string | null; dni_nie?: string | null; telefono?: string | null; telefono2?: string | null; email?: string | null; direccion?: string | null; codigo_postal?: string | null; ciudad?: string | null; provincia?: string | null; observaciones?: string | null }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    fecha_nacimiento: '',
    dni_nie: '',
    telefono: '',
    telefono2: '',
    email: '',
    direccion: '',
    codigo_postal: '',
    ciudad: '',
    provincia: '',
    observaciones: '',
  });

  function setField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.nombre.trim() || !form.apellidos.trim()) return;
    onSave({
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
    });
  }

  return (
    <div className="modal-backdrop">
      <form className="patient-edit-modal" onSubmit={submit}>
        <div className="modal-titlebar">
          <strong>Nueva ficha de paciente</strong>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="patient-edit-grid">
          <label>Nombre<input autoFocus value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} required /></label>
          <label>Apellidos<input value={form.apellidos} onChange={(e) => setField('apellidos', e.target.value)} required /></label>
          <label>F. nacimiento<input type="date" value={form.fecha_nacimiento} onChange={(e) => setField('fecha_nacimiento', e.target.value)} /></label>
          <label>N.I.F.<input value={form.dni_nie} onChange={(e) => setField('dni_nie', e.target.value)} /></label>
          <label>Teléfono<input value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} /></label>
          <label>Móvil<input value={form.telefono2} onChange={(e) => setField('telefono2', e.target.value)} /></label>
          <label className="wide">E-mail<input value={form.email} onChange={(e) => setField('email', e.target.value)} /></label>
          <label className="wide">Dirección<input value={form.direccion} onChange={(e) => setField('direccion', e.target.value)} /></label>
          <label>Cód. postal<input value={form.codigo_postal} onChange={(e) => setField('codigo_postal', e.target.value)} /></label>
          <label>Población<input value={form.ciudad} onChange={(e) => setField('ciudad', e.target.value)} /></label>
          <label>Provincia<input value={form.provincia} onChange={(e) => setField('provincia', e.target.value)} /></label>
          <label className="wide">Observaciones<textarea value={form.observaciones} onChange={(e) => setField('observaciones', e.target.value)} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving || !form.nombre.trim() || !form.apellidos.trim()}>
            {saving ? 'Creando...' : 'Crear paciente'}
          </button>
        </footer>
      </form>
    </div>
  );
}
