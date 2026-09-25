import type { NotaDental } from '../../../api/types';

/** Administrative/system annotations are not evidence of a clinical consultation. */
export function isClinicalNote(note: NotaDental) {
  return Boolean(note.texto.trim()) && (!note.origen || ['manual', 'asistente_confirmado'].includes(note.origen));
}
