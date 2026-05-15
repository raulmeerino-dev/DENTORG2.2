import { describe, expect, it } from 'vitest';
import type { Presupuesto } from '../../../types/api';
import { hasBudgetLineForSelection } from './budgetAdapter';
import type { Treatment } from '../types/odontogram.types';

const presupuesto = {
  id: 'pres-1',
  clinica_id: null,
  paciente_id: 'pac-1',
  numero: 1,
  fecha: '2026-05-08',
  estado: 'borrador',
  pie_pagina: null,
  odontograma: {},
  doctor_id: 'doc-1',
  total: '65.00',
  total_aceptado: '0.00',
  lineas: [
    {
      id: 'line-1',
      presupuesto_id: 'pres-1',
      tratamiento_id: 'trat-1',
      tratamiento: { id: 'trat-1', nombre: 'Obturacion composite', codigo: 'OB001' },
      pieza_dental: 16,
      caras: 'O',
      precio_unitario: '65.00',
      descuento_porcentaje: '0',
      aceptado: false,
      pasado_trabajo_pendiente: false,
      importe_neto: '65.00',
    },
  ],
} satisfies Presupuesto;

const treatment: Treatment = {
  id: 'trat-1',
  name: 'Obturacion composite',
  status: 'planned',
  targetScope: 'surface',
  price: 65,
  toothNumbers: ['16'],
};

describe('budgetAdapter', () => {
  it('detecta lineas duplicadas de la misma pieza/superficie/tratamiento', () => {
    expect(hasBudgetLineForSelection(presupuesto, treatment, { toothNumber: '16', surface: 'occlusal' })).toBe(true);
    expect(hasBudgetLineForSelection(presupuesto, treatment, { toothNumber: '16', surface: 'distal' })).toBe(false);
  });
});
