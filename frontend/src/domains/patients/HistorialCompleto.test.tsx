import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { render,screen,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe,expect,it,vi } from 'vitest';
import type { ApiPaciente,Cita,Consentimiento,Cobro,DocumentoPaciente,Factura,HistorialClinico,NotaDental,PagoAnticipadoPaciente,Presupuesto } from '../../api/types';
import { HistorialCompletoPanel } from './HistorialCompleto';
import type { PatientAccount } from '../../api/accounts';

const receiptApi = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../api/billing', () => ({ openPaymentReceipt: receiptApi.open }));

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
        canManageBilling={true}
        historial={[]}
        citas={[]}
        presupuestos={[]}
        facturas={[factura]}
        anticipos={[anticipo]}
        documentos={[]}
        consentimientos={[]}
        notasDentales={[]}
        onOpenDocumento={vi.fn()}
        onOpenConsentimiento={vi.fn()}
        onOpenFactura={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

describe('Historial general tabular', () => {
  const account: PatientAccount = {
    paciente_id: paciente.id, paciente_nombre: 'Ana Lopez', version: 'v1',
    total_cargos: '150', total_cobrado: '50', pendiente_cargos: '100', saldo_favor: '0',
    saldo: '100', realizado_hoy: '150', saldo_anterior: '0', sin_valorar: 0,
    cita_id: null, doctor_id: null, gabinete_id: null, pendiente_salida: false,
    cargos: [{ id: 'charge', historial_id: historialPieza.id, factura_id: null,
      cita_id: null, doctor_id: 'doc-1', concepto: 'Endodoncia', fecha: '2026-04-16',
      pieza_dental: 16, caras: 'O', importe: '150', cobrado: '50', pendiente: '100',
      motivo_cero: null, origen: 'tratamiento' }],
    movimientos: [{ id: cobro.id, tipo: 'cobro', fecha: '2026-04-16', importe: '50',
      forma_pago: 'Tarjeta', aplicado: '50', anulado: false, factura_id: null,
      notas: 'Pago sin factura previa' }],
  };
  it('abre el pago sin factura enlazado desde Registros y su recibo', async () => {
    renderHistorial({ account, facturas: [], anticipos: [], focusedRecordId: cobro.id });
    const detail = screen.getByRole('region', { name: 'Detalle de cobro' });
    expect(detail).toHaveTextContent('Pago sin factura previa');
    expect(detail).toHaveTextContent('Sin factura asociada');
    await userEvent.click(within(detail).getByRole('button', { name: 'Abrir recibo' }));
    expect(receiptApi.open).toHaveBeenCalledWith(cobro.id);
  });
  it('muestra las aplicaciones reales de un tratamiento todavía sin facturar', () => {
    renderHistorial({ account, historial: [historialPieza], facturas: [], anticipos: [] });
    const row = screen.getByRole('button', { name: /Ver detalle: Tratamiento/ }).closest('tr')!;
    expect(row).toHaveTextContent('Sin facturar150,0050,00100,00');
  });
  it.each(['facturado', 'cobrado_parcial', 'cobrado_completo'])('conserva el tratamiento realizado con estado económico heredado %s', (estado) => {
    renderHistorial({ account, historial: [{ ...historialPieza, estado, factura_id: factura.id }] });
    const row = screen.getByRole('button', { name: /Ver detalle: Tratamiento/ }).closest('tr')!;
    expect(row).toHaveTextContent('Realizado');
    expect(row).toHaveTextContent('150,0050,00100,00');
  });
  it('un pago aplicado a dos facturas conserva una sola entrada por el importe recibido', async () => {
    renderHistorial({ account, anticipos: [], facturas: [factura, { ...factura, id: 'fac-2', numero: 101 }] });
    await userEvent.click(screen.getByRole('button', { name: 'Cobros' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('50,0050,00');
    await userEvent.click(within(rows[1]).getByRole('button', { name: /Ver detalle/ }));
    expect(screen.getByRole('button', { name: 'Abrir factura A/100' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir factura A/101' })).toBeInTheDocument();
  });
  it('no muestra los pagos ni las aplicaciones de cargos a un perfil clínico', () => {
    renderHistorial({ account, historial: [historialPieza], canManageBilling: false });
    expect(screen.queryByText('Tarjeta')).not.toBeInTheDocument();
    expect(screen.queryByText('50,00')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cobros' })).not.toBeInTheDocument();
  });
  it('muestra una fila por registro sin repetir eventos de odontograma', () => {
    renderHistorial({ historial: [historialPieza], notasDentales: [notaPieza] });
    const table = screen.getByRole('table', { name: 'Cronología del paciente' });
    expect(within(table).getAllByRole('row')).toHaveLength(5); // cabecera + tratamiento, factura, cobro y anticipo
    expect(screen.queryByRole('button', { name: 'Odontograma' })).not.toBeInTheDocument();
    expect(screen.queryByText('Conductos permeables')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Profesional' })).toBeInTheDocument();
  });
  it('filtra cobros y anticipos sin inventar saldo por movimiento', async () => {
    renderHistorial();
    await userEvent.click(screen.getByRole('button', { name: 'Cobros' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('120,00');
    expect(rows[0].lastElementChild).toHaveTextContent('—');
    expect(screen.getByText('Senial implante')).toBeInTheDocument();
  });
  it('muestra el cobrado y saldo de factura reales, sin repartirlos entre tratamientos', async () => {
    renderHistorial({ historial: [{ ...historialPieza, factura_id: factura.id }] });
    const treatment = screen.getByRole('button', { name: /Ver detalle: Tratamiento/ }).closest('tr')!;
    expect(treatment).toHaveTextContent('150,00');
    expect(treatment).not.toHaveTextContent('120,00');
    expect(treatment).not.toHaveTextContent('80,00');
    await userEvent.click(screen.getByRole('button', { name: 'Facturación' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('200,00120,0080,00');
  });
  it('conserva importes y motivo del cobro anulado con efectivo cero', async () => {
    renderHistorial({ facturas: [{ ...factura, cobros: [{ ...cobro, anulado_at: '2026-04-13T08:00:00Z', motivo_anulacion: 'Error de importe' }] }], anticipos: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Cobros' }));
    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Anulado');
    expect(row).toHaveTextContent('120,000,00');
    await userEvent.click(within(row).getByRole('button', { name: /Ver detalle/ }));
    expect(screen.getByRole('region', { name: 'Detalle de cobro' })).toHaveTextContent('Error de importe');
  });
  it('busca por notas, pieza, profesional y factura sin exigir tildes', async () => {
    renderHistorial({ historial: [{ ...historialPieza, factura_id: factura.id }], documentos: [documentoPieza] });
    const input = screen.getByRole('searchbox', { name: 'Buscar en el historial' });
    await userEvent.type(input, 'conductos pieza 16 ruiz a/100');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Endodoncia')).toBeInTheDocument();
    await userEvent.clear(input); await userEvent.type(input, 'rx-pieza');
    expect(screen.queryByText('rx-pieza-16.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Endodoncia')).not.toBeInTheDocument();
  });
  it('abre el detalle con teclado y conserva documentos vinculados', async () => {
    const openDocument = vi.fn();
    renderHistorial({ historial: [historialPieza], documentos: [documentoPieza], notasDentales: [notaPieza], onOpenDocumento: openDocument });
    const expand = screen.getByRole('button', { name: /Ver detalle: Tratamiento/ });
    expand.focus(); await userEvent.keyboard('{Enter}');
    expect(expand).toHaveAttribute('aria-expanded', 'true');
    const detail = screen.getByRole('region', { name: 'Detalle de tratamiento' });
    expect(detail).toHaveTextContent('Conductos permeables');
    expect(detail).toHaveTextContent('Caries profunda');
    await userEvent.click(within(detail).getByRole('button', { name: 'Documento · rx-pieza-16.pdf' }));
    expect(openDocument).toHaveBeenCalledWith(documentoPieza);
    await userEvent.click(expand);
    expect(screen.queryByRole('region', { name: 'Detalle de tratamiento' })).not.toBeInTheDocument();
  });
  it('abre el presupuesto real desde el detalle', async () => {
    const open = vi.fn();
    renderHistorial({ historial: [{ ...historialPieza, presupuesto_linea_id: 'linea-16' }], presupuestos: [presupuestoPieza], onOpenPresupuesto: open });
    await userEvent.click(screen.getByRole('button', { name: /Ver detalle: Tratamiento/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir presupuesto #12' }));
    expect(open).toHaveBeenCalledWith(presupuestoPieza);
  });
  it('muestra una nota vinculada completa sin duplicarla en su propio detalle', async () => {
    renderHistorial({ historial: [historialPieza], notasDentales: [{ ...notaPieza, historial_id: historialPieza.id }] });
    await userEvent.click(screen.getByRole('button', { name: /Ver detalle: Tratamiento/ }));
    const detail = screen.getByRole('region', { name: 'Detalle de tratamiento' });
    expect(detail.textContent?.split(notaPieza.texto)).toHaveLength(2);
  });
  it('excluye planificación, documentación y cambios internos de la tabla y sus filtros', () => {
    renderHistorial({ presupuestos: [presupuestoPieza], documentos: [documentoPieza], consentimientos: [{ id: 'cons-1', tipo: 'Consentimiento firmado', estado: 'firmado', fecha_firma: '2026-04-18' } as Consentimiento],
      notasDentales: [notaPieza], historial: [{ ...historialPieza, estado: 'pendiente' }] });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
    for (const name of ['Documentos', 'Consentimientos', 'Presupuestos', 'Odontograma', 'Citas']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByText('Ibuprofeno 600')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Otros tipos de evento' })).not.toBeInTheDocument();
  });
  it('no expone columnas, movimientos, importes ni referencias económicas sin permiso', async () => {
    renderHistorial({ canManageBilling: false, initialFilter: 'facturacion', historial: [{ ...historialPieza, factura_id: factura.id }], presupuestos: [presupuestoPieza] });
    expect(screen.queryByRole('columnheader', { name: 'Factura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Importe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cobros' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ver detalle: Tratamiento/ }));
    expect(screen.queryByText('150,00')).not.toBeInTheDocument();
    expect(screen.queryByText('A/100')).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), 'a/100');
    expect(screen.getByText('No hay actos clínicos o movimientos económicos que coincidan con estos filtros.')).toBeInTheDocument();
  });
  it('permite invertir el orden cronológico', async () => {
    renderHistorial();
    expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('12-04-26');
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar de más antiguo a más reciente' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('08-04-26');
  });
  it('filtra por pieza sin abrir un odontograma general', async () => {
    renderHistorial({ historial: [historialPieza], documentos: [documentoPieza] });
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Pieza' }), '16');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2); // solo el tratamiento realizado
    expect(screen.queryByLabelText('Odontograma interactivo')).not.toBeInTheDocument();
  });
  it('pagina historias extensas y busca también fuera de la página visible', async () => {
    renderHistorial({ historial: Array.from({ length: 120 }, (_, i) => ({ ...historialPieza, id: `hist-${i}`, procedimiento: `Tratamiento ${i}`, observaciones: `Observación ${i}` })) });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(51);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('51–100 de 123 · Importes en €')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), 'Tratamiento 119');
    expect(screen.getByText('Tratamiento 119')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  });
  it('solo incluye visitas con actos o notas clínicas, nunca citas futuras, canceladas ni administrativas', async () => {
    const base = { id: 'visit-1', paciente_id: paciente.id, fecha_hora: '2024-01-01T10:00:00Z', doctor_id: 'doc-1', motivo: 'Revisión clínica', duracion_min: 30, estado: 'atendida' } as Cita;
    renderHistorial({ citas: [base, { ...base, id: 'administrativa', motivo: 'Entrega de justificante', observaciones: 'Recoger copia' }, { ...base, id: 'futura', fecha_hora: '2099-01-01T10:00:00Z' }, { ...base, id: 'cancelada', estado: 'cancelada' }, { ...base, id: 'nota', motivo: 'Control clínico' }],
      historial: ['visit-1', 'futura', 'cancelada'].map((id) => ({ ...historialPieza, id: `t-${id}`, cita_id: id })),
      notasDentales: [{ ...notaPieza, cita_id: 'nota', origen: 'manual' }] });
    await userEvent.click(screen.getByRole('button', { name: 'Visitas clínicas' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(screen.queryByText('Entrega de justificante')).not.toBeInTheDocument();
    expect(screen.getByText('Control clínico')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ver detalle: Visita clínica · Control/ }));
    expect(screen.getByRole('region', { name: 'Detalle de visita clínica' })).toHaveTextContent(notaPieza.texto);
  });
  it('distingue rectificación, cobro anulado y factura anulada sin crear deuda ficticia', async () => {
    renderHistorial({ facturas: [{ ...factura, es_rectificativa: true, factura_rectificada_id: 'original', total: '-20', pendiente: '-20', total_cobrado: '0', cobros: [] }, { ...factura, id: 'void', numero: 101, estado: 'anulada', cobros: [] }, { ...factura, id: 'draft', estado: 'borrador', numero: 102, cobros: [] }] });
    await userEvent.click(screen.getByRole('button', { name: 'Facturación' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows.some(row => row.textContent?.includes('Rectificativa'))).toBe(true);
    const annulled = rows.find(row => row.textContent?.includes('Anulada'))!;
    expect(annulled.lastElementChild).toHaveTextContent('0,00');
  });
  it.each([['80', 'Deuda actual'], ['0', 'Saldo actual'], ['-40', 'A favor']])('muestra saldo contable %s con etiqueta %s sin depender de filtros', async (pending, label) => {
    renderHistorial({ saldo: { paciente_id: paciente.id, total_facturado: '200', total_cobrado: String(200 - Number(pending)), pendiente: pending, facturas_pendientes: 1 } });
    const summary = screen.getByLabelText('Saldo actual del paciente');
    expect(summary).toHaveTextContent(label);
    await userEvent.type(screen.getByRole('searchbox'), 'sin coincidencias');
    expect(summary).toHaveTextContent(label);
    expect(summary).toHaveTextContent('200,00');
  });

});
