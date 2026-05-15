import { describe, expect, it } from 'vitest';
import type { OdontogramaContexto } from '../../../types/api';
import { buildOdontogramaViewModel, getSurfaceColor, getToothColor } from './viewModel';

const contexto: OdontogramaContexto = {
  mode: 'presupuesto',
  odontograma_id: 'odo-1',
  paciente_id: 'pac-1',
  denticion: 'adulta',
  teeth: {
    '16': {
      base: {
        estado_general: 'caries',
        notas: 'Caries distal',
      },
      surfaces: {
        oclusal_incisal: {
          diagnostico: 'caries',
          context_state: 'incluido_presupuesto',
          tratamiento_id: 'trat-1',
          presupuesto_linea_id: 'linea-1',
          label: 'Obturacion composite',
          amount: '65.00',
        },
      },
    },
  },
};

describe('buildOdontogramaViewModel', () => {
  it('prioriza la capa de presupuesto cuando el modo es presupuesto', () => {
    const viewModel = buildOdontogramaViewModel(contexto, 'presupuesto');
    const pieza16 = viewModel.find((tooth) => tooth.number === '16');

    expect(pieza16?.status).toBe('caries');
    expect(pieza16?.surfaces.occlusal).toBe('pending');
    expect(pieza16?.contextLabel).toBe('Obturacion composite');
    expect(pieza16?.plannedTreatments?.[0].price).toBe(65);
  });

  it('oculta pendientes como color principal en lectura', () => {
    const viewModel = buildOdontogramaViewModel(contexto, 'presupuesto');
    const pieza16 = viewModel.find((tooth) => tooth.number === '16');

    expect(pieza16).toBeDefined();
    expect(getToothColor(pieza16!, 'lectura')).toBe(getSurfaceColor(undefined, 'lectura'));
  });

  it('trata estados presupuestado y aceptado como pendientes visuales por contexto', () => {
    const presupuesto = buildOdontogramaViewModel({
      ...contexto,
      teeth: {
        '16': {
          base: { estado_general: 'sano' },
          surfaces: {
            distal: { diagnostico: 'tratamiento_presupuestado', context_state: 'tratamiento_presupuestado' },
            mesial: { diagnostico: 'tratamiento_aceptado', context_state: 'tratamiento_aceptado' },
          },
        },
      },
    }, 'presupuesto');
    const pieza16 = presupuesto.find((tooth) => tooth.number === '16');

    expect(pieza16?.surfaces.distal).toBe('pending');
    expect(pieza16?.surfaces.mesial).toBe('pending');
  });
});
