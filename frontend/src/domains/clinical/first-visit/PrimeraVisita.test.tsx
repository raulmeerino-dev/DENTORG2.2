import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiPaciente } from '../../../api/types';
import type { ValoracionCreate } from '../../../api/assessments';
import { registrarValoracion } from '../../../api/assessments';
import { clearSessionDrafts, setSessionDraftOwner } from '../../identity/session/sessionDrafts';
import { DiagnosticoWorkspace } from './DiagnosticoWorkspace';

vi.mock('../../../api/assessments', () => ({ registrarValoracion: vi.fn() }));
vi.mock('../odontogram', () => ({
  PatientOdontogramFlow: ({ readOnly }: { readOnly: boolean }) => <div data-testid="diagnostic-odontogram">{readOnly ? 'Consulta de piezas' : 'Exploración de piezas'}</div>,
}));
const patient: ApiPaciente = { id: 'pac-1', revision: 14, num_historial: 12, nombre: 'Paciente', apellidos: 'Prueba', fecha_nacimiento: null, telefono: null, activo: true };
const initial = { fecha: '2026-04-14', motivo: 'Valoración inicial antigua', periodontal: 'Nota inicial', relacion_legacy: 'preservada' };

function Harness({ paciente }: { paciente: ApiPaciente }) {
  const [visible, setVisible] = useState(true);
  const { data } = useQuery({ queryKey: ['paciente-detalle', paciente.id], initialData: paciente, enabled: false });
  return <><button onClick={() => setVisible(value => !value)}>Cambiar sección</button>{visible && <DiagnosticoWorkspace paciente={data} userRole="doctor" />}</>;
}
function setup(paciente = patient, route = '/pacientes?tab=primera') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><Harness paciente={paciente} /></MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  clearSessionDrafts();
  setSessionDraftOwner({ id: 'doctor-1', clinica_id: 'clinic-1' });
});

describe('Diagnóstico y valoraciones', () => {
  it('enters without creating a record and starts the initial form only explicitly', async () => {
    const user = userEvent.setup(); setup();
    expect(screen.getByRole('heading', { name: 'Diagnóstico' })).toBeVisible();
    expect(screen.queryByLabelText('Motivo de consulta')).not.toBeInTheDocument();
    expect(registrarValoracion).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Iniciar valoración inicial' }));
    expect(screen.getByRole('heading', { name: 'Primera visita' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar valoración' })).toBeDisabled();
    expect(screen.queryByTestId('diagnostic-odontogram')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir odontograma' }));
    expect(screen.getByTestId('diagnostic-odontogram')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cerrar odontograma' }));
    expect(screen.queryByTestId('diagnostic-odontogram')).not.toBeInTheDocument();
    expect(registrarValoracion).not.toHaveBeenCalled();
  });

  it('consults an old first visit without editing it or mounting the odontogram', async () => {
    const user = userEvent.setup(); setup({ ...patient, datos_salud: { primera_visita: initial } });
    await user.click(screen.getByRole('button', { name: 'Consultar primera visita del 14-04-26' }));
    expect(screen.getByText(initial.motivo)).toBeVisible();
    expect(screen.getByText(initial.periodontal)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar valoración' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Consultar odontograma actual' }));
    expect(screen.getByText('Consulta de piezas')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Volver a diagnóstico' }));
    expect(screen.getByRole('button', { name: 'Nueva valoración' })).toBeVisible();
    expect(registrarValoracion).not.toHaveBeenCalled();
  });

  it('keeps a draft and original revision across section changes and remote updates', async () => {
    const user = userEvent.setup(); const client = setup();
    await user.click(screen.getByRole('button', { name: 'Iniciar valoración inicial' }));
    await user.type(screen.getByLabelText('Motivo de consulta'), 'Borrador local');
    fireEvent.input(screen.getByLabelText('Fecha de valoración'), { target: { value: '2026-01-15' } });
    await user.click(screen.getByRole('button', { name: 'Cambiar sección' }));
    client.setQueryData(['paciente-detalle', patient.id], { ...patient, revision: 15 });
    await user.click(screen.getByRole('button', { name: 'Cambiar sección' }));
    expect(screen.getByLabelText('Motivo de consulta')).toHaveValue('Borrador local');
    expect(screen.getByLabelText('Fecha de valoración')).toHaveValue('2026-01-15');
    vi.mocked(registrarValoracion).mockRejectedValueOnce(new Error('La ficha cambió.'));
    await user.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    await screen.findByRole('alert');
    expect(registrarValoracion).toHaveBeenCalledWith(patient.id, expect.objectContaining({ revision: 14, datos: expect.objectContaining({ motivo: 'Borrador local' }) }));
    expect(screen.getByLabelText('Motivo de consulta')).toHaveValue('Borrador local');
  });

  it('saves a later assessment separately and can still consult the original', async () => {
    const user = userEvent.setup(); const paciente = { ...patient, datos_salud: { primera_visita: initial } }; setup(paciente);
    vi.mocked(registrarValoracion).mockImplementation(async (_id, input: ValoracionCreate) => ({
      ...paciente, revision: 15, datos_salud: { primera_visita: initial, valoraciones: [{ ...input.datos, id: input.id, tipo: 'posterior' }] },
    }));
    await user.click(screen.getByRole('button', { name: 'Nueva valoración' }));
    expect(screen.getByRole('heading', { name: 'Nueva valoración clínica' })).toBeVisible();
    expect(screen.getByLabelText('Motivo de consulta')).toHaveValue('');
    await user.type(screen.getByLabelText('Motivo de consulta'), 'Revisión posterior');
    await user.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    expect(await screen.findByText('Revisión posterior')).toBeVisible();
    expect(registrarValoracion).toHaveBeenCalledWith(patient.id, expect.objectContaining({ tipo: 'posterior' }));
    await user.click(screen.getByRole('button', { name: 'Volver a diagnóstico' }));
    await user.click(screen.getByRole('button', { name: 'Consultar primera visita del 14-04-26' }));
    expect(screen.getByText(initial.motivo)).toBeVisible();
  });

  it('restores a direct link to an older assessment with no write', async () => {
    setup({ ...patient, datos_salud: { primera_visita: initial, valoraciones: [{ id: 'old-1', fecha: '2026-05-01', motivo: 'Seguimiento antiguo' }] } }, '/pacientes?tab=diagnostico&valoracion_id=old-1');
    expect(screen.getByRole('heading', { name: 'Valoración clínica' })).toBeVisible();
    expect(screen.getByText('Seguimiento antiguo')).toBeVisible();
    expect(registrarValoracion).not.toHaveBeenCalled();
  });

  it('does not change navigation if saving finishes after leaving the section', async () => {
    const user = userEvent.setup(); setup();
    let finish!: (value: ApiPaciente) => void;
    vi.mocked(registrarValoracion).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Iniciar valoración inicial' }));
    await user.type(screen.getByLabelText('Motivo de consulta'), 'Valoración en curso');
    await user.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    await waitFor(() => expect(registrarValoracion).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Cambiar sección' }));
    finish({ ...patient, revision: 15, datos_salud: { primera_visita: { motivo: 'Valoración en curso' } } });
    await user.click(screen.getByRole('button', { name: 'Cambiar sección' }));
    expect(await screen.findByRole('heading', { name: 'Diagnóstico' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Valoraciones registradas' })).toHaveTextContent('Valoración en curso');
  });

  it('keeps the draft when returning to the assessment list and discards only explicitly', async () => {
    const user = userEvent.setup(); setup();
    await user.click(screen.getByRole('button', { name: 'Iniciar valoración inicial' }));
    await user.type(screen.getByLabelText('Motivo de consulta'), 'En curso');
    await user.click(screen.getByRole('button', { name: 'Volver a diagnóstico' }));
    await user.click(screen.getByRole('button', { name: 'Continuar borrador' }));
    expect(screen.getByLabelText('Motivo de consulta')).toHaveValue('En curso');
    await user.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar valoración inicial' })).toBeVisible());
    expect(registrarValoracion).not.toHaveBeenCalled();
  });
});
