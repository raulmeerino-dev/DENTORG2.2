import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { DocumentoPaciente } from '../../types/api';
import { formatDate } from '../../lib/utils';
import { openDocumentoPaciente } from '../../lib/api';

export function DocumentosPanel({
  pacienteId,
  documentos,
  onSubir,
  onContextDocumento,
}: {
  pacienteId: string | null;
  documentos: DocumentoPaciente[];
  onSubir: (data: { archivo: File; categoria: string; descripcion?: string; fecha_documento?: string; etiquetas?: string }) => void;
  onContextDocumento: (event: MouseEvent, documento: DocumentoPaciente) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [categoria, setCategoria] = useState('otro');
  const [descripcion, setDescripcion] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [etiquetas, setEtiquetas] = useState('');
  const categorias = ['radiografia', 'cbct', 'escaner', 'fotografia_intraoral', 'fotografia_extraoral', 'informe', 'circular', 'consentimiento', 'presupuesto', 'factura', 'otro'];

  function submitUpload() {
    if (!archivo) {
      setUploadError('Seleccione un archivo antes de subir.');
      return;
    }
    setUploadError('');
    onSubir({ archivo, categoria, descripcion, fecha_documento: fecha, etiquetas });
    setArchivo(null);
    setDescripcion('');
    setEtiquetas('');
  }

  return (
    <section className="desk-panel">
      <div className="panel-caption"><strong>Enlaces y archivos medicos</strong><span>Subida directa y consulta de documentos del paciente</span></div>
      <div className="upload-strip">
        <input type="file" onChange={(event) => setArchivo(event.target.files?.[0] ?? null)} />
        <select value={categoria} onChange={(event) => setCategoria(event.target.value)}>
          {categorias.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
        </select>
        <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
        <input value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder="Descripcion" />
        <input value={etiquetas} onChange={(event) => setEtiquetas(event.target.value)} placeholder="Etiquetas" />
        <button onClick={submitUpload} disabled={!pacienteId}>Adjuntar</button>
        {uploadError && <span className="inline-alert" role="alert">{uploadError}</span>}
      </div>
      <div className="document-chip-row">
        {categorias.map((item) => (
          <span key={item}>{item.replaceAll('_', ' ')}</span>
        ))}
      </div>
      <table className="euro-table">
        <thead><tr><th>Fecha</th><th>Categoria</th><th>Archivo</th><th>Tratamiento</th><th>Profesional</th><th>Notas</th><th>Etiquetas</th><th>Acciones</th></tr></thead>
        <tbody>
          {documentos.map((doc) => (
            <tr key={doc.id} onContextMenu={(event) => onContextDocumento(event, doc)}>
              <td>{formatDate(doc.fecha_documento ?? doc.created_at)}</td>
              <td>{doc.categoria}</td>
              <td>{doc.nombre_original}</td>
              <td>{doc.tratamiento_id ?? ''}</td>
              <td>{doc.doctor_id ?? ''}</td>
              <td>{doc.descripcion ?? ''}</td>
              <td>{doc.etiquetas ?? ''}</td>
              <td>{pacienteId && <button onClick={() => void openDocumentoPaciente(pacienteId, doc.id, doc.nombre_original)}>Abrir</button>}</td>
            </tr>
          ))}
          {!documentos.length && <tr><td colSpan={8}>Sin documentos archivados.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
