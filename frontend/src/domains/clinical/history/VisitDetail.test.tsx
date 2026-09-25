import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Cita, HistorialClinico } from '../../../api/types';
import { VisitDetail } from './VisitDetail';

const cita = { id: 'visit-a', fecha_hora: '2026-09-24T10:00:00Z', motivo: 'Revisión', estado: 'atendida', doctor: { nombre: 'Dra. Ana' } } as Cita;
const treatment = { id: 't1', tratamiento_id: 'catalog-1', cita_id: 'visit-a', fecha: '2026-09-24', pieza_dental: 16, caras: 'O', procedimiento: 'Obturación', estado: 'realizado' } as HistorialClinico;
function show(historial: HistorialClinico[]) {
  return render(<VisitDetail cita={cita} historial={historial} notas={[]} documentos={[]} consentimientos={[]} onClose={vi.fn()} onOpenDocumento={vi.fn()} onOpenConsentimiento={vi.fn()} />);
}
describe('VisitDetail', () => {
  it.each(['facturado', 'cobrado_parcial', 'cobrado_completo'])('conserva los actos clínicos después de pasar a %s', (estado) => {
    show([{ ...treatment, estado }]);
    expect(screen.getByText('Obturación')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Información odontológica de la visita' })).toHaveTextContent('Pieza 16');
  });
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
  it('no atribuye tratamientos a una visita por coincidencia de fecha', () => {
    show([{ ...treatment, cita_id: null }]);
    expect(screen.queryByText('Obturación')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Información odontológica de la visita' })).not.toBeInTheDocument();
  });
});
