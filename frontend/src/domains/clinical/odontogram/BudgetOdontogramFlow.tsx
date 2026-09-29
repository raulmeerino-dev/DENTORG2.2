import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOdontogramaPaciente } from '../../../api/odontogram';
import type { ApiPaciente, Presupuesto, UserRole } from '../../../api/types';
import { odontogramaBackendToVisual } from './adapters/backendAdapter';
import { budgetToVisualOdontogram } from './adapters/budgetAdapter';
import { fullName } from '../../patients/patientName';
import { Odontogram } from './components/Odontogram';
import type { SurfaceKey } from './types/odontogram.types';

const faces: Partial<Record<SurfaceKey, string>> = { mesial: 'M', distal: 'D', vestibular: 'V', buccal: 'V', palatal: 'P', lingual: 'L', occlusal: 'O', incisal: 'I', root: 'R', crown: 'C' };

type BudgetOdontogramFlowProps = {
  paciente: ApiPaciente; presupuesto: Presupuesto;
  userRole?: UserRole | null; disabled?: boolean;
  onSelectPiece?: (piece: number, faces?: string) => void;
};

export function BudgetOdontogramFlow({ paciente, presupuesto, userRole, disabled, onSelectPiece }: BudgetOdontogramFlowProps) {
  const canView = userRole === 'admin' || userRole === 'doctor' || userRole === 'auxiliar';
  const query = useQuery({ queryKey: ['patient-odontogram-flow', paciente.id], queryFn: () => getOdontogramaPaciente(paciente.id), staleTime: 30_000, enabled: canView });
  const data = useMemo(() => budgetToVisualOdontogram(presupuesto, odontogramaBackendToVisual(query.data)), [presupuesto, query.data]);
  if (!canView) return <p className="budget-clinical-restricted">Odontograma reservado a clínica. Puedes gestionar el presupuesto desde el catálogo y las líneas.</p>;
  if (query.isLoading) return <p role="status">Cargando odontograma…</p>;
  if (query.isError) return <div role="alert">No se pudo cargar el odontograma. <button onClick={() => void query.refetch()}>Reintentar</button></div>;
  return <div className="odontogram-flow-panel"><Odontogram mode="budget" patientName={fullName(paciente)} patientId={paciente.id} budgetId={presupuesto.id} data={data}
    title="Odontograma del presupuesto" subtitle={disabled ? 'Consulta de las piezas de este presupuesto.' : 'Pulsa las piezas o caras para llevarlas al editor. Puedes seleccionar varias y añadir el tratamiento de una vez.'}
    readOnly enableQuickTreatments={false} showLegend={false} showInspector={false}
    onPrepareTreatment={!disabled ? selection => onSelectPiece?.(Number(selection.toothNumber), selection.surface ? faces[selection.surface] : undefined) : undefined}
    onSelectTooth={selection => { if (!disabled) onSelectPiece?.(Number(selection.toothNumber), selection.surface ? faces[selection.surface] : undefined); }} /></div>;
}
