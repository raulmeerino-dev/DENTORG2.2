import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPaciente, HistorialClinico, NotaDental, NotaDentalCreateInput, Presupuesto, TratamientoCatalogo } from '../../types/api';
import { ClinicalWorkspace } from './ClinicalWorkspace';

vi.mock('../odontogram', () => ({
  PatientOdontogramFlow: () => <div data-testid="odontogram-flow" />,
  mapSurfaceToCaras: () => 'O',
}));

const paciente: ApiPaciente = {
  id: 'pac-1',
  num_historial: 91312,
  nombre: 'Cesar',
  apellidos: 'Gutierrez Velez',
  fecha_nacimiento: null,
  telefono: '+34 600 123 456',
  activo: true,
  observaciones: null,
  datos_salud: {},
};

const tratamiento: TratamientoCatalogo = {
  id: 'trat-1',
  familia_id: 'fam-1',
  familia: null,
  codigo: 'TR001',
  nombre: 'Corona zirconio',
  precio: '320.00',
  iva_porcentaje: '0',
  requiere_pieza: true,
  requiere_caras: true,
  activo: true,
};

const presupuesto: Presupuesto = {
  id: 'pres-1',
  paciente_id: paciente.id,
  numero: 12,
  fecha: '2026-05-20',
  estado: 'aceptado',
  pie_pagina: null,
  odontograma: { teeth: {} },
  doctor_id: 'doc-1',
  total: '320.00',
  total_aceptado: '320.00',
  lineas: [{
    id: 'lin-1',
    presupuesto_id: 'pres-1',
    tratamiento_id: tratamiento.id,
    tratamiento: { id: tratamiento.id, nombre: tratamiento.nombre, codigo: tratamiento.codigo },
    pieza_dental: 16,
    caras: 'MOD',
    precio_unitario: '320.00',
    descuento_porcentaje: '0',
    aceptado: true,
    pasado_trabajo_pendiente: true,
    importe_neto: '320.00',
  }],
};

function renderClinical(
  onFinalizar = vi.fn(async () => ({
  id: 'hist-1',
  paciente_id: paciente.id,
  tratamiento_id: tratamiento.id,
  doctor_id: 'doc-1',
  gabinete_id: null,
  pieza_dental: 16,
  caras: 'MOD',
  fecha: '2026-05-20',
  diagnostico: null,
  procedimiento: tratamiento.nombre,
  observaciones: 'Preparacion y provisional colocado',
  estado: 'realizado',
  importe: '320.00',
  factura_id: null,
  origen: 'presupuesto_linea',
  presupuesto_linea_id: 'lin-1',
  cita_id: null,
  tratamiento: { id: tratamiento.id, nombre: tratamiento.nombre, codigo: tratamiento.codigo },
  doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
} as HistorialClinico)),
  onCreateNotaDental = vi.fn(async (data: NotaDentalCreateInput) => ({
    id: 'nota-1',
    ...data,
    fecha: data.fecha ?? '2026-05-20',
    doctor_id: data.doctor_id ?? null,
    cita_id: data.cita_id ?? null,
    historial_id: data.historial_id ?? null,
    caras: data.caras ?? null,
    doctor: { id: 'doc-1', nombre: 'Dra. Ruiz' },
  } as NotaDental)),
) {
  render(
    <ClinicalWorkspace
      activeTab="sesion"
      onTabChange={vi.fn()}
      paciente={paciente}
      citas={[]}
      historial={[]}
      presupuestos={[presupuesto]}
      documentos={[]}
      consentimientos={[]}
      recetas={[]}
      notasDentales={[]}
      plantillas={[]}
      laboratorio={[]}
      saldoPendiente={0}
      doctorId="doc-1"
      tratamientos={[tratamiento]}
      savingPrimeraVisita={false}
      onSavePrimeraVisita={vi.fn()}
      onDarCita={vi.fn()}
      onContextLinea={vi.fn()}
      onCrearPedidoLab={vi.fn()}
      onCrearPedidoLabGeneral={vi.fn()}
      onActualizarTrabajoLab={vi.fn()}
      onCrearReceta={vi.fn()}
      onOpenConsentimiento={vi.fn()}
      onOpenConsentimientoPdf={vi.fn()}
      onRevocarConsentimiento={vi.fn()}
      onOpenDocumentos={vi.fn()}
      onOpenHistorial={vi.fn()}
      onFinalizarTratamientoSesion={onFinalizar}
      onCreateNotaDental={onCreateNotaDental}
      userRole="admin"
    />,
  );
  return { onFinalizar, onCreateNotaDental };
}

describe('ClinicalWorkspace sesion actual', () => {
  it('finaliza un pendiente aceptado guardando observacion, pieza/caras y vinculo a presupuesto_linea', async () => {
    const user = userEvent.setup();
    const { onFinalizar } = renderClinical();

    expect((await screen.findAllByText('Corona zirconio')).length).toBeGreaterThan(0);
    await user.clear(screen.getByLabelText(/Observacion clinica del tratamiento/i));
    await user.type(screen.getByLabelText(/Observacion clinica del tratamiento/i), 'Preparacion y provisional colocado');
    await user.click(screen.getByRole('button', { name: /Finalizar como realizado/i }));

    await waitFor(() => expect(onFinalizar).toHaveBeenCalledTimes(1));
    expect(onFinalizar).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: paciente.id,
      tratamiento_id: tratamiento.id,
      doctor_id: 'doc-1',
      presupuesto_linea_id: 'lin-1',
      pieza_dental: 16,
      caras: 'MOD',
      observaciones: 'Preparacion y provisional colocado',
      origen: 'presupuesto_linea',
    }));
    expect(await screen.findByText('En historial')).toBeInTheDocument();
  });

  it('guarda nota rapida asociada a pieza/caras sin usar observacion general del paciente', async () => {
    const user = userEvent.setup();
    const { onCreateNotaDental } = renderClinical();

    await user.type(await screen.findByLabelText(/Nota rapida de pieza/i), 'Sangrado leve en distal');
    await user.click(screen.getByRole('button', { name: /Guardar nota de pieza/i }));

    await waitFor(() => expect(onCreateNotaDental).toHaveBeenCalledTimes(1));
    expect(onCreateNotaDental).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: paciente.id,
      pieza_dental: 16,
      caras: 'MOD',
      texto: 'Sangrado leve en distal',
      doctor_id: 'doc-1',
    }));
  });
});
