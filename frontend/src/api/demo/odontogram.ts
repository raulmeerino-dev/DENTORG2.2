import type {
  OdontogramaContextMode,
  OdontogramaContexto,
  OdontogramaEvento,
  OdontogramaPaciente,
} from '../types';

function demoOdontograma(pacienteId: string): OdontogramaPaciente {
  return {
    id: `demo-odon-${pacienteId}`,
    paciente_id: pacienteId,
    clinica_id: 'demo-clinica-1',
    version: 1,
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: null,
    piezas: [
      {
        id: `demo-odon-piece-${pacienteId}-24`,
        odontograma_id: `demo-odon-${pacienteId}`,
        pieza_fdi: 24,
        estado_general: 'caries',
        notas: 'Control en presupuesto',
        superficies: [
          { id: 'demo-sup-24-o', pieza_id: `demo-odon-piece-${pacienteId}-24`, superficie: 'oclusal_incisal', condicion: 'tratamiento_pendiente', tratamiento_planificado_id: 't-endo', tratamiento_realizado_id: null, color_estado: '#f59e0b', notas: 'Endodoncia propuesta' },
        ],
      },
      {
        id: `demo-odon-piece-${pacienteId}-37`,
        odontograma_id: `demo-odon-${pacienteId}`,
        pieza_fdi: 37,
        estado_general: 'implante',
        notas: null,
        superficies: [],
      },
    ],
  };
}

export async function getOdontogramaPaciente(pacienteId: string): Promise<OdontogramaPaciente> {
  return demoOdontograma(pacienteId);
}

export async function getOdontogramaContexto(pacienteId: string, mode: OdontogramaContextMode): Promise<OdontogramaContexto> {
  const fallback = demoOdontograma(pacienteId);
  const teeth = Object.fromEntries(fallback.piezas.map((pieza) => [
    String(pieza.pieza_fdi),
    {
      base: {
        estado_general: pieza.estado_general,
        movilidad: pieza.movilidad ?? null,
        pronostico: pieza.pronostico ?? null,
        notas: pieza.notas,
      },
      surfaces: Object.fromEntries(pieza.superficies.map((surface) => [
        surface.superficie,
        {
          diagnostico: surface.condicion,
          context_state: mode === 'presupuesto' ? 'incluido_presupuesto' : surface.condicion,
          tratamiento_id: surface.tratamiento_planificado_id ?? surface.tratamiento_realizado_id,
          presupuesto_linea_id: surface.presupuesto_linea_id ?? null,
          label: surface.notas,
          amount: null,
        },
      ])),
    },
  ]));
  return {
    mode,
    odontograma_id: fallback.id,
    paciente_id: pacienteId,
    denticion: fallback.denticion ?? 'adulta',
    teeth,
  };
}

export async function getOdontogramaHistorial(): Promise<OdontogramaEvento[]> {
  return [];
}
