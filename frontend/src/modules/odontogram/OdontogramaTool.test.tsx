import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import type { ApiPaciente, UserRole } from '../../types/api';
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

function renderTool(mode: ComponentProps<typeof OdontogramaTool>['mode'], data?: ToothData[], userRole: UserRole = 'admin') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OdontogramaTool paciente={paciente} mode={mode} data={data ?? [createBaseTooth('16')]} userRole={userRole} />
    </QueryClientProvider>,
  );
}

describe('OdontogramaTool', () => {
  it('renderiza diagnostico sin acciones de presupuesto', () => {
    renderTool('diagnostico');

    expect(screen.getByText('Odontograma diagnóstico')).toBeInTheDocument();
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

  it('oculta acciones diagnosticas para recepcion', () => {
    renderTool('diagnostico', undefined, 'recepcion');

    expect(screen.getByText('Odontograma diagnóstico')).toBeInTheDocument();
    expect(screen.queryByText('Guardar diagnostico')).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar superficie')).not.toBeInTheDocument();
  });

  it('renderiza pendientes con acciones de trabajo clinico', () => {
    renderTool('pendiente', [{
      ...createBaseTooth('16'),
      surfaces: { occlusal: 'pending' },
      contextLabel: 'Endodoncia pendiente',
      contextState: 'tratamiento_pendiente',
    }]);

    expect(screen.getByText('Tratamientos pendientes')).toBeInTheDocument();
    expect(screen.getByText('Dar cita')).toBeInTheDocument();
    expect(screen.getByText('En proceso')).toBeInTheDocument();
    expect(screen.getByText('Marcar realizado')).toBeInTheDocument();
    expect(screen.queryByText('Anadir linea')).not.toBeInTheDocument();
  });

  it('limita pendiente de recepcion a dar cita', () => {
    renderTool('pendiente', [{
      ...createBaseTooth('16'),
      surfaces: { occlusal: 'pending' },
      contextLabel: 'Endodoncia pendiente',
      contextState: 'tratamiento_pendiente',
    }], 'recepcion');

    expect(screen.getByText('Dar cita')).toBeInTheDocument();
    expect(screen.queryByText('Marcar realizado')).not.toBeInTheDocument();
  });

  it('renderiza realizados con acciones de consulta y documento', () => {
    renderTool('realizado', [{
      ...createBaseTooth('16'),
      surfaces: { occlusal: 'completed' },
      contextLabel: 'Obturacion realizada',
      contextState: 'tratamiento_realizado',
    }]);

    expect(screen.getByText('Tratamientos realizados')).toBeInTheDocument();
    expect(screen.getByText('Ver detalle')).toBeInTheDocument();
    expect(screen.getByText('Asociar documento')).toBeInTheDocument();
    expect(screen.getByText('Ver factura')).toBeInTheDocument();
    expect(screen.queryByText('Guardar diagnostico')).not.toBeInTheDocument();
  });

  it('modo lectura no muestra acciones modificables', () => {
    renderTool('lectura');

    expect(screen.getByText('Odontograma actual')).toBeInTheDocument();
    expect(screen.queryByText('Guardar diagnostico')).not.toBeInTheDocument();
    expect(screen.queryByText('Anadir linea')).not.toBeInTheDocument();
    expect(screen.queryByText('Acciones clinicas')).not.toBeInTheDocument();
  });

  it('renderiza documentos como capa de lectura con acciones propias', () => {
    renderTool('documentos');

    expect(screen.getByText('Documentos vinculados')).toBeInTheDocument();
    expect(screen.getByText('Asociar documento')).toBeInTheDocument();
    expect(screen.queryByText('Anadir linea')).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar diagnostico')).not.toBeInTheDocument();
  });
});
