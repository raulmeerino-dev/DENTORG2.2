import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import type { NotaDental } from '../../../api/types';
import { editClinicalDictationNote } from '../../../api/ai';
import { SessionDictationNotes } from './SessionDictationNotes';

vi.mock('../../../api/ai', () => ({ editClinicalDictationNote: vi.fn() }));
vi.mock('../../../shared/time/clinicTime', () => ({ clinicDate: () => '2026-09-25' }));
const note: NotaDental = { id: 'note', paciente_id: 'patient', texto: 'Nota original', fecha: '2026-09-25', origen: 'dictado_clinico', cita_id: 'visit', historial_id: null, doctor_id: null, pieza_dental: null, caras: null };
function open(notes = [note], canEdit = true) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionDictationNotes notes={notes} citaId="visit" canEdit={canEdit} /></QueryClientProvider>);
}
beforeEach(() => vi.clearAllMocks());

it('shows current-visit and unassigned notes today, excluding other visits and non-dictation notes', () => {
  open([note, { ...note, id: 'general', cita_id: null, texto: 'General de hoy' }, { ...note, id: 'other', cita_id: 'other', texto: 'Otra visita' }, { ...note, id: 'old', cita_id: null, fecha: '2026-09-24', texto: 'Nota antigua' }, { ...note, id: 'manual', origen: 'manual', texto: 'Nota dental manual' }], false);
  expect(screen.getAllByText('Nota original')).toHaveLength(2);
  expect(screen.getAllByText('General de hoy')).toHaveLength(2);
  expect(screen.queryByText('Otra visita')).not.toBeInTheDocument();
  expect(screen.queryByText('Nota antigua')).not.toBeInTheDocument();
  expect(screen.queryByText('Nota dental manual')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar texto' })).not.toBeInTheDocument();
});

it('protects a draft on close and retains text when another professional changed the note', async () => {
  const user = userEvent.setup(); open();
  await user.click(screen.getAllByText('Nota original')[0]);
  await user.click(screen.getByRole('button', { name: 'Editar texto' }));
  const text = screen.getByRole('textbox', { name: 'Texto de la nota' });
  await user.clear(text); await user.type(text, 'Revisión pendiente');
  await user.keyboard('{Escape}');
  expect(screen.getByText('Hay cambios sin guardar.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
  vi.mocked(editClinicalDictationNote).mockRejectedValueOnce(new Error('La nota ha cambiado'));
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('La nota ha cambiado');
  expect(text).toHaveValue('Revisión pendiente');
  expect(editClinicalDictationNote).toHaveBeenCalledWith('patient', 'note', 'Revisión pendiente', 'Nota original');
  vi.mocked(editClinicalDictationNote).mockResolvedValueOnce({ dictado_id: null, nota_id: 'note', paciente_id: 'patient', texto: 'Revisión pendiente', fecha: note.fecha, origen: 'dictado_clinico' });
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
