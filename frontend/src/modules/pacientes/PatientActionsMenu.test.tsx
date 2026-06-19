import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente } from '../../types/api';
import { PatientActionsMenu } from './PatientActionsMenu';
import { buildWhatsAppUrl } from './patientActionUtils';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 91312,
  nombre: 'Cesar',
  apellidos: 'Gutierrez',
  fecha_nacimiento: null,
  telefono: '+34 600 123 456',
  activo: true,
};

function makeHandlers(overrides: Partial<Parameters<typeof PatientActionsMenu>[0]['handlers']> = {}) {
  return {
    onNuevaCita: vi.fn(),
    onNuevoPresupuesto: vi.fn(),
    onCobrar: vi.fn(),
    onSubirDocumento: vi.fn(),
    onConsentimiento: vi.fn(),
    onRevocarConsentimiento: vi.fn(),
    onCircular: vi.fn(),
    onCuestionarioMedico: vi.fn(),
    onDocumentoLOPD: vi.fn(),
    onWhatsApp: vi.fn(),
    onComentario: vi.fn(),
    onCopiarDatos: vi.fn(),
    onVistaCompleta: vi.fn(),
    ...overrides,
  };
}

describe('PatientActionsMenu', () => {
  it('muestra los 4 botones principales y el botón mas acciones', () => {
    const handlers = makeHandlers();
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);
    expect(screen.getByRole('button', { name: 'Nueva cita' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cobrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mas acciones/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nuevo ppto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recetas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subir doc/i })).not.toBeInTheDocument();
  });

  it('deshabilita todo si no hay paciente', () => {
    const handlers = makeHandlers();
    render(<PatientActionsMenu paciente={null} handlers={handlers} />);
    expect(screen.getByRole('button', { name: 'Nueva cita' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Mas acciones/i })).toBeDisabled();
  });

  it('clic en botones principales dispara los handlers correctos', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);
    await user.click(screen.getByRole('button', { name: 'Nueva cita' }));
    await user.click(screen.getByRole('button', { name: 'Cobrar' }));
    expect(handlers.onNuevaCita).toHaveBeenCalledTimes(1);
    expect(handlers.onCobrar).toHaveBeenCalledTimes(1);
  });

  it('abre el dropdown y dispara acciones secundarias', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    const menu = screen.getByRole('menu');
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByRole('group', { name: 'Clinico' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Documentos' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Comunicacion' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Otros' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Nuevo presupuesto' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Subir documento' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Vista completa' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Consentimiento informado' }));
    expect(handlers.onConsentimiento).toHaveBeenCalledTimes(1);
    expect(menu).not.toBeInTheDocument();
  });

  it('acciones movidas al menu llaman a sus handlers', async () => {
    const user = userEvent.setup();
    const onCrearReceta = vi.fn();
    const handlers = makeHandlers({ onCrearReceta });
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);

    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Nuevo presupuesto' }));
    expect(handlers.onNuevoPresupuesto).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Recetas' }));
    expect(onCrearReceta).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Subir documento' }));
    expect(handlers.onSubirDocumento).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Vista completa' }));
    expect(handlers.onVistaCompleta).toHaveBeenCalledTimes(1);
  });

  it('cierra el dropdown con Escape y al hacer click fuera', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);

    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('receta principal y laboratorio aparecen disabled cuando no se proporcionan handlers', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    expect(screen.getByRole('menuitem', { name: 'Recetas' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Pedido de laboratorio' })).toBeDisabled();
    // Label cambiado en F1
    expect(screen.getByRole('menuitem', { name: 'Documento cuestionario medico' })).toBeInTheDocument();
  });

  it('si se proporcionan onCrearReceta y onPedidoLaboratorio, se habilitan sin duplicar receta en el menu', async () => {
    const user = userEvent.setup();
    const onCrearReceta = vi.fn();
    const onPedidoLaboratorio = vi.fn();
    const handlers = makeHandlers({ onCrearReceta, onPedidoLaboratorio });
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Recetas' }));
    expect(onCrearReceta).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    const labBtn = screen.getByRole('menuitem', { name: 'Pedido de laboratorio' });
    expect(labBtn).not.toBeDisabled();
    await user.click(labBtn);
    expect(onPedidoLaboratorio).toHaveBeenCalledTimes(1);
  });

  it('WhatsApp, Comentario y Copiar datos llaman a sus handlers', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(<PatientActionsMenu paciente={paciente} handlers={handlers} />);
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'WhatsApp' }));
    expect(handlers.onWhatsApp).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Comentario / nota' }));
    expect(handlers.onComentario).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Mas acciones/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Copiar datos' }));
    expect(handlers.onCopiarDatos).toHaveBeenCalledTimes(1);
  });
});

describe('buildWhatsAppUrl', () => {
  it('devuelve la URL wa.me con solo dígitos del teléfono', () => {
    expect(buildWhatsAppUrl(paciente)).toBe('https://wa.me/34600123456');
  });

  it('usa telefono2 si telefono no existe', () => {
    expect(buildWhatsAppUrl({ ...paciente, telefono: null, telefono2: '654321987' })).toBe('https://wa.me/654321987');
  });

  it('devuelve null si no hay teléfono', () => {
    expect(buildWhatsAppUrl(null)).toBeNull();
    expect(buildWhatsAppUrl({ ...paciente, telefono: null })).toBeNull();
  });
});
