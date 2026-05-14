import type { Arch, SurfaceKey, ToothStatus, ToothType } from '../types/odontogram.types';
import { statusConfig } from '../data/statusConfig';
import { getPrimarySurface } from '../data/toothMap';

type ToothOclusalSvgProps = {
  toothNumber: string;
  toothType: ToothType;
  arch: Arch;
  selected: boolean;
  selectedSurface?: SurfaceKey;
  surfaces: Partial<Record<SurfaceKey, ToothStatus>>;
  status?: ToothStatus;
  assetUrl?: string;
  onSelectSurface: (toothNumber: string, surface: SurfaceKey) => void;
  onOpenQuickTreatment: (toothNumber: string, surface: SurfaceKey) => void;
  onOpenContextMenu: (toothNumber: string, surface: SurfaceKey, x: number, y: number) => void;
};

const baseStroke = '#7B6C58';
const enamel = '#FFFDF7';

function getAssetBox(type: ToothType, toothNumber: string) {
  const position = Number(toothNumber[1]);

  if (type === 'molar') {
    if (position === 8) return { x: -10, y: -4, width: 110, height: 64 };
    return { x: -9, y: -3, width: 108, height: 62 };
  }

  if (type === 'premolar') return { x: 0, y: -1, width: 90, height: 58 };
  if (type === 'canine') return { x: 8, y: -2, width: 74, height: 60 };
  if (position === 1) return { x: 6, y: 1, width: 78, height: 54 };
  return { x: 9, y: 1, width: 72, height: 52 };
}

function getOclusalShape(type: ToothType, toothNumber: string) {
  const position = Number(toothNumber[1]);

  if (type === 'molar') {
    const third = position === 8;
    return {
      outline: third
        ? 'M18 28 C15 14 25 6 45 7 C65 6 75 14 72 28 C75 42 65 50 45 49 C25 50 15 42 18 28 Z'
        : 'M13 28 C10 11 25 4 45 5 C65 4 80 11 77 28 C80 45 65 52 45 51 C25 52 10 45 13 28 Z',
      grooves:
        'M22 28 C32 20 39 21 45 28 C51 21 58 20 68 28 M45 8 C43 20 43 38 45 49 M23 17 C33 21 57 21 67 17 M24 39 C34 34 56 34 66 39',
      central: 'M34 23 C40 18 50 18 56 23 L54 34 C49 39 41 39 36 34 Z',
    };
  }

  if (type === 'premolar') {
    return {
      outline: 'M20 28 C20 12 31 5 45 5 C59 5 70 12 70 28 C70 44 59 51 45 51 C31 51 20 44 20 28 Z',
      grooves: 'M28 28 C36 21 54 21 62 28 M45 8 C43 21 43 37 45 48 M29 17 C37 20 53 20 61 17 M30 39 C38 34 52 34 60 39',
      central: 'M34 23 C40 18 50 18 56 23 L54 34 C49 39 41 39 36 34 Z',
    };
  }

  if (type === 'canine') {
    return {
      outline: 'M28 29 C28 15 36 6 45 3 C54 6 62 15 62 29 C62 43 54 51 45 54 C36 51 28 43 28 29 Z',
      grooves: 'M34 29 C40 23 50 23 56 29 M45 8 C43 22 43 38 45 49',
      central: 'M36 25 C41 20 49 20 54 25 L52 35 C48 39 42 39 38 35 Z',
    };
  }

  return {
    outline: 'M25 28 C25 15 33 8 45 8 C57 8 65 15 65 28 C65 41 57 48 45 48 C33 48 25 41 25 28 Z',
    grooves: 'M32 28 C39 24 51 24 58 28 M45 12 C44 23 44 36 45 45',
    central: 'M36 24 C41 21 49 21 54 24 L53 33 C49 37 41 37 37 33 Z',
  };
}

function statusFill(status?: ToothStatus) {
  if (!status || status === 'healthy') return enamel;
  return statusConfig[status].softColor;
}

function statusStroke(status?: ToothStatus) {
  if (!status || status === 'healthy') return baseStroke;
  return statusConfig[status].color;
}

export function ToothOclusalSvg({
  toothNumber,
  toothType,
  arch,
  selected,
  selectedSurface,
  surfaces,
  status,
  assetUrl,
  onSelectSurface,
  onOpenQuickTreatment,
  onOpenContextMenu,
}: ToothOclusalSvgProps) {
  const shape = getOclusalShape(toothType, toothNumber);
  const primarySurface = getPrimarySurface(toothType);
  const innerSurface: SurfaceKey = arch === 'upper' ? 'palatal' : 'lingual';
  const baseFill = status === 'missing' ? statusConfig.missing.softColor : statusFill(surfaces[primarySurface]);
  const baseLine = status === 'missing' ? statusConfig.missing.color : statusStroke(surfaces[primarySurface]);
  const isActive = (surface: SurfaceKey) => selected && selectedSurface === surface;
  const overlayFill = (surface: SurfaceKey) => {
    const surfaceStatus = surfaces[surface];
    if (!surfaceStatus || surfaceStatus === 'healthy') return 'transparent';
    return statusConfig[surfaceStatus].softColor;
  };
  const line = (surface: SurfaceKey) => (surfaces[surface] ? statusStroke(surfaces[surface]) : 'transparent');
  const assetBox = getAssetBox(toothType, toothNumber);
  const select = (event: React.MouseEvent<SVGElement>, surface: SurfaceKey) => {
    event.stopPropagation();
    onSelectSurface(toothNumber, surface);
  };
  const openTreatment = (event: React.MouseEvent<SVGElement>, surface: SurfaceKey) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenQuickTreatment(toothNumber, surface);
  };
  const openContextMenu = (event: React.MouseEvent<SVGElement>, surface: SurfaceKey) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenContextMenu(toothNumber, surface, event.clientX, event.clientY);
  };

  return (
    <svg className={`od-occlusal-svg ${status === 'missing' ? 'is-missing' : ''}`} viewBox="0 0 90 56" aria-label={`Cara oclusal ${toothNumber}`}>
      <defs>
        <radialGradient id={`occlusal-${toothNumber}-enamel`} cx="40%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="62%" stopColor="#FFFDF7" />
          <stop offset="100%" stopColor="#EDE3CC" />
        </radialGradient>
        <clipPath id={`occlusal-${toothNumber}-clip`}>
          <path d={shape.outline} />
        </clipPath>
      </defs>

      <path
        d={shape.outline}
        fill={assetUrl ? 'transparent' : baseFill === enamel ? `url(#occlusal-${toothNumber}-enamel)` : baseFill}
        stroke={assetUrl ? 'transparent' : baseLine}
      />
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

      <path
        className={`od-surface ${isActive('mesial') ? 'is-active' : ''}`}
        d="M14 28 C13 15 24 7 43 6 L43 50 C24 49 13 41 14 28 Z"
        fill={overlayFill('mesial')}
        stroke={line('mesial')}
        pointerEvents="all"
        onClick={(event) => select(event, 'mesial')}
        onDoubleClick={(event) => openTreatment(event, 'mesial')}
        onContextMenu={(event) => openContextMenu(event, 'mesial')}
      />
      <path
        className={`od-surface ${isActive('distal') ? 'is-active' : ''}`}
        d="M47 6 C66 7 77 15 76 28 C77 41 66 49 47 50 Z"
        fill={overlayFill('distal')}
        stroke={line('distal')}
        pointerEvents="all"
        onClick={(event) => select(event, 'distal')}
        onDoubleClick={(event) => openTreatment(event, 'distal')}
        onContextMenu={(event) => openContextMenu(event, 'distal')}
      />
      <path
        className={`od-surface ${isActive('buccal') ? 'is-active' : ''}`}
        d="M23 15 C32 7 58 7 67 15 L56 27 L34 27 Z"
        fill={overlayFill('buccal')}
        stroke={line('buccal')}
        pointerEvents="all"
        onClick={(event) => select(event, 'buccal')}
        onDoubleClick={(event) => openTreatment(event, 'buccal')}
        onContextMenu={(event) => openContextMenu(event, 'buccal')}
      />
      <path
        className={`od-surface ${isActive(innerSurface) ? 'is-active' : ''}`}
        d="M34 31 L56 31 L67 43 C58 51 32 51 23 43 Z"
        fill={overlayFill(innerSurface)}
        stroke={line(innerSurface)}
        pointerEvents="all"
        onClick={(event) => select(event, innerSurface)}
        onDoubleClick={(event) => openTreatment(event, innerSurface)}
        onContextMenu={(event) => openContextMenu(event, innerSurface)}
      />
      <path
        className={`od-surface ${isActive(primarySurface) ? 'is-active' : ''}`}
        d={shape.central}
        fill={overlayFill(primarySurface)}
        stroke={line(primarySurface)}
        pointerEvents="all"
        onClick={(event) => select(event, primarySurface)}
        onDoubleClick={(event) => openTreatment(event, primarySurface)}
        onContextMenu={(event) => openContextMenu(event, primarySurface)}
      />
      {!assetUrl ? (
        <>
          <path d={shape.grooves} fill="none" stroke="#917C5E" strokeLinecap="round" opacity="0.32" pointerEvents="none" />
          <path d="M28 17 C33 11 44 10 52 13 C43 15 36 19 31 24 Z" fill="#FFFFFF" opacity="0.45" pointerEvents="none" />
        </>
      ) : null}
    </svg>
  );
}
