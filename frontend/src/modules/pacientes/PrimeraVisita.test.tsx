import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente } from '../../types/api';
import { PrimeraVisitaPanel } from './PrimeraVisita';

vi.mock('../odontogram', () => ({
  PatientOdontogramFlow: () => <div data-testid="diagnostic-odontogram" />,
}));

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 91312,
  nombre: 'Cesar',
  apellidos: 'Gutierrez Velez',
  fecha_nacimiento: null,
  telefono: '600000000',
  activo: true,
};

describe('PrimeraVisitaPanel', () => {
  it('prioriza el odontograma y despliega la valoración solo cuando se solicita', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <PrimeraVisitaPanel
        paciente={paciente}
        onSave={onSave}
        saving={false}
        userRole="doctor"
      />,
    );

    expect(screen.getByTestId('diagnostic-odontogram')).toBeInTheDocument();
    expect(screen.queryByLabelText('Motivo de consulta')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Completar valoración' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByLabelText('Motivo de consulta'), 'Dolor en molar inferior');
    await user.click(screen.getByRole('button', { name: 'Guardar valoración' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      motivo: 'Dolor en molar inferior',
    }));
  });

  it('resume una valoración guardada sin abrir de nuevo el formulario', () => {
    render(
      <PrimeraVisitaPanel
        paciente={{
          ...paciente,
          datos_salud: {
            primera_visita: {
              fecha: '2026-04-14',
              motivo: 'Revisión general',
              periodontal: 'Sangrado localizado',
            },
          },
        }}
        onSave={vi.fn()}
        saving={false}
        userRole="doctor"
      />,
    );

    expect(screen.getByText('Registrada 14-04-26')).toBeInTheDocument();
    expect(screen.getByText('2 apartados clínicos informados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar valoración' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Motivo de consulta')).not.toBeInTheDocument();
  });
});
