import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Doctor, RecetaClinica, RecetaPlantilla, RecetaProviderStatus } from '../../types/api';
import { HistorialRecetasDrawer, RecetaModal } from './Recetas';

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
  { id: 'doc-1', nombre: 'Dra. Ruiz', especialidad: 'Odontologia', color_agenda: null, activo: true },
  { id: 'doc-2', nombre: 'Dr. Soto', color_agenda: null, activo: true },
];

const plantillas: RecetaPlantilla[] = [
  {
    id: 'tpl-1',
    clinica_id: null,
    nombre: 'Receta privada Madrid',
    nombre_original: 'receta-madrid.png',
    mime_type: 'image/png',
    tamano_bytes: 1200,
    campos_config: null,
    requiere_dni: true,
    requiere_fecha_nacimiento: false,
    created_at: '2026-05-10T10:00:00',
  },
];

const disabledProvider: RecetaProviderStatus = {
  mode: 'disabled',
  provider_available: false,
  real_certification_enabled: false,
  warning: 'Receta no certificada. Modo local/mock o proveedor real no configurado.',
};

const mockProvider: RecetaProviderStatus = {
  mode: 'mock',
  provider_available: true,
  real_certification_enabled: false,
  warning: 'Receta no certificada. Modo local/mock o proveedor real no configurado.',
};

describe('RecetaModal', () => {
  it('renderiza el formulario con flujo de receta privada', () => {
    render(
      <RecetaModal
        paciente={paciente}
        doctores={doctores}
        plantillas={plantillas}
        providerStatus={disabledProvider}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Plantilla oficial/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Medicamento/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Posologia/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Num\. colegiado/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Receta no certificada/);
    expect(screen.getByRole('button', { name: /Guardar borrador/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Emitir local/ })).toBeDisabled();
  });

  it('preselecciona el doctor habitual del paciente si existe', () => {
    const pacienteConHabitual = { ...paciente, doctor_habitual_id: 'doc-2' };
    render(
      <RecetaModal
        paciente={pacienteConHabitual}
        doctores={doctores}
        plantillas={plantillas}
        providerStatus={disabledProvider}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const select = screen.getByLabelText(/Doctor prescriptor/) as HTMLSelectElement;
    expect(select.value).toBe('doc-2');
  });

  it('permite guardar borrador solo con doctor y plantilla', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RecetaModal
        paciente={paciente}
        doctores={doctores}
        plantillas={plantillas}
        providerStatus={disabledProvider}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Guardar borrador/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'draft',
      data: expect.objectContaining({ doctor_id: 'doc-1', plantilla_id: 'tpl-1' }),
    }));
  });

  it('emite local cuando estan todos los campos obligatorios', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RecetaModal
        paciente={paciente}
        doctores={doctores}
        plantillas={plantillas}
        providerStatus={disabledProvider}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(/Medicamento/), 'Ibuprofeno 600');
    await user.type(screen.getByLabelText(/Posologia/), '1 cada 8h');
    await user.type(screen.getByLabelText(/Unidades\/envases/), '1 envase');
    await user.type(screen.getByLabelText(/Duracion/), '5 dias');
    await user.type(screen.getByLabelText(/Num\. colegiado/), '28000123');
    await user.type(screen.getByLabelText(/Colegio/), 'Colegio Madrid');
    await user.type(screen.getByLabelText(/Provincia/), 'Madrid');
    await user.click(screen.getByRole('button', { name: /Emitir local/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'emit_local',
      data: expect.objectContaining({
        medicamento: 'Ibuprofeno 600',
        posologia: '1 cada 8h',
        unidades: '1 envase',
        duracion: '5 dias',
        prescriptor_num_colegiado: '28000123',
      }),
    }));
  });

  it('solo habilita proveedor si hay integracion disponible', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RecetaModal
        paciente={paciente}
        doctores={doctores}
        plantillas={plantillas}
        providerStatus={mockProvider}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(/Medicamento/), 'Paracetamol 1g');
    await user.type(screen.getByLabelText(/Posologia/), '1 cada 8h si dolor');
    await user.type(screen.getByLabelText(/Unidades\/envases/), '1 envase');
    await user.type(screen.getByLabelText(/Duracion/), '3 dias');
    await user.type(screen.getByLabelText(/Num\. colegiado/), '28000123');
    await user.type(screen.getByLabelText(/Colegio/), 'Colegio Madrid');
    await user.type(screen.getByLabelText(/Provincia/), 'Madrid');
    await user.click(screen.getByRole('button', { name: /Enviar a proveedor/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ action: 'send_provider' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Receta no certificada/);
  });

  it('importa una plantilla desde el modal', async () => {
    const user = userEvent.setup();
    const onImportPlantilla = vi.fn();
    render(
      <RecetaModal
        paciente={paciente}
        doctores={doctores}
        plantillas={[]}
        providerStatus={disabledProvider}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onImportPlantilla={onImportPlantilla}
      />,
    );
    const archivo = new File(['%PDF-1.4 test'], 'modelo-receta.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/Plantilla de receta/).querySelector('input[type="file"]') as HTMLInputElement, archivo);
    await user.click(screen.getByRole('button', { name: /Importar/ }));
    expect(onImportPlantilla).toHaveBeenCalledWith(expect.objectContaining({
      archivo,
      nombre: 'modelo-receta',
      requiere_dni: true,
    }));
  });

  it('muestra error inline si llega errorMessage', () => {
    render(
      <RecetaModal
        paciente={paciente}
        doctores={doctores}
        plantillas={plantillas}
        providerStatus={disabledProvider}
        errorMessage="Faltan datos obligatorios"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Faltan datos obligatorios');
  });
});

describe('HistorialRecetasDrawer', () => {
  const recetas: RecetaClinica[] = [
    {
      id: 'rec-1',
      paciente_id: paciente.id,
      doctor_id: 'doc-1',
      clinica_id: null,
      plantilla_id: 'tpl-1',
      medicamento: 'Amoxicilina 500',
      principio_activo: 'Amoxicilina',
      forma_farmaceutica: 'Comprimido',
      via_administracion: 'Oral',
      unidades: '21',
      duracion: '7 dias',
      posologia: '1 cada 8h',
      pauta: null,
      diagnostico: null,
      instrucciones_paciente: null,
      instrucciones_farmacia: null,
      prescriptor_nombre: 'Dra. Ruiz',
      prescriptor_num_colegiado: '28000123',
      prescriptor_colegio: 'Colegio Madrid',
      prescriptor_provincia: 'Madrid',
      prescriptor_especialidad: 'Odontologia',
      prescriptor_nif: null,
      fecha_prescripcion: '2026-05-10',
      fecha_dispensacion: null,
      estado: 'certificada',
      provider_mode: 'mock',
      external_id: 'MOCK-RX-123',
      provider_status: 'certificada_mock',
      provider_error: null,
      verification_code: 'MOCK-123',
      pdf_documento_id: 'doc-pdf-1',
      pdf_path: 'pacientes/pac-1/doc.pdf',
      pdf_hash_sha256: 'a'.repeat(64),
      firma_data_url: 'data:image/png;base64,xx',
      pdf_generado_at: '2026-05-10T10:00:00',
      emitida_at: null,
      enviada_proveedor_at: '2026-05-10T10:00:00',
      certificada_at: '2026-05-10T10:00:01',
      rechazada_at: null,
      anulada_at: null,
      dispensada_at: null,
      certificada_real: false,
      created_at: '2026-05-10T10:00:00',
      doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
      plantilla: plantillas[0],
    },
  ];

  it('muestra recetas y permite abrir el PDF final', async () => {
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
    expect(within(list).getByText(/Mock no certificado/)).toBeInTheDocument();
    expect(within(list).getByText(/ID externo: MOCK-RX-123/)).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'PDF final' }));
    expect(onAbrirPdf).toHaveBeenCalledWith(recetas[0]);
  });

  it('deshabilita abrir PDF si el borrador no tiene PDF final', () => {
    render(
      <HistorialRecetasDrawer
        paciente={paciente}
        recetas={[{ ...recetas[0], id: 'rec-2', estado: 'borrador', pdf_documento_id: null }]}
        onClose={vi.fn()}
        onAbrirPdf={vi.fn()}
        onCrearNueva={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Sin PDF' })).toBeDisabled();
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
    expect(screen.getByText(/aun no tiene recetas/)).toBeInTheDocument();
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
