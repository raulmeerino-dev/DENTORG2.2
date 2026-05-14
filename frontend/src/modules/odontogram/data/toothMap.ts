import type { Arch, Side, SurfaceKey, ToothData, ToothType } from '../types/odontogram.types';

export const upperRight = ['18', '17', '16', '15', '14', '13', '12', '11'];
export const upperLeft = ['21', '22', '23', '24', '25', '26', '27', '28'];
export const lowerRight = ['48', '47', '46', '45', '44', '43', '42', '41'];
export const lowerLeft = ['31', '32', '33', '34', '35', '36', '37', '38'];

export const dentalArches = {
  upper: [...upperRight, ...upperLeft],
  lower: [...lowerRight, ...lowerLeft],
} as const;

export const mirrorMap: Record<string, string> = {
  '18': '28',
  '17': '27',
  '16': '26',
  '15': '25',
  '14': '24',
  '13': '23',
  '12': '22',
  '11': '21',
  '48': '38',
  '47': '37',
  '46': '36',
  '45': '35',
  '44': '34',
  '43': '33',
  '42': '32',
  '41': '31',
};

export const surfaceMirrorMap: Record<SurfaceKey, SurfaceKey> = {
  buccal: 'buccal',
  vestibular: 'vestibular',
  palatal: 'palatal',
  lingual: 'lingual',
  mesial: 'mesial',
  distal: 'distal',
  occlusal: 'occlusal',
  incisal: 'incisal',
  root: 'root',
  crown: 'crown',
};

export function getAnatomicalSurfaceFromVisualSurface(surface: SurfaceKey): SurfaceKey {
  return surfaceMirrorMap[surface];
}

export function getToothType(number: string): ToothType {
  const position = Number(number[1]);

  if (position === 1 || position === 2) return 'incisor';
  if (position === 3) return 'canine';
  if (position === 4 || position === 5) return 'premolar';
  return 'molar';
}

export function getArch(number: string): Arch {
  return number.startsWith('1') || number.startsWith('2') ? 'upper' : 'lower';
}

export function getSide(number: string): Side {
  return number.startsWith('1') || number.startsWith('4') ? 'right' : 'left';
}

export function createBaseTooth(number: string): ToothData {
  return {
    number,
    type: getToothType(number),
    arch: getArch(number),
    side: getSide(number),
    status: 'healthy',
    surfaces: {},
    visualAssetUrl: `/odontogram-assets/full/${number}.png`,
    occlusalAssetUrl: `/odontogram-assets/occlusal/${number}.png`,
  };
}

export function getPrimarySurface(type: ToothType): SurfaceKey {
  return type === 'incisor' || type === 'canine' ? 'incisal' : 'occlusal';
}
