import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Cita, HistorialClinico } from '../../../api/types';
import { VisitDetail } from './VisitDetail';

const cita = { id: 'visit-a', fecha_hora: '2026-09-24T10:00:00Z', motivo: 'Revisión', estado: 'atendida', doctor: { nombre: 'Dra. Ana' } } as Cita;
const treatment = { id: 't1', cita_id: 'visit-a', fecha: '2026-09-24', pieza_dental: 16, caras: 'O', procedimiento: 'Obturación', estado: 'realizado' } as HistorialClinico;
function show(historial: HistorialClinico[]) {
  return render(<VisitDetail cita={cita} historial={historial} notas={[]} documentos={[]} consentimientos={[]} recetas={[]} onClose={vi.fn()} onOpenDocumento={vi.fn()} onOpenConsentimiento={vi.fn()} />);
}
describe('VisitDetail', () => {
  it('muestra piezas sólo a partir de registros vinculados a la cita', () => {
    show([treatment]);
    expect(screen.getByRole('region', { name: 'Información odontológica de la visita' })).toHaveTextContent('Pieza 16');
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Odontograma interactivo' })).not.toBeInTheDocument();
  });
  it('no atribuye a una visita el odontograma ni tratamientos de otra cita del mismo día', () => {
    show([{ ...treatment, cita_id: 'visit-b' }]);
    expect(screen.queryByRole('region', { name: 'Información odontológica de la visita' })).not.toBeInTheDocument();
    expect(screen.queryByText('Obturación')).not.toBeInTheDocument();
  });
  it('identifica explícitamente los registros sin vínculo que coinciden en fecha', () => {
    show([{ ...treatment, cita_id: null }]);
    expect(screen.getByText('Obturación')).toBeInTheDocument();
    expect(screen.getByText('Coincidencia de fecha; no implica vinculación con esta visita.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Información odontológica de la visita' })).not.toBeInTheDocument();
  });
});
