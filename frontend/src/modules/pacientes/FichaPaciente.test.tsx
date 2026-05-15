import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente } from '../../types/api';
import { PatientForm } from './FichaPaciente';

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
  it('renders a compact patient summary with next visit, last visit and balance', () => {
    const queryClient = new QueryClient();
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
            pieza_dental: null,
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
          presupuestos={[]}
          documentos={[]}
          consentimientos={[]}
          laboratorio={[]}
          onEdit={noop}
          onOpenFull={noop}
          onOpenCitas={noop}
          onOpenPresupuestos={noop}
          onOpenPendientes={noop}
          onOpenRealizados={noop}
          onOpenFacturacion={noop}
          onOpenHistorial={noop}
          onOpenDocumentos={noop}
          onOpenConsentimientos={noop}
          onOpenLaboratorio={noop}
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
  });
});
