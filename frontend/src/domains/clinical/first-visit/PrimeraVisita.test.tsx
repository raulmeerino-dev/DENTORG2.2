import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente } from '../../../api/types';
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
  it('muestra la valoración y carga el odontograma solo al abrir exploración', async () => {
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

    expect(screen.queryByTestId('diagnostic-odontogram')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Motivo de consulta')).toBeInTheDocument();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    await user.click(screen.getByRole('button', { name: 'Exploración / Odontograma' }));
    expect(screen.getByTestId('diagnostic-odontogram')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Motivo de consulta'), 'Dolor en molar inferior');
    await user.click(screen.getByRole('button', { name: 'Guardar valoración' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      motivo: 'Dolor en molar inferior',
    }));
  });

  it('conserva los datos guardados accesibles y no monta el odontograma', () => {
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
    expect(screen.getByLabelText('Motivo de consulta')).toHaveValue('Revisión general');
    expect(screen.getByLabelText('Estado periodontal')).toHaveValue('Sangrado localizado');
    expect(screen.queryByTestId('diagnostic-odontogram')).not.toBeInTheDocument();
  });
});
