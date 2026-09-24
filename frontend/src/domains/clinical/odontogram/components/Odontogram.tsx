import { useMemo, useState } from 'react';
import type {
  OdontogramContextAction,
  OdontogramChange,
  OdontogramProps,
  SurfaceKey,
  ToothData,
  ToothSelection,
  ToothStatus,
  Treatment,
} from '../types/odontogram.types';
import { odontogramMock } from '../data/odontogramMock';
import { odontogramModeConfig } from '../data/modeConfig';
import type { QuickTreatment } from '../data/treatmentCatalog';
import { getPrimarySurface } from '../data/toothMap';
import { OdontogramHeader } from './OdontogramHeader';
import { OdontogramLegend } from './OdontogramLegend';
import { OdontogramaSidePanel } from './OdontogramaSidePanel';
import { QuickTreatmentModal } from './QuickTreatmentModal';
import { ToothArch } from './ToothArch';
import { ToothContextMenu } from './ToothContextMenu';
import { ToothHistoryModal } from './ToothHistoryModal';

const defaultSelection: ToothSelection = {
  toothNumber: '36',
  surface: 'occlusal',
};

type ContextMenuState = ToothSelection & {
  x: number;
  y: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function Odontogram({
  data,
  mode = 'budget',
  title,
  subtitle = 'Mapa clinico del paciente',
  patientName = 'Paciente',
  contextDate,
  totalBudget,
  selected,
  readOnly,
  showDemoHeader = false,
  showLegend = true,
  enableQuickTreatments,
  quickTreatments,
  onChange,
  onAddTreatment,
  onSelectTooth,
  onContextAction,
}: OdontogramProps) {
  const config = odontogramModeConfig[mode];
  const isReadOnly = readOnly ?? config.readOnly;
  const quickTreatmentsEnabled = enableQuickTreatments ?? config.quickTreatments;
  const [internalTeeth, setInternalTeeth] = useState<ToothData[]>(data ?? odontogramMock);
  const [internalSelection, setInternalSelection] = useState<ToothSelection>(selected ?? defaultSelection);
  const [quickTreatmentTarget, setQuickTreatmentTarget] = useState<ToothSelection | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [historyToothNumber, setHistoryToothNumber] = useState<string | null>(null);
  const teeth = data ?? internalTeeth;
  const selection = selected ?? internalSelection;

  const selectedTooth = useMemo(() => {
    const bySelection = teeth.find((tooth) => tooth.number === selection.toothNumber);
    return bySelection ?? teeth.find((tooth) => tooth.number === defaultSelection.toothNumber) ?? teeth[0];
  }, [selection.toothNumber, teeth]);

  const selectedSurface = selectedTooth && selection.toothNumber === selectedTooth.number ? selection.surface : undefined;

  const commitChange = (nextData: ToothData[], change: OdontogramChange) => {
    if (!data) setInternalTeeth(nextData);
    onChange?.(nextData, change);
  };

  const updateTooth = (toothNumber: string, updater: (tooth: ToothData) => ToothData, change: OdontogramChange) => {
    const nextData = teeth.map((tooth) => (tooth.number === toothNumber ? updater(tooth) : tooth));
    commitChange(nextData, change);
  };

  const setSelection = (nextSelection: ToothSelection) => {
    if (!selected) setInternalSelection(nextSelection);

    const nextTooth = teeth.find((tooth) => tooth.number === nextSelection.toothNumber);
    if (nextTooth) onSelectTooth?.(nextSelection, nextTooth);
  };

  if (!selectedTooth) return null;

  const applyStatus = (status: ToothStatus) => {
    if (isReadOnly) return;

    const targetSurface = selectedSurface ?? getPrimarySurface(selectedTooth.type);
    updateTooth(
      selectedTooth.number,
      (tooth) => {
        if (status === 'missing') {
          return { ...tooth, status, surfaces: {} };
        }

        return {
          ...tooth,
          status: status === 'pending' || status === 'completed' ? status : tooth.status,
          surfaces: {
            ...tooth.surfaces,
            [targetSurface]: status,
          },
        };
      },
      {
        type: 'apply_status',
        toothNumber: selectedTooth.number,
        surface: targetSurface,
        status,
      },
    );
  };

  const clearSelectedSurface = () => {
    if (isReadOnly) return;

    updateTooth(
      selectedTooth.number,
      (tooth) => {
        if (!selectedSurface) {
          return { ...tooth, status: 'healthy', surfaces: {} };
        }

        const nextSurfaces = { ...tooth.surfaces };
        delete nextSurfaces[selectedSurface];
        return { ...tooth, status: 'healthy', surfaces: nextSurfaces };
      },
      {
        type: 'clear_surface',
        toothNumber: selectedTooth.number,
        surface: selectedSurface,
      },
    );
  };

  const handleSelectTooth = (toothNumber: string) => {
    setSelection({ toothNumber });
  };

  const handleSelectSurface = (toothNumber: string, surface: SurfaceKey) => {
    setSelection({ toothNumber, surface });
  };

  const openQuickTreatment = (toothNumber: string, surface?: SurfaceKey) => {
    if (!quickTreatmentsEnabled || isReadOnly) return;

    const nextSelection = { toothNumber, surface };
    setSelection(nextSelection);
    setQuickTreatmentTarget(nextSelection);
  };

  const openContextMenu = (toothNumber: string, surface: SurfaceKey | undefined, x: number, y: number) => {
    const nextSelection = { toothNumber, surface };
    setSelection(nextSelection);
    setContextMenu({
      ...nextSelection,
      x: Math.min(x, window.innerWidth - 244),
      y: Math.min(y, window.innerHeight - 226),
    });
  };

  const notifyContextAction = (action: OdontogramContextAction, target: ToothSelection) => {
    const tooth = teeth.find((item) => item.number === target.toothNumber);
    if (tooth) onContextAction?.(action, tooth, target);
  };

  const markMissingFromContext = (target: ToothSelection) => {
    if (isReadOnly) return;

    updateTooth(
      target.toothNumber,
      (tooth) => ({ ...tooth, status: 'missing', surfaces: {} }),
      {
        type: 'mark_missing',
        toothNumber: target.toothNumber,
      },
    );
    notifyContextAction('mark_missing', target);
    setContextMenu(null);
  };

  const clearTreatmentsFromContext = (target: ToothSelection) => {
    if (isReadOnly) return;

    updateTooth(
      target.toothNumber,
      (tooth) => ({
        ...tooth,
        status: tooth.status === 'missing' ? 'missing' : 'healthy',
        surfaces: {},
        plannedTreatments: [],
        completedTreatments: [],
      }),
      {
        type: 'clear_treatments',
        toothNumber: target.toothNumber,
      },
    );
    notifyContextAction('clear_treatments', target);
    setContextMenu(null);
  };

  const viewHistoryFromContext = (target: ToothSelection) => {
    notifyContextAction('view_history', target);
    setHistoryToothNumber(target.toothNumber);
    setContextMenu(null);
  };

  const quickTreatmentFromContext = (target: ToothSelection) => {
    notifyContextAction('quick_treatment', target);
    setContextMenu(null);
    openQuickTreatment(target.toothNumber, target.surface);
  };

  const resolveTreatmentSurface = (tooth: ToothData, treatment: QuickTreatment, surface?: SurfaceKey) => {
    if (treatment.defaultSurface) return treatment.defaultSurface;
    if (treatment.targetScope && treatment.targetScope !== 'surface') return undefined;
    if (surface) return surface;
    if (treatment.status === 'caries' || treatment.status === 'filling') return getPrimarySurface(tooth.type);
    return undefined;
  };

  const addQuickTreatment = (treatment: QuickTreatment) => {
    if (isReadOnly || !quickTreatmentTarget) return;

    const targetTooth = teeth.find((tooth) => tooth.number === quickTreatmentTarget.toothNumber);
    if (!targetTooth) return;

    const targetSurface = resolveTreatmentSurface(targetTooth, treatment, quickTreatmentTarget.surface);
    const plannedTreatment: Treatment = {
      id: `${treatment.id}-${targetTooth.number}-${Date.now()}`,
      name: treatment.name,
      status: 'planned',
      targetScope: treatment.targetScope ?? (targetSurface ? 'surface' : 'tooth'),
      price: treatment.price,
      surface: targetSurface,
      toothNumbers: [targetTooth.number],
      createdAt: new Date().toISOString().slice(0, 10),
    };

    const nextTreatmentSelection = { toothNumber: targetTooth.number, surface: targetSurface };
    updateTooth(
      targetTooth.number,
      (tooth) => ({
        ...tooth,
        status: targetSurface ? tooth.status : treatment.status,
        surfaces: targetSurface
          ? {
              ...tooth.surfaces,
              [targetSurface]: treatment.status,
            }
          : tooth.surfaces,
        plannedTreatments: [...(tooth.plannedTreatments ?? []), plannedTreatment],
      }),
      {
        type: 'add_treatment',
        toothNumber: targetTooth.number,
        surface: targetSurface,
        treatment: plannedTreatment,
        status: treatment.status,
      },
    );

    const nextData = teeth.map((tooth) => (tooth.number === targetTooth.number
      ? {
          ...tooth,
          status: targetSurface ? tooth.status : treatment.status,
          surfaces: targetSurface
            ? {
                ...tooth.surfaces,
                [targetSurface]: treatment.status,
              }
            : tooth.surfaces,
          plannedTreatments: [...(tooth.plannedTreatments ?? []), plannedTreatment],
        }
      : tooth));
    onAddTreatment?.(plannedTreatment, nextTreatmentSelection, nextData);
    setSelection(nextTreatmentSelection);
    setQuickTreatmentTarget(null);
  };

  const quickTreatmentTooth = quickTreatmentTarget ? teeth.find((tooth) => tooth.number === quickTreatmentTarget.toothNumber) : undefined;
  const contextMenuTooth = contextMenu ? teeth.find((tooth) => tooth.number === contextMenu.toothNumber) : undefined;
  const historyTooth = historyToothNumber ? teeth.find((tooth) => tooth.number === historyToothNumber) : undefined;

  return (
    <main className="od-page">
      {showDemoHeader ? <OdontogramHeader patientName={patientName} mode={mode} contextDate={contextDate} totalBudget={totalBudget} /> : null}

      <section className="od-shell" aria-label="Odontograma interactivo">
        <div className="od-workspace-card">
          <div className="od-card-heading">
            <div>
              <span className="od-section-kicker">{config.kicker}</span>
              <h1>{title ?? config.title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="od-clinical-context" aria-label="Contexto del odontograma">
              <span>{patientName}</span>
              {contextDate && <span>{contextDate}</span>}
              {totalBudget !== undefined && <strong>{formatCurrency(totalBudget)}</strong>}
            </div>
          </div>

          <div className="od-layout">
            <div
              className="od-chart-area"
              tabIndex={0}
              aria-label="Odontograma dental. Desplaza horizontalmente si no caben todas las piezas."
            >
              <ToothArch
                arch="upper"
                teeth={teeth}
                selectedToothNumber={selectedTooth.number}
                selectedSurface={selectedSurface}
                onSelectTooth={handleSelectTooth}
                onSelectSurface={handleSelectSurface}
                onOpenQuickTreatment={openQuickTreatment}
                onOpenContextMenu={openContextMenu}
              />
              <div className="od-midline" aria-hidden="true">
                <span />
              </div>
              <ToothArch
                arch="lower"
                teeth={teeth}
                selectedToothNumber={selectedTooth.number}
                selectedSurface={selectedSurface}
                onSelectTooth={handleSelectTooth}
                onSelectSurface={handleSelectSurface}
                onOpenQuickTreatment={openQuickTreatment}
                onOpenContextMenu={openContextMenu}
              />
              {showLegend ? <OdontogramLegend data={teeth} compact /> : null}
            </div>

            <OdontogramaSidePanel
              tooth={selectedTooth}
              selectedSurface={selectedSurface}
              readOnly={isReadOnly}
              mode={mode}
              onSelectSurface={(surface) => handleSelectSurface(selectedTooth.number, surface)}
              onApplyStatus={applyStatus}
              onClearSurface={clearSelectedSurface}
            />
          </div>
        </div>
      </section>

      {quickTreatmentsEnabled && quickTreatmentTarget && quickTreatmentTooth ? (
        <QuickTreatmentModal
          tooth={quickTreatmentTooth}
          surface={quickTreatmentTarget.surface}
          treatments={quickTreatments}
          onClose={() => setQuickTreatmentTarget(null)}
          onSelectTreatment={addQuickTreatment}
        />
      ) : null}

      {contextMenu && contextMenuTooth ? (
        <ToothContextMenu
          tooth={contextMenuTooth}
          surface={contextMenu.surface}
          x={contextMenu.x}
          y={contextMenu.y}
          readOnly={isReadOnly}
          enableQuickTreatments={quickTreatmentsEnabled}
          onQuickTreatment={() => quickTreatmentFromContext(contextMenu)}
          onMarkMissing={() => markMissingFromContext(contextMenu)}
          onClearTreatments={() => clearTreatmentsFromContext(contextMenu)}
          onViewHistory={() => viewHistoryFromContext(contextMenu)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {historyTooth ? <ToothHistoryModal tooth={historyTooth} onClose={() => setHistoryToothNumber(null)} /> : null}
    </main>
  );
}
