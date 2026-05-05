import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OdontogramaPacientePanel } from '.';
import type { ApiPaciente, OdontogramaPaciente, TratamientoCatalogo } from '../../types/api';

const odontograma: OdontogramaPaciente = {
  id: 'odon-1',
  paciente_id: 'pac-1',
  clinica_id: 'clinica-1',
  version: 1,
  activo: true,
  created_at: '2026-04-29T10:00:00Z',
  updated_at: null,
  piezas: [
    {
      id: 'piece-24',
      odontograma_id: 'odon-1',
      pieza_fdi: 24,
      estado_general: 'caries',
      notas: null,
      superficies: [
        {
          id: 'surface-24-o',
          pieza_id: 'piece-24',
          superficie: 'oclusal_incisal',
          condicion: 'tratamiento_pendiente',
          tratamiento_planificado_id: 'trat-1',
          tratamiento_realizado_id: null,
          color_estado: '#facc15',
          notas: null,
        },
      ],
    },
  ],
};

vi.mock('../../lib/api', () => ({
  getOdontogramaPaciente: vi.fn(async () => odontograma),
  getOdontogramaHistorial: vi.fn(async () => []),
  updateOdontogramaPieza: vi.fn(),
  updateOdontogramaSuperficie: vi.fn(),
  createPresupuestoFromOdontograma: vi.fn(),
  duplicateOdontogramaVersion: vi.fn(),
}));

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const paciente: ApiPaciente = {
    id: 'pac-1',
    num_historial: 3485,
    nombre: 'PILAR',
    apellidos: 'OJEDA CALVO',
    fecha_nacimiento: null,
    telefono: '600000001',
    activo: true,
  };
  const tratamientos: TratamientoCatalogo[] = [
    {
      id: 'trat-1',
      familia_id: 'fam-1',
      familia: { id: 'fam-1', nombre: 'Endodoncia', icono: 'EN', orden: 1 },
      codigo: 'EN001',
      nombre: 'Endodoncia unirradicular',
      precio: '150.00',
      iva_porcentaje: '0.00',
      requiere_pieza: true,
      requiere_caras: false,
      activo: true,
    },
  ];
  return render(
    <QueryClientProvider client={queryClient}>
      <OdontogramaPacientePanel paciente={paciente} tratamientos={tratamientos} doctorId="doc-1" />
    </QueryClientProvider>,
  );
}

describe('OdontogramaPacientePanel', () => {
  it('muestra arcadas, paciente y acciones principales', async () => {
    renderPanel();
    expect(await screen.findByText('Odontograma clinico')).toBeInTheDocument();
    expect(screen.getByText('3485 - OJEDA CALVO, PILAR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /24/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pasar a presupuesto/ })).toBeInTheDocument();
  });
});
