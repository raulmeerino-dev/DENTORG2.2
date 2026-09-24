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

type OclusalShape = {
  outline: string;
  grooves: string;
  central: string;
  buccal: string;
  distal: string;
  inner: string;
  mesial: string;
};

function getOclusalShape(type: ToothType, toothNumber: string): OclusalShape {
  const position = Number(toothNumber[1]);

  if (type === 'molar') {
    const third = position === 8;
    const outline = third
      ? 'M18 28 C15 14 25 6 45 7 C65 6 75 14 72 28 C75 42 65 50 45 49 C25 50 15 42 18 28 Z'
      : 'M13 28 C10 11 25 4 45 5 C65 4 80 11 77 28 C80 45 65 52 45 51 C25 52 10 45 13 28 Z';
    return {
      outline,
      grooves:
        'M22 28 C32 20 39 21 45 28 C51 21 58 20 68 28 M45 8 C43 20 43 38 45 49 M23 17 C33 21 57 21 67 17 M24 39 C34 34 56 34 66 39',
      central: 'M30 22 C34 18 56 18 60 22 L60 34 C56 38 34 38 30 34 Z',
      buccal: third
        ? 'M19 16 C28 8 62 8 71 16 L60 22 L30 22 Z'
        : 'M14 14 C26 6 64 6 76 14 L60 22 L30 22 Z',
      distal: third
        ? 'M71 16 C76 22 76 34 71 40 L60 34 L60 22 Z'
        : 'M76 14 C82 22 82 34 76 42 L60 34 L60 22 Z',
      inner: third
        ? 'M71 40 C62 48 28 48 19 40 L30 34 L60 34 Z'
        : 'M76 42 C64 50 26 50 14 42 L30 34 L60 34 Z',
      mesial: third
        ? 'M19 40 C14 34 14 22 19 16 L30 22 L30 34 Z'
        : 'M14 42 C8 34 8 22 14 14 L30 22 L30 34 Z',
    };
  }

  if (type === 'premolar') {
    return {
      outline: 'M20 28 C20 12 31 5 45 5 C59 5 70 12 70 28 C70 44 59 51 45 51 C31 51 20 44 20 28 Z',
      grooves:
        'M28 28 C36 21 54 21 62 28 M45 8 C43 21 43 37 45 48 M29 17 C37 20 53 20 61 17 M30 39 C38 34 52 34 60 39',
      central: 'M34 22 C38 18 52 18 56 22 L56 34 C52 38 38 38 34 34 Z',
      buccal: 'M21 15 C30 7 60 7 69 15 L56 22 L34 22 Z',
      distal: 'M69 15 C74 21 74 35 69 41 L56 34 L56 22 Z',
      inner: 'M69 41 C60 49 30 49 21 41 L34 34 L56 34 Z',
      mesial: 'M21 41 C16 35 16 21 21 15 L34 22 L34 34 Z',
    };
  }

  if (type === 'canine') {
    return {
      outline: 'M28 29 C28 15 36 6 45 3 C54 6 62 15 62 29 C62 43 54 51 45 54 C36 51 28 43 28 29 Z',
      grooves: 'M34 29 C40 23 50 23 56 29 M45 8 C43 22 43 38 45 49',
      central: 'M37 23 C40 19 50 19 53 23 L53 35 C50 39 40 39 37 35 Z',
      buccal: 'M29 17 C36 8 54 8 61 17 L53 23 L37 23 Z',
      distal: 'M61 17 C65 23 65 37 61 43 L53 35 L53 23 Z',
      inner: 'M61 43 C54 51 36 51 29 43 L37 35 L53 35 Z',
      mesial: 'M29 43 C25 37 25 23 29 17 L37 23 L37 35 Z',
    };
  }

  return {
    outline: 'M25 28 C25 15 33 8 45 8 C57 8 65 15 65 28 C65 41 57 48 45 48 C33 48 25 41 25 28 Z',
    grooves: 'M32 28 C39 24 51 24 58 28 M45 12 C44 23 44 36 45 45',
    central: 'M37 22 C40 19 50 19 53 22 L53 34 C50 37 40 37 37 34 Z',
    buccal: 'M26 16 C34 9 56 9 64 16 L53 22 L37 22 Z',
    distal: 'M64 16 C68 22 68 34 64 40 L53 34 L53 22 Z',
    inner: 'M64 40 C56 47 34 47 26 40 L37 34 L53 34 Z',
    mesial: 'M26 40 C22 34 22 22 26 16 L37 22 L37 34 Z',
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
    <svg
      className={`od-occlusal-svg ${status === 'missing' ? 'is-missing' : ''}`}
      viewBox="0 0 90 56"
      aria-label={`Cara oclusal ${toothNumber}`}
      overflow="visible"
    >
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

      <g clipPath={`url(#occlusal-${toothNumber}-clip)`}>
        <path
          className={`od-surface ${isActive('mesial') ? 'is-active' : ''}`}
          d={shape.mesial}
          fill={overlayFill('mesial')}
          stroke={line('mesial')}
          pointerEvents="all"
          onClick={(event) => select(event, 'mesial')}
          onDoubleClick={(event) => openTreatment(event, 'mesial')}
          onContextMenu={(event) => openContextMenu(event, 'mesial')}
        />
        <path
          className={`od-surface ${isActive('distal') ? 'is-active' : ''}`}
          d={shape.distal}
          fill={overlayFill('distal')}
          stroke={line('distal')}
          pointerEvents="all"
          onClick={(event) => select(event, 'distal')}
          onDoubleClick={(event) => openTreatment(event, 'distal')}
          onContextMenu={(event) => openContextMenu(event, 'distal')}
        />
        <path
          className={`od-surface ${isActive('buccal') ? 'is-active' : ''}`}
          d={shape.buccal}
          fill={overlayFill('buccal')}
          stroke={line('buccal')}
          pointerEvents="all"
          onClick={(event) => select(event, 'buccal')}
          onDoubleClick={(event) => openTreatment(event, 'buccal')}
          onContextMenu={(event) => openContextMenu(event, 'buccal')}
        />
        <path
          className={`od-surface ${isActive(innerSurface) ? 'is-active' : ''}`}
          d={shape.inner}
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
      </g>
      {!assetUrl ? (
        <>
          <path d={shape.grooves} fill="none" stroke="#917C5E" strokeLinecap="round" opacity="0.32" pointerEvents="none" />
          <path d="M28 17 C33 11 44 10 52 13 C43 15 36 19 31 24 Z" fill="#FFFFFF" opacity="0.45" pointerEvents="none" />
        </>
      ) : null}
    </svg>
  );
}
