import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Doctor } from '../../types/api';
import { PatientEditModal, PatientForm, PatientIdentityChips } from './FichaPaciente';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 91312,
  nombre: 'Cesar',
  apellidos: 'Gutierrez Velez',
  fecha_nacimiento: null,
  telefono: '600000000',
  activo: true,
  observaciones: 'LIMP cada 6 meses',
};

const noop = vi.fn();

describe('PatientForm', () => {
  it('renders a compact patient summary with next visit, last visit and balance', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    noop.mockClear();
    render(
      <QueryClientProvider client={queryClient}>
        <PatientForm
          paciente={paciente}
          facturas={[]}
          historial={[{
            id: 'hist-1',
            paciente_id: paciente.id,
            fecha: '2026-04-14',
            doctor_id: '',
            gabinete_id: null,
            tratamiento_id: '',
            pieza_dental: 24,
            caras: null,
            diagnostico: null,
            procedimiento: 'Limpieza',
            observaciones: 'Control en 6 meses',
            estado: 'realizado',
            importe: '60.00',
            factura_id: null,
            tratamiento: null,
            doctor: null,
          }]}
          citas={[{
            id: 'cita-1',
            paciente_id: paciente.id,
            doctor_id: 'doc-1',
            gabinete_id: null,
            fecha_hora: '2026-06-01T10:00:00',
            duracion_min: 30,
            estado: 'programada',
            es_urgencia: false,
            motivo: 'Revision',
            observaciones: null,
            recordatorio_enviado: false,
            recordatorio_canal: null,
            recordatorio_estado: null,
            recordatorio_at: null,
            confirmado_at: null,
            motivo_cancelacion: null,
          }]}
          presupuestos={[{
            id: 'pres-1',
            paciente_id: paciente.id,
            numero: 381,
            fecha: '2026-04-15',
            estado: 'presentado',
            pie_pagina: null,
            odontograma: {},
            doctor_id: 'doc-1',
            total: '210.00',
            total_aceptado: '150.00',
            lineas: [{
              id: 'linea-1',
              presupuesto_id: 'pres-1',
              tratamiento_id: 'trat-1',
              tratamiento: null,
              pieza_dental: 16,
              caras: 'O',
              precio_unitario: '150.00',
              descuento_porcentaje: '0',
              aceptado: true,
              pasado_trabajo_pendiente: false,
              importe_neto: '150.00',
            }, {
              id: 'linea-2',
              presupuesto_id: 'pres-1',
              tratamiento_id: 'trat-2',
              tratamiento: null,
              pieza_dental: 24,
              caras: 'M',
              precio_unitario: '60.00',
              descuento_porcentaje: '0',
              aceptado: false,
              pasado_trabajo_pendiente: false,
              importe_neto: '60.00',
            }],
          }]}
          documentos={[{
            id: 'doc-1',
            paciente_id: paciente.id,
            nombre_original: 'rx-control.pdf',
            categoria: 'radiografia',
            descripcion: 'Control',
            fecha_documento: '2026-04-20',
            created_at: '2026-04-20T10:00:00',
            tratamiento_id: null,
            doctor_id: null,
            historial_id: null,
            etiquetas: null,
            mime_type: 'application/pdf',
            tamano_bytes: 123,
          }]}
          consentimientos={[{
            id: 'cons-1',
            paciente_id: paciente.id,
            clinica_id: null,
            plantilla_id: null,
            tratamiento_id: null,
            doctor_id: null,
            historial_id: null,
            documento_id: null,
            tipo: 'Endodoncia',
            estado: 'pendiente_firma',
            fecha_firma: '2026-04-21',
            firmado_at: null,
            documento_path: null,
            plantilla_version: 'personalizada',
            version_plantilla: null,
            hash_documento: null,
            revocado: false,
            fecha_revocacion: null,
            motivo_revocacion: null,
            created_at: '2026-04-21T10:00:00',
          }]}
          laboratorio={[]}
          onEdit={noop}
          onOpenFull={noop}
          onOpenCitas={noop}
          onNuevoPresupuesto={noop}
          onCrearReceta={noop}
          onWhatsApp={noop}
          onOpenPresupuestos={noop}
          onOpenPendientes={noop}
          onOpenRealizados={noop}
          onOpenOdontogramaDetail={noop}
          onOpenFacturacion={noop}
          onOpenHistorial={noop}
          onOpenDocumentos={noop}
          onSubirDocumento={noop}
          onOpenConsentimientos={noop}
          onEmitirFactura={noop}
          onRegistrarCobro={noop}
          onHistorialFacturas={noop}
        />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText(/Gutierrez Velez/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Proxima cita/i)).toBeInTheDocument();
    expect(screen.getByText(/Ultima visita/i)).toBeInTheDocument();
    expect(screen.getByText(/Cobros \/ facturas/i)).toBeInTheDocument();
    expect(screen.getByText(/Resumen odontograma/i)).toBeInTheDocument();
    expect(screen.queryByText(/Odontograma actual/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('mini-odontogram')).toBeInTheDocument();
    expect(screen.getByTestId('mini-odontogram-pendientes')).toHaveTextContent('Pendientes: 1');
    expect(screen.getByTestId('mini-odontogram-realizados')).toHaveTextContent('Realizados: 1');
    expect(screen.getByTestId('mini-odontogram-presupuestados')).toHaveTextContent('Presupuestados: 1');
    await user.click(screen.getByRole('button', { name: /Ver detalle en Clinica/i }));
    expect(noop).toHaveBeenCalled();
    expect(screen.getByText(/Documentos y consentimientos/i)).toBeInTheDocument();
    expect(screen.getByText('rx-control.pdf')).toBeInTheDocument();
    expect(screen.getByText('Endodoncia')).toBeInTheDocument();
  });
});

describe('PatientIdentityChips', () => {
  it('no renderiza chips si no hay datos adicionales', () => {
    const { container } = render(<PatientIdentityChips paciente={paciente} />);
    expect(container.querySelector('.patient-identity-chips')).toBeNull();
  });

  it('muestra sexo, profesion, poliza y pagador distinto cuando estan presentes', () => {
    const enriched: ApiPaciente = {
      ...paciente,
      sexo: 'F',
      profesion: 'Enfermera',
      num_poliza: 'POL-123',
      pagador_distinto: true,
      fecha_primera_visita: '2025-09-01',
    };
    render(<PatientIdentityChips paciente={enriched} />);
    const list = screen.getByLabelText('Datos administrativos del paciente');
    expect(within(list).getByText('Mujer')).toBeInTheDocument();
    expect(within(list).getByText('Enfermera')).toBeInTheDocument();
    expect(within(list).getByText(/POL-123/)).toBeInTheDocument();
    expect(within(list).getByText('Pagador distinto')).toBeInTheDocument();
    expect(within(list).getByText(/1ª visita/)).toBeInTheDocument();
  });
});

describe('PatientEditModal — datos adicionales', () => {
  const doctores: Doctor[] = [
    { id: 'doc-1', nombre: 'Dra. Ruiz', color_agenda: null, activo: true },
    { id: 'doc-2', nombre: 'Dr. Soto', color_agenda: null, activo: true },
  ];

  it('renderiza la seccion colapsable de datos adicionales', async () => {
    const user = userEvent.setup();
    render(
      <PatientEditModal
        paciente={paciente}
        doctores={doctores}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const details = screen.getByTestId('patient-edit-extras') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(within(details).getByText('Datos adicionales'));
    expect(details.open).toBe(true);
    expect(screen.getByLabelText('Sexo')).toBeInTheDocument();
    expect(screen.getByLabelText('Profesión')).toBeInTheDocument();
    expect(screen.getByLabelText('Doctor habitual')).toBeInTheDocument();
    expect(screen.getByLabelText(/Número de póliza/)).toBeInTheDocument();
  });

  it('muestra campos de pagador solo si se marca el checkbox', async () => {
    const user = userEvent.setup();
    render(
      <PatientEditModal
        paciente={paciente}
        doctores={doctores}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const details = screen.getByTestId('patient-edit-extras') as HTMLDetailsElement;
    await user.click(within(details).getByText('Datos adicionales'));
    expect(screen.queryByLabelText(/Pagador — nombre/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Pagador de factura distinto/));
    expect(screen.getByLabelText(/Pagador — nombre/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pagador — DNI/)).toBeInTheDocument();
  });

  it('envia los campos nuevos al guardar', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PatientEditModal
        paciente={paciente}
        doctores={doctores}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const details = screen.getByTestId('patient-edit-extras') as HTMLDetailsElement;
    await user.click(within(details).getByText('Datos adicionales'));
    await user.selectOptions(screen.getByLabelText('Sexo'), 'F');
    await user.type(screen.getByLabelText('Profesión'), 'Diseñadora');
    await user.selectOptions(screen.getByLabelText('Doctor habitual'), 'doc-2');
    await user.type(screen.getByLabelText(/Número de póliza/), 'POL-9');
    await user.click(screen.getByRole('button', { name: /Guardar ficha/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.sexo).toBe('F');
    expect(payload.profesion).toBe('Diseñadora');
    expect(payload.doctor_habitual_id).toBe('doc-2');
    expect(payload.num_poliza).toBe('POL-9');
    expect(payload.pagador_distinto).toBe(false);
  });

  it('si pagador no es distinto, los campos de pagador se envian null', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const paciente_con_pagador: ApiPaciente = {
      ...paciente,
      pagador_distinto: true,
      pagador_nombre: 'Antiguo',
      pagador_dni: '12345678A',
      pagador_direccion: 'Calle Antigua 1',
    };
    render(
      <PatientEditModal
        paciente={paciente_con_pagador}
        doctores={doctores}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const details = screen.getByTestId('patient-edit-extras') as HTMLDetailsElement;
    await user.click(within(details).getByText('Datos adicionales'));
    await user.click(screen.getByLabelText(/Pagador de factura distinto/));
    await user.click(screen.getByRole('button', { name: /Guardar ficha/ }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.pagador_distinto).toBe(false);
    expect(payload.pagador_nombre).toBeNull();
    expect(payload.pagador_dni).toBeNull();
    expect(payload.pagador_direccion).toBeNull();
  });
});
