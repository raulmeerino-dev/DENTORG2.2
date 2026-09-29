import { describe, expect, it } from 'vitest';
import { readableHealthItems } from './healthDisplay';

describe('Resumen de salud', () => {
  it('conserva antecedentes legibles y reserva valoraciones estructuradas para Diagnóstico', () => {
    expect(readableHealthItems({ alergias: ['Penicilina', 'Látex'], anticoagulantes: false, primera_visita: { motivo: 'Consulta' }, valoraciones: [{ motivo: 'Revisión' }], temporal: true }))
      .toEqual([{ key: 'alergias', label: 'Alergias', value: 'Penicilina, Látex' }, { key: 'anticoagulantes', label: 'Anticoagulantes', value: 'No' }]);
  });
});
