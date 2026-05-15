import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import type { ApiPaciente } from '../../types/api';
import { createBaseTooth } from './data/toothMap';
import { OdontogramaTool } from './OdontogramaTool';
import type { ToothData } from './types/odontogram.types';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 1234,
  nombre: 'Ana',
  apellidos: 'Prueba',
  fecha_nacimiento: null,
  telefono: '600000000',
  activo: true,
};

function renderTool(mode: ComponentProps<typeof OdontogramaTool>['mode'], data?: ToothData[]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OdontogramaTool paciente={paciente} mode={mode} data={data ?? [createBaseTooth('16')]} />
    </QueryClientProvider>,
  );
}

describe('OdontogramaTool', () => {
  it('renderiza diagnostico sin acciones de presupuesto', () => {
    renderTool('diagnostico');

    expect(screen.getByText('Odontograma diagnostico')).toBeInTheDocument();
    expect(screen.getByText('Guardar diagnostico')).toBeInTheDocument();
    expect(screen.queryByText('Anadir linea')).not.toBeInTheDocument();
  });

  it('renderiza presupuesto con acciones economicas del contexto', () => {
    renderTool('presupuesto');

    expect(screen.getByText('Odontograma del presupuesto')).toBeInTheDocument();
    expect(screen.getByText('Anadir linea')).toBeInTheDocument();
    expect(screen.queryByText('Guardar diagnostico')).not.toBeInTheDocument();
    expect(screen.queryByText('Acciones clinicas')).not.toBeInTheDocument();
  });

  it('modo lectura no muestra acciones modificables', () => {
    renderTool('lectura');

    expect(screen.getByText('Odontograma actual')).toBeInTheDocument();
    expect(screen.queryByText('Guardar diagnostico')).not.toBeInTheDocument();
    expect(screen.queryByText('Anadir linea')).not.toBeInTheDocument();
    expect(screen.queryByText('Acciones clinicas')).not.toBeInTheDocument();
  });
});
