async function ensurePdfBlob(blob: Blob) {
  if (blob.size < 5) throw new Error('El PDF generado esta vacio.');
  const header = await blob.slice(0, 5).text();
  if (header !== '%PDF-') throw new Error('El servidor no devolvio un PDF valido.');
  if (blob.type && !blob.type.toLowerCase().includes('pdf')) {
    throw new Error('El servidor devolvio un tipo de archivo inesperado para el PDF.');
  }
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function openOrDownloadBlob(
  blob: Blob,
  filename: string,
  options: { requirePdf?: boolean } = {},
) {
  if (!blob.size) throw new Error('El archivo descargado esta vacio.');
  if (options.requirePdf) await ensurePdfBlob(blob);
  const url = URL.createObjectURL(blob);
  let opened: Window | null = null;
  try {
    try {
      opened = window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      opened = null;
    }
    if (!opened) triggerDownload(url, filename);
    return { opened: Boolean(opened), downloaded: !opened };
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
