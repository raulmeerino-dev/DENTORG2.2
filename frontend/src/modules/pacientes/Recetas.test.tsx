import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Doctor, RecetaClinica } from '../../types/api';
import { RecetaModal, HistorialRecetasDrawer } from './Recetas';

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
  { id: 'doc-2', nombre: 'Dr. Soto', color_agenda: null, activo: true },
];

describe('RecetaModal', () => {
  it('renderiza el formulario con campos obligatorios', () => {
    render(<RecetaModal paciente={paciente} doctores={doctores} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Medicamento/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Posología/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Doctor prescriptor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear receta/ })).toBeDisabled();
  });

  it('preselecciona el doctor habitual del paciente si existe', () => {
    const pacienteConHabitual = { ...paciente, doctor_habitual_id: 'doc-2' };
    render(<RecetaModal paciente={pacienteConHabitual} doctores={doctores} onClose={vi.fn()} onSubmit={vi.fn()} />);
    const select = screen.getByLabelText(/Doctor prescriptor/) as HTMLSelectElement;
    expect(select.value).toBe('doc-2');
  });

  it('envia los campos rellenados al hacer submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RecetaModal paciente={paciente} doctores={doctores} onClose={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Medicamento/), 'Ibuprofeno 600');
    await user.type(screen.getByLabelText(/Posología/), '1 cada 8h');
    await user.selectOptions(screen.getByLabelText(/Doctor prescriptor/), 'doc-2');
    await user.click(screen.getByRole('button', { name: /Crear receta/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      medicamento: 'Ibuprofeno 600',
      posologia: '1 cada 8h',
      doctor_id: 'doc-2',
    });
  });

  it('campos opcionales vacios se envian como null', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RecetaModal paciente={paciente} doctores={doctores} onClose={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Medicamento/), 'Test');
    await user.type(screen.getByLabelText(/Posología/), 'pauta x');
    await user.selectOptions(screen.getByLabelText(/Doctor prescriptor/), 'doc-1');
    await user.click(screen.getByRole('button', { name: /Crear receta/ }));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.principio_activo).toBeNull();
    expect(payload.diagnostico).toBeNull();
    expect(payload.firma_data_url).toBeNull();
  });

  it('muestra error inline si llega errorMessage', () => {
    render(
      <RecetaModal
        paciente={paciente}
        doctores={doctores}
        errorMessage="Doctor de otra clinica"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Doctor de otra clinica');
  });
});

describe('HistorialRecetasDrawer', () => {
  const recetas: RecetaClinica[] = [
    {
      id: 'rec-1',
      paciente_id: paciente.id,
      doctor_id: 'doc-1',
      clinica_id: null,
      medicamento: 'Amoxicilina 500',
      principio_activo: 'Amoxicilina',
      forma_farmaceutica: 'Comprimido',
      via_administracion: 'Oral',
      unidades: '21',
      duracion: '7 días',
      posologia: '1 cada 8h',
      pauta: null,
      diagnostico: null,
      instrucciones_paciente: null,
      instrucciones_farmacia: null,
      fecha_prescripcion: '2026-05-10',
      fecha_dispensacion: null,
      firma_data_url: 'data:image/png;base64,xx',
      pdf_generado_at: null,
      created_at: '2026-05-10T10:00:00',
      doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
    },
  ];

  it('muestra recetas y permite abrir el PDF', async () => {
    const user = userEvent.setup();
    const onAbrirPdf = vi.fn();
    render(
      <HistorialRecetasDrawer
        paciente={paciente}
        recetas={recetas}
        onClose={vi.fn()}
        onAbrirPdf={onAbrirPdf}
        onCrearNueva={vi.fn()}
      />,
    );
    const list = screen.getByLabelText('Recetas del paciente');
    expect(within(list).getByText('Amoxicilina 500')).toBeInTheDocument();
    expect(within(list).getByText(/Dra\. Ruiz/)).toBeInTheDocument();
    expect(within(list).getByText(/firmada/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Ver PDF' }));
    expect(onAbrirPdf).toHaveBeenCalledWith(recetas[0]);
  });

  it('muestra estado vacio cuando no hay recetas', () => {
    render(
      <HistorialRecetasDrawer
        paciente={paciente}
        recetas={[]}
        onClose={vi.fn()}
        onAbrirPdf={vi.fn()}
        onCrearNueva={vi.fn()}
      />,
    );
    expect(screen.getByText(/aún no tiene recetas/)).toBeInTheDocument();
  });

  it('boton de nueva receta llama a onCrearNueva', async () => {
    const user = userEvent.setup();
    const onCrearNueva = vi.fn();
    render(
      <HistorialRecetasDrawer
        paciente={paciente}
        recetas={[]}
        onClose={vi.fn()}
        onAbrirPdf={vi.fn()}
        onCrearNueva={onCrearNueva}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Nueva receta/ }));
    expect(onCrearNueva).toHaveBeenCalledTimes(1);
  });
});
