import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Doctor, Laboratorio, PresupuestoLinea, TrabajoLaboratorio } from '../../types/api';
import { NuevoPedidoLaboratorioModal } from './Laboratorio';
import { contarLaboratorioVencidos } from './laboratorioUtils';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 1,
  nombre: 'Ana',
  apellidos: 'Lopez',
  fecha_nacimiento: null,
  telefono: null,
  activo: true,
};

const doctores: Doctor[] = [
  { id: 'doc-1', nombre: 'Dra. Ruiz', color_agenda: null, activo: true },
];

const laboratorios: Laboratorio[] = [
  { id: 'lab-1', nombre: 'Lab Norte', telefono: null, whatsapp: null, email: null, contacto: null, notas: null, activo: true },
];

const baseTrabajo: TrabajoLaboratorio = {
  id: 'trab-1',
  paciente_id: paciente.id,
  doctor_id: 'doc-1',
  laboratorio_id: 'lab-1',
  historial_id: null,
  descripcion: 'Corona zirconio',
  pieza_dental: 16,
  color: 'A2',
  observaciones: null,
  fecha_salida: null,
  fecha_entrega_prevista: '2030-01-01',
  fecha_recepcion: null,
  fecha_entrega_paciente: null,
  estado: 'enviado',
  precio: 100,
  numero_orden: 12,
  colocado: false,
  material_enviado: true,
  material_devuelto: false,
  paciente: null,
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
  laboratorio: laboratorios[0],
};

describe('contarLaboratorioVencidos', () => {
  it('cuenta solo trabajos con fecha pasada, sin recepcion y no entregados', () => {
    const trabajos: TrabajoLaboratorio[] = [
      { ...baseTrabajo, id: 'a', fecha_entrega_prevista: '2020-01-01', fecha_recepcion: null, estado: 'enviado' },
      { ...baseTrabajo, id: 'b', fecha_entrega_prevista: '2020-01-01', fecha_recepcion: '2020-01-05', estado: 'recibido' },
      { ...baseTrabajo, id: 'c', fecha_entrega_prevista: '2020-01-01', fecha_recepcion: null, estado: 'entregado' },
      { ...baseTrabajo, id: 'd', fecha_entrega_prevista: '2099-01-01', fecha_recepcion: null, estado: 'enviado' },
    ];
    expect(contarLaboratorioVencidos(trabajos)).toBe(1);
  });
});

describe('NuevoPedidoLaboratorioModal', () => {
  it('rellena descripcion/pieza si viene de una linea de presupuesto', () => {
    const linea: PresupuestoLinea = {
      id: 'lin-1',
      presupuesto_id: 'pres-1',
      tratamiento_id: 'trat-1',
      tratamiento: { id: 'trat-1', nombre: 'Corona zirconio', codigo: null },
      pieza_dental: 16,
      caras: null,
      precio_unitario: '290',
      descuento_porcentaje: '0',
      aceptado: true,
      pasado_trabajo_pendiente: false,
      importe_neto: '290',
    };
    render(
      <NuevoPedidoLaboratorioModal
        paciente={paciente}
        doctores={doctores}
        laboratorios={laboratorios}
        presupuestoLinea={linea}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const desc = screen.getByLabelText(/Descripcion/) as HTMLInputElement;
    expect(desc.value).toBe('Corona zirconio');
    const pieza = screen.getByLabelText(/Pieza dental/) as HTMLInputElement;
    expect(pieza.value).toBe('16');
    expect(screen.getByText(/Vinculado al tratamiento/)).toBeInTheDocument();
  });

  it('submit envía payload con presupuesto_linea_id y campos opcionales como null', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NuevoPedidoLaboratorioModal
        paciente={paciente}
        doctores={doctores}
        laboratorios={laboratorios}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(/Descripcion/), 'Corona prov.');
    await user.selectOptions(screen.getByLabelText(/Laboratorio/), 'lab-1');
    await user.selectOptions(screen.getByLabelText(/Doctor/), 'doc-1');
    await user.click(screen.getByRole('button', { name: /Crear pedido/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      paciente_id: paciente.id,
      doctor_id: 'doc-1',
      laboratorio_id: 'lab-1',
      descripcion: 'Corona prov.',
    });
    expect(payload.pieza_dental).toBeNull();
    expect(payload.color).toBeNull();
    expect(payload.presupuesto_linea_id).toBeNull();
    expect(payload.material_enviado).toBe(false);
  });

  it('boton crear deshabilitado sin campos obligatorios', () => {
    render(
      <NuevoPedidoLaboratorioModal
        paciente={paciente}
        doctores={doctores}
        laboratorios={laboratorios}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Crear pedido/ })).toBeDisabled();
  });

  it('muestra errorMessage si llega', () => {
    render(
      <NuevoPedidoLaboratorioModal
        paciente={paciente}
        doctores={doctores}
        laboratorios={laboratorios}
        errorMessage="Laboratorio no encontrado"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Laboratorio no encontrado')).toBeInTheDocument();
  });
});
