import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, Cobro, DocumentoPaciente, Factura, HistorialClinico, NotaDental, PagoAnticipadoPaciente, Presupuesto, RecetaClinica, TrabajoLaboratorio } from '../../types/api';
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
  plantilla_id: null,
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
  prescriptor_nombre: null,
  prescriptor_num_colegiado: null,
  prescriptor_colegio: null,
  prescriptor_provincia: null,
  prescriptor_especialidad: null,
  prescriptor_nif: null,
  fecha_prescripcion: '2026-04-05',
  fecha_dispensacion: null,
  estado: 'emitida_local',
  provider_mode: 'disabled',
  external_id: null,
  provider_status: null,
  provider_error: null,
  verification_code: null,
  pdf_documento_id: null,
  pdf_path: null,
  pdf_hash_sha256: null,
  firma_data_url: null,
  pdf_generado_at: null,
  emitida_at: null,
  enviada_proveedor_at: null,
  certificada_at: null,
  rechazada_at: null,
  anulada_at: null,
  dispensada_at: null,
  certificada_real: false,
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

const historialPieza: HistorialClinico = {
  id: 'hist-16',
  paciente_id: paciente.id,
  tratamiento_id: 'trat-endo',
  doctor_id: 'doc-1',
  gabinete_id: null,
  pieza_dental: 16,
  caras: 'O',
  fecha: '2026-04-16',
  diagnostico: 'Caries profunda',
  procedimiento: 'Endodoncia',
  observaciones: 'Conductos permeables',
  estado: 'realizado',
  importe: '150.00',
  factura_id: null,
  tratamiento: { id: 'trat-endo', nombre: 'Endodoncia', codigo: 'EN' },
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
};

const presupuestoPieza: Presupuesto = {
  id: 'pres-1',
  paciente_id: paciente.id,
  numero: 12,
  fecha: '2026-04-14',
  estado: 'aceptado',
  pie_pagina: null,
  odontograma: { version: 1, teeth: {} },
  doctor_id: 'doc-1',
  lineas: [{
    id: 'linea-16',
    presupuesto_id: 'pres-1',
    tratamiento_id: 'trat-corona',
    tratamiento: { id: 'trat-corona', nombre: 'Corona zirconio', codigo: 'PF' },
    pieza_dental: 16,
    caras: null,
    precio_unitario: '300.00',
    descuento_porcentaje: '0.00',
    aceptado: true,
    pasado_trabajo_pendiente: false,
    importe_neto: '300.00',
  }],
  total: '300.00',
  total_aceptado: '300.00',
};

const notaPieza: NotaDental = {
  id: 'nota-16',
  paciente_id: paciente.id,
  pieza_dental: 16,
  caras: 'O',
  texto: 'Control radiografico en 6 meses',
  fecha: '2026-04-17',
  doctor_id: 'doc-1',
  cita_id: null,
  historial_id: null,
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
};

const documentoPieza: DocumentoPaciente = {
  id: 'doc-16',
  paciente_id: paciente.id,
  nombre_original: 'rx-pieza-16.pdf',
  mime_type: 'application/pdf',
  tamano_bytes: 100,
  categoria: 'radiografia',
  descripcion: 'RX pieza 16',
  fecha_documento: '2026-04-17',
  tratamiento_id: null,
  historial_id: historialPieza.id,
  doctor_id: 'doc-1',
  etiquetas: 'endo',
  created_at: '2026-04-17T10:00:00',
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
        notasDentales={[]}
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

  it('muestra una lectura de historial por pieza con realizados, pendientes, notas y documentos', () => {
    renderHistorial({
      historial: [historialPieza],
      presupuestos: [presupuestoPieza],
      documentos: [documentoPieza],
      notasDentales: [notaPieza],
    });

    expect(screen.getAllByRole('button', { name: '16' }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Historial de pieza 16')).toBeInTheDocument();
    expect(screen.getAllByText('Endodoncia').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corona zirconio').length).toBeGreaterThan(0);
    expect(screen.getByText('Control radiografico en 6 meses')).toBeInTheDocument();
    expect(screen.getAllByText('RX pieza 16').length).toBeGreaterThan(0);
  });
});
