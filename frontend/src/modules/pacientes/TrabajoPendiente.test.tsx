import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { Cita, Presupuesto, PresupuestoLinea, TrabajoPendiente } from '../../types/api';
import { TrabajoPendientePanel } from './TrabajoPendiente';

vi.mock('../odontogram', () => ({
  PatientOdontogramFlow: () => <div data-testid="pending-odontogram" />,
}));

function createLinea(id: string, pieza: number): PresupuestoLinea {
  return {
    id,
    presupuesto_id: 'pres-1',
    tratamiento_id: `trat-${id}`,
    tratamiento: { id: `trat-${id}`, nombre: 'Corona zirconio', codigo: 'COR' },
    pieza_dental: pieza,
    caras: null,
    precio_unitario: '300.00',
    descuento_porcentaje: '0.00',
    aceptado: true,
    pasado_trabajo_pendiente: true,
    importe_neto: '300.00',
  };
}

function createTrabajo(id: string, linea: PresupuestoLinea): TrabajoPendiente {
  return {
    id,
    paciente_id: 'pac-1',
    presupuesto_linea_id: linea.id,
    presupuesto_linea: linea,
    tratamiento_id: linea.tratamiento_id,
    tratamiento: linea.tratamiento,
    pieza_dental: linea.pieza_dental,
    caras: linea.caras,
    realizado: false,
    historial_id: null,
  };
}

describe('TrabajoPendientePanel', () => {
  it('dirige al presupuesto cuando hay lineas aceptadas que aun no se han preparado', async () => {
    const user = userEvent.setup();
    const onOpenPresupuestos = vi.fn();
    const linea = createLinea('linea-legacy', 24);
    linea.pasado_trabajo_pendiente = false;
    const presupuestoLegacy: Presupuesto = {
      id: 'pres-1',
      paciente_id: 'pac-1',
      numero: 43,
      fecha: '2026-07-10',
      estado: 'aceptado',
      pie_pagina: null,
      odontograma: {},
      doctor_id: 'doc-1',
      lineas: [linea],
      total: '300.00',
      total_aceptado: '300.00',
    };

    render(
      <TrabajoPendientePanel
        trabajosPendientes={[]}
        presupuestos={[presupuestoLegacy]}
        citas={[]}
        onDarCita={vi.fn()}
        onContextLinea={vi.fn()}
        onOpenPresupuestos={onOpenPresupuestos}
      />,
    );

    expect(screen.getByText('1 tratamiento aceptado pendiente de preparar')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-odontogram')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Revisar presupuesto/i }));
    expect(onOpenPresupuestos).toHaveBeenCalledTimes(1);
  });

  it('asocia citas solo mediante el id exacto de la linea de presupuesto', () => {
    const linea11 = createLinea('linea-11', 11);
    const linea12 = createLinea('linea-12', 12);
    const presupuesto: Presupuesto = {
      id: 'pres-1',
      paciente_id: 'pac-1',
      numero: 42,
      fecha: '2026-07-10',
      estado: 'aceptado',
      pie_pagina: null,
      odontograma: {},
      doctor_id: 'doc-1',
      lineas: [linea11, linea12],
      total: '600.00',
      total_aceptado: '600.00',
    };
    const citas: Cita[] = [
      {
        id: 'cita-vinculada-pasada',
        paciente_id: 'pac-1',
        doctor_id: 'doc-1',
        gabinete_id: null,
        presupuesto_linea_id: linea11.id,
        fecha_hora: '2026-07-01T09:00:00',
        duracion_min: 30,
        estado: 'atendida',
        motivo: 'Intento anterior',
      },
      {
        id: 'cita-vinculada',
        paciente_id: 'pac-1',
        doctor_id: 'doc-1',
        gabinete_id: null,
        presupuesto_linea_id: linea11.id,
        fecha_hora: '2026-07-20T10:00:00',
        duracion_min: 30,
        estado: 'confirmada',
        motivo: 'Revision general',
      },
      {
        id: 'cita-solo-mismo-nombre',
        paciente_id: 'pac-1',
        doctor_id: 'doc-1',
        gabinete_id: null,
        presupuesto_linea_id: null,
        fecha_hora: '2026-07-21T11:00:00',
        duracion_min: 30,
        estado: 'confirmada',
        motivo: 'Corona zirconio',
      },
    ];

    render(
      <TrabajoPendientePanel
        trabajosPendientes={[createTrabajo('tp-11', linea11), createTrabajo('tp-12', linea12)]}
        presupuestos={[presupuesto]}
        citas={citas}
        onDarCita={vi.fn()}
        onContextLinea={vi.fn()}
      />,
    );

    const row11 = screen.getByText('11').closest('tr');
    const row12 = screen.getByText('12').closest('tr');
    expect(row11).not.toBeNull();
    expect(row12).not.toBeNull();
    expect(within(row11!).getByText('20-07-26 10:00')).toBeInTheDocument();
    expect(within(row12!).getByText('Sin cita')).toBeInTheDocument();
  });
});
