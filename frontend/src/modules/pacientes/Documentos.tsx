import { useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Folder, FolderPlus, UploadCloud, X } from 'lucide-react';
import type { DocumentoPaciente } from '../../types/api';
import { formatDate } from '../../lib/utils';

type UploadDocumentoData = {
  archivo: File;
  categoria: string;
  descripcion?: string;
  fecha_documento?: string;
  etiquetas?: string;
};

const DOCUMENT_FOLDERS = [
  { id: 'radiografia', label: 'Radiografias' },
  { id: 'cbct', label: 'TAC / CBCT' },
  { id: 'escaner', label: 'Escaneres' },
  { id: 'fotografia_intraoral', label: 'Fotos intraorales' },
  { id: 'fotografia_extraoral', label: 'Fotos extraorales' },
  { id: 'informe', label: 'Informes' },
  { id: 'consentimiento', label: 'Consentimientos' },
  { id: 'presupuesto', label: 'Presupuestos' },
  { id: 'factura', label: 'Facturas' },
  { id: 'circular', label: 'Circulares' },
  { id: 'otro', label: 'Otros' },
] as const;

const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'doc', 'docx']);
const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.tif,.tiff,.bmp,.doc,.docx';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const folderLabelById: Map<string, string> = new Map(DOCUMENT_FOLDERS.map((folder) => [folder.id, folder.label]));

function splitTags(etiquetas?: string | null) {
  return (etiquetas ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function customFolderFromTags(etiquetas?: string | null) {
  const tag = splitTags(etiquetas).find((item) => item.toLowerCase().startsWith('carpeta:'));
  return tag?.slice(tag.indexOf(':') + 1).trim() || null;
}

function documentFolder(doc: DocumentoPaciente) {
  return customFolderFromTags(doc.etiquetas) || folderLabelById.get(doc.categoria as never) || doc.categoria || 'Otros';
}

function cleanTags(etiquetas?: string | null) {
  return splitTags(etiquetas).filter((tag) => !tag.toLowerCase().startsWith('carpeta:'));
}

function documentTitle(doc: DocumentoPaciente) {
  return doc.descripcion?.trim() || doc.nombre_original;
}

function fileBaseName(file: File) {
  return file.name.replace(/\.[^.]+$/, '');
}

export function DocumentosPanel({
  pacienteId,
  documentos,
  uploadOpen,
  onUploadOpenChange,
  onSubir,
  onAbrirDocumento,
  onContextDocumento,
}: {
  pacienteId: string | null;
  documentos: DocumentoPaciente[];
  uploadOpen: boolean;
  onUploadOpenChange: (open: boolean) => void;
  onSubir: (data: UploadDocumentoData) => Promise<unknown> | unknown;
  onAbrirDocumento: (documento: DocumentoPaciente) => void;
  onContextDocumento: (event: MouseEvent, documento: DocumentoPaciente) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [carpeta, setCarpeta] = useState<string>('radiografia');
  const [nuevaCarpeta, setNuevaCarpeta] = useState('');
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const [nombreDocumento, setNombreDocumento] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [etiquetas, setEtiquetas] = useState('');

  const carpetasPersonalizadas = useMemo(() => {
    const folders = new Set<string>();
    documentos.forEach((doc) => {
      const folder = customFolderFromTags(doc.etiquetas);
      if (folder) folders.add(folder);
    });
    return Array.from(folders).sort((a, b) => a.localeCompare(b));
  }, [documentos]);

  const documentosPorCarpeta = useMemo(() => {
    const groups = new Map<string, DocumentoPaciente[]>();
    documentos.forEach((doc) => {
      const folder = documentFolder(doc);
      const list = groups.get(folder) ?? [];
      list.push(doc);
      groups.set(folder, list);
    });
    return Array.from(groups.entries())
      .map(([folder, docs]) => ({
        folder,
        docs: docs.sort((a, b) => (b.fecha_documento || b.created_at || '').localeCompare(a.fecha_documento || a.created_at || '')),
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder));
  }, [documentos]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setArchivo(nextFile);
    setUploadError('');
    if (nextFile) setNombreDocumento(fileBaseName(nextFile));
  }

  function validateFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_DOCUMENT_EXTENSIONS.has(extension)) {
      return 'Formato no permitido. Use PDF, imagenes o documentos Word.';
    }
    if (file.size <= 0) return 'El archivo esta vacio.';
    if (file.size > MAX_UPLOAD_BYTES) return 'El archivo supera el limite de 50 MB.';
    return '';
  }

  function resetUpload() {
    setArchivo(null);
    setNombreDocumento('');
    setEtiquetas('');
    setNuevaCarpeta('');
    setCreandoCarpeta(false);
    setUploadError('');
  }

  function closeUpload() {
    resetUpload();
    onUploadOpenChange(false);
  }

  async function submitUpload() {
    if (!archivo) {
      setUploadError('Seleccione un archivo antes de guardar.');
      return;
    }
    const fileError = validateFile(archivo);
    if (fileError) {
      setUploadError(fileError);
      return;
    }
    const customFolder = creandoCarpeta ? nuevaCarpeta.trim() : carpeta.startsWith('custom:') ? carpeta.slice(7).trim() : '';
    if (creandoCarpeta && !customFolder) {
      setUploadError('Indique el nombre de la nueva carpeta.');
      return;
    }
    const knownFolder = !customFolder ? carpeta : null;
    const categoria = knownFolder && folderLabelById.has(knownFolder) ? knownFolder : 'otro';
    const tags = cleanTags(etiquetas);
    if (customFolder) tags.unshift(`carpeta:${customFolder}`);
    setUploadError('');
    setUploading(true);
    try {
      await onSubir({
        archivo,
        categoria,
        descripcion: nombreDocumento.trim() || fileBaseName(archivo),
        fecha_documento: fecha,
        etiquetas: tags.join(', '),
      });
      closeUpload();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'No se pudo subir el documento.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="desk-panel documents-workspace">
      <div className="panel-caption documents-panel-head">
        <div>
          <strong>Documentos del paciente</strong>
          <span>Archivos guardados por carpeta dentro de la ficha</span>
        </div>
        <button type="button" className="primary-action" onClick={() => onUploadOpenChange(true)} disabled={!pacienteId}>
          <UploadCloud size={15} strokeWidth={2} aria-hidden="true" />
          Subir documento
        </button>
      </div>

      <div className="document-folder-grid">
        {documentosPorCarpeta.map(({ folder, docs }) => (
          <section className="document-folder-card" key={folder}>
            <header>
              <span><Folder size={15} strokeWidth={2} aria-hidden="true" />{folder}</span>
              <b>{docs.length}</b>
            </header>
            <table className="euro-table compact-table">
              <thead><tr><th>Fecha</th><th>Nombre</th><th>Tipo</th><th>Etiquetas</th><th /></tr></thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} onContextMenu={(event) => onContextDocumento(event, doc)}>
                    <td>{formatDate(doc.fecha_documento ?? doc.created_at)}</td>
                    <td>
                      <strong>{documentTitle(doc)}</strong>
                      <small>{doc.nombre_original}</small>
                    </td>
                    <td>{doc.categoria.replaceAll('_', ' ')}</td>
                    <td>{cleanTags(doc.etiquetas).join(', ') || '-'}</td>
                    <td>{pacienteId && <button type="button" onClick={() => onAbrirDocumento(doc)}>Abrir</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {!documentos.length && (
          <div className="empty-state document-empty-state">
            <FolderPlus size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>Sin documentos archivados</strong>
            <span>Suba el primer archivo y guardelo en la carpeta correspondiente.</span>
          </div>
        )}
      </div>

      {uploadOpen && (
        <div className="document-upload-backdrop" onMouseDown={closeUpload}>
          <section className="document-upload-modal" role="dialog" aria-modal="true" aria-label="Subir documento" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>Subir documento</strong>
                <span>El archivo quedara guardado en Documentos y consentimientos de la ficha.</span>
              </div>
              <button type="button" aria-label="Cerrar" onClick={closeUpload}><X size={16} strokeWidth={2} /></button>
            </header>

            <label className="document-upload-file">
              <UploadCloud size={18} strokeWidth={2} aria-hidden="true" />
              <span>{archivo ? archivo.name : 'Seleccionar archivo'}</span>
              <input type="file" accept={DOCUMENT_ACCEPT} onChange={handleFile} />
            </label>

            <div className="document-upload-grid">
              <label>Nombre en la ficha
                <input value={nombreDocumento} onChange={(event) => setNombreDocumento(event.target.value)} placeholder="Ej. TAC implante 36" />
              </label>
              <label>Fecha del documento
                <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
              </label>
              <label>Carpeta
                <select value={carpeta} onChange={(event) => { setCarpeta(event.target.value); setCreandoCarpeta(false); }}>
                  {DOCUMENT_FOLDERS.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
                  {carpetasPersonalizadas.map((folder) => <option key={folder} value={`custom:${folder}`}>{folder}</option>)}
                </select>
              </label>
              <label>Etiquetas
                <input value={etiquetas} onChange={(event) => setEtiquetas(event.target.value)} placeholder="implante, rx, urgencia..." />
              </label>
            </div>

            <button type="button" className="secondary-action document-new-folder" onClick={() => setCreandoCarpeta((prev) => !prev)}>
              <FolderPlus size={14} strokeWidth={2} aria-hidden="true" />
              {creandoCarpeta ? 'Usar carpeta existente' : 'Crear nueva carpeta'}
            </button>
            {creandoCarpeta && (
              <label className="document-new-folder-input">Nombre de la nueva carpeta
                <input value={nuevaCarpeta} onChange={(event) => setNuevaCarpeta(event.target.value)} placeholder="Ej. Implantes 2026" />
              </label>
            )}

            {uploadError && <div className="inline-alert" role="alert">{uploadError}</div>}

            <footer>
              <button type="button" className="secondary-action" onClick={closeUpload}>Cancelar</button>
              <button type="button" className="primary-action" onClick={submitUpload} disabled={!pacienteId || uploading}>
                {uploading ? 'Guardando...' : 'Guardar documento'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
