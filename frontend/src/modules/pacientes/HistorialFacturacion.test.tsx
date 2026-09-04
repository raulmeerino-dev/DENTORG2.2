import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, HistorialClinico } from '../../types/api';
import { DentCoreHistoryBillingPanel } from './HistorialFacturacion';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 101,
  nombre: 'Ana',
  apellidos: 'Lopez',
  fecha_nacimiento: null,
  telefono: null,
  activo: true,
};

const historial: HistorialClinico[] = [{
  id: 'hist-1',
  paciente_id: paciente.id,
  tratamiento_id: 'trat-1',
  doctor_id: 'doc-1',
  gabinete_id: null,
  pieza_dental: 16,
  caras: null,
  fecha: '2026-07-10',
  diagnostico: 'Caries',
  procedimiento: 'Obturacion',
  observaciones: null,
  estado: 'realizado',
  importe: '95.00',
  factura_id: null,
  tratamiento: null,
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
}];

function renderPanel(canManageBilling: boolean) {
  render(
    <DentCoreHistoryBillingPanel
      paciente={paciente}
      historial={historial}
      facturas={[]}
      canManageBilling={canManageBilling}
      onFacturar={vi.fn()}
      onCobrar={vi.fn()}
      onHistorialFacturas={vi.fn()}
      onAddAnticipo={vi.fn()}
      onCobrarImporte={vi.fn()}
      onRecibos={vi.fn()}
      onContextFactura={vi.fn()}
      onCrearReceta={vi.fn()}
      onOpenActivity={vi.fn()}
    />,
  );
}

describe('DentCoreHistoryBillingPanel permissions', () => {
  it('mantiene el historial clinico y oculta la informacion economica sin permiso', () => {
    renderPanel(false);

    expect(screen.getAllByText('Obturacion').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cobrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Facturas' })).not.toBeInTheDocument();
    expect(screen.queryByText('Importe')).not.toBeInTheDocument();
    expect(screen.queryByText('Cobrado')).not.toBeInTheDocument();
    expect(screen.queryByText('Saldo')).not.toBeInTheDocument();
  });

  it('conserva acciones y columnas economicas para administracion y recepcion', () => {
    renderPanel(true);

    expect(screen.getByRole('button', { name: 'Cobrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Facturas' })).toBeInTheDocument();
    expect(screen.getAllByText('Importe').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cobrado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Saldo').length).toBeGreaterThan(0);
  });
});
