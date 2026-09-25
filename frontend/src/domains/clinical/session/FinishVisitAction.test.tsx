import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cita, UserRole } from '../../../api/types';
import FinishVisitAction from './FinishVisitAction';

const finish = vi.hoisted(() => vi.fn());
vi.mock('../../../api/scheduling', () => ({ finalizarVisitaCita: finish }));
const cita = { id: 'c1', paciente_id: 'p1', doctor_id: 'd1', estado: 'en_atencion', estado_operativo: 'en_atencion', fecha_hora: '2026-09-21T10:00:00', duracion_min: 30, gabinete_id: null, motivo: null } satisfies Cita;
function Location() { const location = useLocation(); return <output aria-label="Ruta">{location.pathname}{location.search}</output>; }
function setup({ role = 'doctor', unsaved = false, citas = [cita], beforeFinish }: { role?: UserRole; unsaved?: boolean; citas?: Cita[]; beforeFinish?: () => Promise<void> } = {}) {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/pacientes?cita_id=c1']}><FinishVisitAction citas={citas} role={role} doctorId="d1" hasUnsaved={unsaved} beforeFinish={beforeFinish} /><Location /></MemoryRouter></QueryClientProvider>);
}
describe('Explicit visit completion', () => {
  beforeEach(() => finish.mockReset());
  it('requires explicit confirmation before handing the patient to reception', async () => {
    finish.mockResolvedValue({ ...cita, estado_operativo: 'finalizada', pendiente_salida: true });
    const user = userEvent.setup(); setup();
    await user.click(screen.getByRole('button', { name: /^Finalizar visita$/ }));
    expect(finish).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar finalización de visita' }));
    expect(finish).toHaveBeenCalledExactlyOnceWith('c1');
    await waitFor(() => expect(screen.getByLabelText('Ruta')).toHaveTextContent('/jornada?fecha=2026-09-21&vista=operativa'));
  });
  it('keeps unsaved clinical work in the session', () => {
    setup({ unsaved: true });
    expect(screen.getByRole('button', { name: 'Finalizar visita' })).toBeDisabled();
    expect(finish).not.toHaveBeenCalled();
  });
  it('saves pending notes before ending the visit and leaves it open on failure', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValueOnce(new Error('La nota no se ha guardado')).mockResolvedValueOnce(undefined);
    finish.mockResolvedValue({ ...cita, estado_operativo: 'finalizada' });
    setup({ beforeFinish: save });
    await user.click(screen.getByRole('button', { name: 'Finalizar visita' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar finalización de visita' }));
    await screen.findByText('La nota no se ha guardado');
    expect(finish).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Ruta')).toHaveTextContent('/pacientes');
    await user.click(screen.getByRole('button', { name: 'Confirmar finalización de visita' }));
    await waitFor(() => expect(finish).toHaveBeenCalledExactlyOnceWith('c1'));
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('does not offer clinical completion to reception', () => {
    setup({ role: 'recepcion' });
    expect(screen.queryByRole('button', { name: 'Finalizar visita' })).not.toBeInTheDocument();
  });
  it('does not offer completion of another doctor’s visit', () => {
    setup({ citas: [{ ...cita, doctor_id: 'd2' }] });
    expect(screen.queryByRole('button', { name: 'Finalizar visita' })).not.toBeInTheDocument();
  });
});
