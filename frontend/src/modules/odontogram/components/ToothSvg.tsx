import type { Arch, Side, SurfaceKey, ToothStatus, ToothType } from '../types/odontogram.types';
import { getToothAnatomy, type ToothAnatomy } from '../data/toothAnatomy';
import { statusConfig } from '../data/statusConfig';

type ToothSvgProps = {
  toothNumber: string;
  toothType: ToothType;
  arch: Arch;
  side: Side;
  selected: boolean;
  selectedSurface?: SurfaceKey;
  surfaces: Partial<Record<SurfaceKey, ToothStatus>>;
  status?: ToothStatus;
  assetUrl?: string;
  onSelectTooth: (toothNumber: string) => void;
  onSelectSurface: (toothNumber: string, surface: SurfaceKey) => void;
  onOpenQuickTreatment: (toothNumber: string, surface?: SurfaceKey) => void;
  onOpenContextMenu: (toothNumber: string, surface: SurfaceKey | undefined, x: number, y: number) => void;
};

const enamel = '#FFFDF7';
const enamelWarm = '#F7F0DE';
const enamelShade = '#EDE3CC';
const outline = '#7B6C58';
const groove = '#917C5E';
const rootFill = '#EED9A1';
const rootShade = '#CDAA62';

function statusFill(status?: ToothStatus) {
  if (!status || status === 'healthy') return enamel;
  return statusConfig[status].softColor;
}

function statusStroke(status?: ToothStatus) {
  if (!status || status === 'healthy') return outline;
  return statusConfig[status].color;
}

function surfaceFill(isMissing: boolean, status?: ToothStatus) {
  if (isMissing) return statusConfig.missing.softColor;
  return statusFill(status);
}

function getAssetBox(toothNumber: string, type: ToothType, arch: Arch) {
  const position = Number(toothNumber[1]);

  if (type === 'molar') {
    if (position === 8) return { x: -18, y: 7, width: 126, height: 146 };
    if (position === 7) return { x: -16, y: 7, width: 122, height: 146 };
    return { x: -14, y: 7, width: 118, height: 146 };
  }

  if (type === 'premolar') {
    return position === 4
      ? { x: -4, y: 5, width: 98, height: 148 }
      : { x: -1, y: 6, width: 92, height: 146 };
  }

  if (type === 'canine') return { x: 5, y: 2, width: 80, height: 154 };

  if (position === 1) {
    return arch === 'upper' ? { x: 4, y: 5, width: 82, height: 148 } : { x: 15, y: 9, width: 60, height: 140 };
  }

  return arch === 'upper' ? { x: 10, y: 6, width: 72, height: 146 } : { x: 15, y: 10, width: 60, height: 140 };
}

type RootPathsProps = {
  anatomy: ToothAnatomy;
  toothNumber: string;
  rootPaint: string;
  rootStroke: string;
  rootClassName: string;
  opacity?: number;
  onSelectRoot: (event: React.MouseEvent<SVGElement>) => void;
  onOpenQuickTreatment: (event: React.MouseEvent<SVGElement>) => void;
  onOpenContextMenu: (event: React.MouseEvent<SVGElement>) => void;
};

function RootPaths({
  anatomy,
  toothNumber,
  rootPaint,
  rootStroke,
  rootClassName,
  opacity = 1,
  onSelectRoot,
  onOpenQuickTreatment,
  onOpenContextMenu,
}: RootPathsProps) {
  return (
    <>
      <path
        id={`tooth-${toothNumber}-root`}
        className={rootClassName}
        d={anatomy.rootLeft}
        fill={rootPaint}
        stroke={rootStroke}
        opacity={opacity}
        pointerEvents="all"
        onClick={onSelectRoot}
        onDoubleClick={onOpenQuickTreatment}
        onContextMenu={onOpenContextMenu}
      />
      {anatomy.rootCenter ? (
        <path
          id={`tooth-${toothNumber}-root-center`}
          className={rootClassName}
          d={anatomy.rootCenter}
          fill={rootPaint}
          stroke={rootStroke}
          opacity={opacity}
          pointerEvents="all"
          onClick={onSelectRoot}
          onDoubleClick={onOpenQuickTreatment}
          onContextMenu={onOpenContextMenu}
        />
      ) : null}
      {anatomy.rootRight ? (
        <path
          id={`tooth-${toothNumber}-root-right`}
          className={rootClassName}
          d={anatomy.rootRight}
          fill={rootPaint}
          stroke={rootStroke}
          opacity={opacity}
          pointerEvents="all"
          onClick={onSelectRoot}
          onDoubleClick={onOpenQuickTreatment}
          onContextMenu={onOpenContextMenu}
        />
      ) : null}
    </>
  );
}

export function ToothSvg({
  toothNumber,
  toothType,
  arch,
  selected,
  selectedSurface,
  surfaces,
  status,
  assetUrl,
  onSelectTooth,
  onSelectSurface,
  onOpenQuickTreatment,
  onOpenContextMenu,
}: ToothSvgProps) {
  const anatomy = getToothAnatomy(toothNumber, arch, toothType);
  const innerSurface: SurfaceKey = arch === 'upper' ? 'palatal' : 'lingual';
  const isMissing = status === 'missing';
  const archTransform = arch === 'upper' ? 'translate(0 160) scale(1 -1)' : '';
  const assetBox = getAssetBox(toothNumber, toothType, arch);

  const selectRoot = (event: React.MouseEvent<SVGElement>) => {
    event.stopPropagation();
    onSelectSurface(toothNumber, 'root');
  };
  const openTreatmentTooth = (event: React.MouseEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenQuickTreatment(toothNumber, undefined);
  };
  const openContextMenuTooth = (event: React.MouseEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenContextMenu(toothNumber, undefined, event.clientX, event.clientY);
  };
  const openTreatmentRoot = (event: React.MouseEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenQuickTreatment(toothNumber, 'root');
  };
  const openContextMenuRoot = (event: React.MouseEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenContextMenu(toothNumber, 'root', event.clientX, event.clientY);
  };

  const surfaceClass = (surface: SurfaceKey) => (selectedSurface === surface ? 'od-surface is-active' : 'od-surface');
  const fill = (surface: SurfaceKey) => surfaceFill(isMissing, surfaces[surface]);
  const line = (surface: SurfaceKey) => (isMissing ? statusConfig.missing.color : statusStroke(surfaces[surface]));
  const viewFill = (surface: SurfaceKey) => surfaceFill(isMissing, surfaces.crown ?? surfaces[surface]);
  const viewStroke = (surface: SurfaceKey) =>
    isMissing ? statusConfig.missing.color : statusStroke(surfaces.crown ?? surfaces[surface]);
  const crownPaint = viewFill('vestibular') === enamel ? `url(#tooth-${toothNumber}-enamel)` : viewFill('vestibular');
  const rootPaint = fill('root') === enamel ? `url(#tooth-${toothNumber}-root)` : fill('root');
  const baseOpacity = assetUrl ? 0 : 1;
  const hasRootState = Boolean(surfaces.root && surfaces.root !== 'healthy');
  const rootOverlayOpacity = hasRootState || selectedSurface === 'root' ? 0.74 : 0;
  const overlayFill = (surface: SurfaceKey) => {
    const surfaceStatus = surfaces[surface];
    if (!surfaceStatus || surfaceStatus === 'healthy') return 'transparent';
    return statusConfig[surfaceStatus].softColor;
  };
  const hasSurfaceState = (surface: SurfaceKey) =>
    Boolean(surfaces[surface] && surfaces[surface] !== 'healthy');
  const overlayOpacity = (surface: SurfaceKey) => (hasSurfaceState(surface) ? 0.72 : 0);

  return (
    <svg
      className={`od-tooth-svg ${isMissing ? 'is-missing' : ''} ${selected ? 'is-selected' : ''}`}
      viewBox="0 0 90 160"
      role="img"
      aria-label={`Pieza ${toothNumber}`}
      onClick={() => onSelectTooth(toothNumber)}
      onDoubleClick={openTreatmentTooth}
      onContextMenu={openContextMenuTooth}
      overflow="visible"
    >
      <defs>
        <linearGradient id={`tooth-${toothNumber}-enamel`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="48%" stopColor={enamel} />
          <stop offset="78%" stopColor={enamelWarm} />
          <stop offset="100%" stopColor={enamelShade} />
        </linearGradient>
        <linearGradient id={`tooth-${toothNumber}-root`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#FAEBC4" />
          <stop offset="58%" stopColor={rootFill} />
          <stop offset="100%" stopColor="#D9BC78" />
        </linearGradient>
        <filter id={`tooth-${toothNumber}-soft-shadow`} x="-30%" y="-24%" width="160%" height="170%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.35" floodColor="#4B3E2D" floodOpacity="0.18" />
        </filter>
      </defs>

      <g id={`tooth-${toothNumber}-main`} filter={`url(#tooth-${toothNumber}-soft-shadow)`} transform={archTransform}>
        {assetUrl ? (
          <image
            href={assetUrl}
            x={assetBox.x}
            y={assetBox.y}
            width={assetBox.width}
            height={assetBox.height}
            preserveAspectRatio="xMidYMid meet"
            pointerEvents="none"
          />
        ) : null}
        <g opacity={baseOpacity}>
          <RootPaths
            anatomy={anatomy}
            toothNumber={toothNumber}
            rootPaint={rootPaint}
            rootStroke={line('root')}
            rootClassName={surfaceClass('root')}
            onSelectRoot={selectRoot}
            onOpenQuickTreatment={openTreatmentRoot}
            onOpenContextMenu={openContextMenuRoot}
          />
        </g>
        {assetUrl ? (
          <RootPaths
            anatomy={anatomy}
            toothNumber={toothNumber}
            rootPaint={overlayFill('root')}
            rootStroke={selectedSurface === 'root' || hasRootState ? line('root') : 'transparent'}
            rootClassName={surfaceClass('root')}
            opacity={rootOverlayOpacity}
            onSelectRoot={selectRoot}
            onOpenQuickTreatment={openTreatmentRoot}
            onOpenContextMenu={openContextMenuRoot}
          />
        ) : null}
        <path
          id={`tooth-${toothNumber}-crown`}
          className="od-tooth-body"
          d={anatomy.crown}
          fill={assetUrl ? 'transparent' : crownPaint}
          stroke={assetUrl ? 'transparent' : viewStroke('vestibular')}
        />
        <path
          id={`tooth-${toothNumber}-mesial`}
          d="M22 46 C22 37 29 31 39 29 L39 68 C30 67 24 60 22 50 Z"
          fill={overlayFill('mesial')}
          stroke={line('mesial')}
          opacity={overlayOpacity('mesial')}
          pointerEvents="none"
        />
        <path
          id={`tooth-${toothNumber}-distal`}
          d="M51 29 C61 31 68 37 68 46 L66 50 C66 60 60 67 51 68 Z"
          fill={overlayFill('distal')}
          stroke={line('distal')}
          opacity={overlayOpacity('distal')}
          pointerEvents="none"
        />
        <path
          id={`tooth-${toothNumber}-inner`}
          d="M29 55 C39 61 51 61 61 55 L58 66 C50 72 40 72 32 66 Z"
          fill={overlayFill(innerSurface)}
          stroke={line(innerSurface)}
          opacity={overlayOpacity(innerSurface)}
          pointerEvents="none"
        />
        {!assetUrl ? (
          <>
            <path
              id={`tooth-${toothNumber}-grooves`}
              d={anatomy.grooves}
              fill="none"
              stroke={groove}
              opacity="0.42"
              pointerEvents="none"
            />
            <path d={anatomy.highlightPrimary} fill="#FFFFFF" opacity="0.74" pointerEvents="none" />
            <path d={anatomy.highlightSecondary} fill="#FFFFFF" opacity="0.5" pointerEvents="none" />
            <path d={anatomy.rootHighlight} fill="none" stroke={rootShade} opacity="0.48" pointerEvents="none" />
          </>
        ) : null}
      </g>
    </svg>
  );
}
