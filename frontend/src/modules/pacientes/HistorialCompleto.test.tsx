import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Cobro, Factura, PagoAnticipadoPaciente, RecetaClinica, TrabajoLaboratorio } from '../../types/api';
import { HistorialCompletoPanel } from './HistorialCompleto';

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 1,
  nombre: 'Ana',
  apellidos: 'Lopez',
  fecha_nacimiento: null,
  telefono: null,
  activo: true,
};

const cobro: Cobro = {
  id: 'cob-1',
  fecha: '2026-04-12',
  importe: '120.00',
  forma_pago_id: 'fp-1',
  notas: 'Pago parcial',
  anulado_at: null,
  motivo_anulacion: null,
};

const factura: Factura = {
  id: 'fac-1',
  paciente_id: paciente.id,
  serie: 'A',
  numero: 100,
  fecha: '2026-04-10',
  estado: 'cobrado_parcial',
  subtotal: '200',
  iva_total: '0',
  total: '200',
  huella: null,
  num_registro: null,
  estado_verifactu: null,
  lineas: [],
  cobros: [cobro],
  total_cobrado: '120',
  pendiente: '80',
};

const anticipo: PagoAnticipadoPaciente = {
  id: 'ant-1',
  paciente_id: paciente.id,
  fecha: '2026-04-08',
  importe: '50.00',
  forma_pago_id: 'fp-1',
  usuario_id: 'u-1',
  concepto: 'Senial implante',
  notas: null,
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
};

const receta: RecetaClinica = {
  id: 'rec-1',
  paciente_id: paciente.id,
  doctor_id: 'doc-1',
  clinica_id: null,
  medicamento: 'Ibuprofeno 600',
  principio_activo: null,
  forma_farmaceutica: null,
  via_administracion: null,
  unidades: null,
  duracion: null,
  posologia: '1 cada 8h',
  pauta: null,
  diagnostico: null,
  instrucciones_paciente: null,
  instrucciones_farmacia: null,
  fecha_prescripcion: '2026-04-05',
  fecha_dispensacion: null,
  firma_data_url: null,
  pdf_generado_at: null,
  created_at: '2026-04-05T10:00:00',
};

const trabajoLab: TrabajoLaboratorio = {
  id: 'lab-1',
  paciente_id: paciente.id,
  doctor_id: 'doc-1',
  laboratorio_id: 'l-1',
  historial_id: null,
  descripcion: 'Corona zirconio',
  pieza_dental: 16,
  color: null,
  observaciones: null,
  fecha_salida: '2026-04-03',
  fecha_entrega_prevista: '2026-04-15',
  fecha_recepcion: null,
  fecha_entrega_paciente: null,
  estado: 'enviado',
  precio: null,
  numero_orden: 5,
  paciente: null,
  doctor: null,
  laboratorio: null,
};

function renderHistorial(overrides: Partial<Parameters<typeof HistorialCompletoPanel>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HistorialCompletoPanel
        paciente={paciente}
        historial={[]}
        citas={[]}
        presupuestos={[]}
        facturas={[factura]}
        anticipos={[anticipo]}
        documentos={[]}
        consentimientos={[]}
        recetas={[receta]}
        laboratorio={[trabajoLab]}
        onOpenDocumento={vi.fn()}
        onOpenConsentimiento={vi.fn()}
        onOpenFactura={vi.fn()}
        onOpenReceta={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe('HistorialCompletoPanel filtros', () => {
  it('muestra el filtro Cobros, Recetas y Laboratorio', () => {
    renderHistorial();
    expect(screen.getByRole('button', { name: 'Cobros' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recetas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Laboratorio' })).toBeInTheDocument();
  });

  it('filtro Cobros muestra cobros + anticipos y oculta facturas', async () => {
    const user = userEvent.setup();
    renderHistorial();
    await user.click(screen.getByRole('button', { name: 'Cobros' }));
    expect(screen.getByText('A/100')).toBeInTheDocument(); // titulo del cobro = serie/numero
    expect(screen.getByText('Senial implante')).toBeInTheDocument();
    expect(screen.queryByText('Factura')).toBeNull();
  });

  it('filtro Facturacion muestra solo facturas (no cobros)', async () => {
    const user = userEvent.setup();
    renderHistorial();
    await user.click(screen.getByRole('button', { name: 'Facturacion' }));
    expect(screen.getByText('Factura')).toBeInTheDocument();
    expect(screen.queryByText('Cobro')).toBeNull();
    expect(screen.queryByText('Anticipo')).toBeNull();
  });

  it('filtro Recetas muestra eventos de recetas', async () => {
    const user = userEvent.setup();
    renderHistorial();
    await user.click(screen.getByRole('button', { name: 'Recetas' }));
    expect(screen.getByText('Ibuprofeno 600')).toBeInTheDocument();
    expect(screen.queryByText('Corona zirconio')).toBeNull();
  });

  it('filtro Laboratorio muestra trabajos con numero de orden', async () => {
    const user = userEvent.setup();
    renderHistorial();
    await user.click(screen.getByRole('button', { name: 'Laboratorio' }));
    expect(screen.getByText('Corona zirconio')).toBeInTheDocument();
    expect(screen.getByText(/Nº 5/)).toBeInTheDocument();
  });

  it('filtro Todo incluye cobros, recetas y laboratorio', () => {
    renderHistorial();
    // Por defecto el filtro es 'todo'
    expect(screen.getByText('Ibuprofeno 600')).toBeInTheDocument();
    expect(screen.getByText('Corona zirconio')).toBeInTheDocument();
    expect(screen.getByText('Senial implante')).toBeInTheDocument();
  });

  it('cobro anulado muestra etiqueta Cobro anulado', async () => {
    const user = userEvent.setup();
    const facturaAnulada: Factura = {
      ...factura,
      cobros: [{
        ...cobro,
        anulado_at: '2026-04-13T08:00:00',
        motivo_anulacion: 'Error de importe',
      }],
    };
    renderHistorial({ facturas: [facturaAnulada], anticipos: [] });
    await user.click(screen.getByRole('button', { name: 'Cobros' }));
    expect(screen.getByText('Cobro anulado')).toBeInTheDocument();
  });
});
