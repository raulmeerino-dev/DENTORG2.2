import type { Arch, ToothType } from '../types/odontogram.types';

export type ToothAnatomy = {
  crown: string;
  rootLeft: string;
  rootRight?: string;
  rootCenter?: string;
  grooves: string;
  highlightPrimary: string;
  highlightSecondary: string;
  rootHighlight: string;
};

type AnatomyKey =
  | 'upper-1'
  | 'upper-2'
  | 'upper-3'
  | 'upper-4'
  | 'upper-5'
  | 'upper-6'
  | 'upper-7'
  | 'upper-8'
  | 'lower-1'
  | 'lower-2'
  | 'lower-3'
  | 'lower-4'
  | 'lower-5'
  | 'lower-6'
  | 'lower-7'
  | 'lower-8';

const anatomyMap: Record<AnatomyKey, ToothAnatomy> = {
  'upper-1': {
    crown: 'M20 35 C20 18 30 10 45 10 C60 10 70 18 70 35 L67 59 C65 73 57 82 45 83 C33 82 25 73 23 59 Z',
    rootLeft: 'M36 58 C34 84 38 108 45 126 C52 108 56 84 54 58 Z',
    grooves: 'M28 36 C36 31 54 31 62 36 M30 53 C38 49 52 49 60 53 M37 31 C40 45 40 61 39 74 M53 31 C50 45 50 61 51 74',
    highlightPrimary: 'M31 27 C36 20 47 19 54 23 C45 25 38 30 34 38 Z',
    highlightSecondary: 'M56 31 C62 34 65 41 63 49 C60 42 58 37 56 34 Z',
    rootHighlight: 'M41 64 C41 86 42 108 45 119',
  },
  'upper-2': {
    crown: 'M25 36 C25 21 33 12 45 12 C57 12 65 21 65 36 L62 58 C61 70 55 78 45 79 C35 78 29 70 28 58 Z',
    rootLeft: 'M38 58 C36 83 39 106 45 123 C51 106 54 83 52 58 Z',
    grooves: 'M31 36 C39 32 51 32 59 36 M33 52 C40 49 50 49 57 52 M45 33 C44 46 44 60 45 72',
    highlightPrimary: 'M34 28 C38 22 47 21 53 24 C45 26 40 31 37 38 Z',
    highlightSecondary: 'M55 32 C60 34 63 40 61 47 C58 41 57 37 55 35 Z',
    rootHighlight: 'M42 64 C42 84 43 104 45 116',
  },
  'upper-3': {
    crown: 'M18 35 C20 18 31 10 45 10 C59 10 70 18 72 35 L65 58 C62 71 55 82 45 86 C35 82 28 71 25 58 Z',
    rootLeft: 'M35 58 C31 89 35 115 45 132 C55 115 59 89 55 58 Z',
    grooves: 'M25 36 C33 29 57 29 65 36 M28 53 C37 48 53 48 62 53 M45 27 C43 45 43 64 45 78',
    highlightPrimary: 'M30 28 C35 20 46 18 53 23 C44 25 37 30 33 39 Z',
    highlightSecondary: 'M56 31 C63 33 67 40 65 49 C61 42 59 37 56 34 Z',
    rootHighlight: 'M40 64 C40 90 41 112 45 124',
  },
  'upper-4': {
    crown: 'M17 36 C16 21 28 11 45 12 C62 11 74 21 73 36 L70 57 C68 70 59 78 45 78 C31 78 22 70 20 57 Z',
    rootLeft: 'M34 57 C31 83 35 107 45 123 C55 107 59 83 56 57 Z',
    grooves: 'M24 33 C34 28 56 28 66 33 M26 51 C36 46 54 46 64 51 M45 31 C43 45 43 60 45 72',
    highlightPrimary: 'M29 27 C34 20 45 19 53 23 C44 25 36 29 32 36 Z',
    highlightSecondary: 'M56 30 C63 31 68 38 66 47 C62 40 59 35 56 33 Z',
    rootHighlight: 'M39 63 C40 84 41 104 45 116',
  },
  'upper-5': {
    crown: 'M18 36 C17 21 28 11 45 12 C62 11 73 21 72 36 L69 56 C67 70 59 78 45 78 C31 78 23 70 21 56 Z',
    rootLeft: 'M33 57 C29 80 30 104 39 122 C45 100 47 78 45 58 Z',
    rootRight: 'M46 58 C45 78 47 100 53 122 C62 104 61 80 57 57 Z',
    grooves: 'M25 33 C34 28 56 28 65 33 M26 51 C36 46 54 46 64 51 M39 32 C42 46 42 60 41 72 M51 32 C48 46 48 60 49 72',
    highlightPrimary: 'M29 27 C34 20 45 19 53 23 C44 25 36 29 32 36 Z',
    highlightSecondary: 'M56 30 C63 31 68 38 66 47 C62 40 59 35 56 33 Z',
    rootHighlight: 'M38 63 C39 84 40 104 43 116',
  },
  'upper-6': {
    crown: 'M11 35 C8 18 20 7 34 11 C40 4 51 5 58 12 C72 8 82 19 79 36 L77 56 C75 71 63 81 45 80 C27 81 15 71 13 56 Z',
    rootLeft: 'M22 57 C18 79 18 102 28 122 C35 100 39 79 39 58 Z',
    rootCenter: 'M37 57 C39 78 42 95 45 112 C49 95 51 78 53 57 Z',
    rootRight: 'M51 58 C51 79 55 100 62 122 C72 102 72 79 68 57 Z',
    grooves: 'M20 32 C30 25 60 25 70 32 M20 51 C33 44 57 44 70 51 M35 30 C39 44 40 59 38 72 M55 30 C51 44 50 59 52 72',
    highlightPrimary: 'M26 26 C31 18 45 17 53 21 C43 23 34 28 30 36 Z',
    highlightSecondary: 'M58 28 C68 28 74 37 71 47 C67 39 64 34 58 32 Z',
    rootHighlight: 'M29 62 C31 84 31 105 35 117',
  },
  'upper-7': {
    crown: 'M13 36 C11 20 21 9 35 12 C41 7 51 7 57 13 C70 10 79 20 77 36 L75 55 C73 70 62 78 45 77 C28 78 17 70 15 55 Z',
    rootLeft: 'M22 57 C18 78 19 101 29 120 C36 99 39 78 39 58 Z',
    rootCenter: 'M38 57 C39 76 42 92 45 108 C48 92 51 76 52 57 Z',
    rootRight: 'M51 58 C51 78 55 99 62 120 C71 101 70 78 67 57 Z',
    grooves: 'M22 32 C32 27 58 27 68 32 M23 51 C35 45 55 45 67 51 M36 31 C40 44 41 58 39 71 M54 31 C50 44 49 58 51 71',
    highlightPrimary: 'M27 27 C32 20 44 19 51 22 C42 24 35 28 31 35 Z',
    highlightSecondary: 'M56 29 C65 29 71 36 69 45 C65 39 61 34 56 32 Z',
    rootHighlight: 'M30 62 C31 82 32 101 36 113',
  },
  'upper-8': {
    crown: 'M17 36 C14 22 23 12 36 15 C42 9 51 10 56 16 C68 13 77 22 74 37 L72 53 C70 67 60 75 45 74 C30 75 20 67 18 53 Z',
    rootLeft: 'M24 55 C20 76 20 95 29 113 C36 95 40 75 39 57 Z',
    rootCenter: 'M38 56 C39 74 42 92 45 106 C49 92 51 74 52 56 Z',
    rootRight: 'M51 57 C51 76 55 95 62 113 C71 95 70 76 66 55 Z',
    grooves: 'M22 33 C32 27 58 27 68 33 M23 50 C34 45 56 45 67 50 M45 30 C43 44 43 59 45 70',
    highlightPrimary: 'M28 27 C32 20 44 19 51 22 C42 24 36 28 32 35 Z',
    highlightSecondary: 'M56 29 C64 29 70 36 68 44 C64 38 61 34 56 32 Z',
    rootHighlight: 'M30 61 C31 82 32 99 36 109',
  },
  'lower-1': {
    crown: 'M27 35 C27 22 34 14 45 14 C56 14 63 22 63 35 L61 58 C60 70 54 78 45 79 C36 78 30 70 29 58 Z',
    rootLeft: 'M38 58 C36 83 39 108 45 125 C51 108 54 83 52 58 Z',
    grooves: 'M30 36 C38 32 52 32 60 36 M31 53 C39 49 51 49 59 53 M39 33 C41 46 41 61 40 73 M51 33 C49 46 49 61 50 73',
    highlightPrimary: 'M33 28 C37 22 46 21 52 24 C44 26 39 31 36 38 Z',
    highlightSecondary: 'M55 32 C60 34 63 40 61 47 C58 41 57 37 55 35 Z',
    rootHighlight: 'M42 64 C42 85 43 106 45 117',
  },
  'lower-2': {
    crown: 'M29 35 C29 23 35 15 45 15 C55 15 61 23 61 35 L59 57 C58 68 53 76 45 77 C37 76 32 68 31 57 Z',
    rootLeft: 'M39 58 C37 82 40 105 45 121 C50 105 53 82 51 58 Z',
    grooves: 'M33 36 C40 33 50 33 57 36 M34 52 C41 49 49 49 56 52 M45 34 C44 46 44 59 45 70',
    highlightPrimary: 'M35 29 C39 23 46 22 51 25 C44 27 40 31 38 38 Z',
    highlightSecondary: 'M54 33 C58 35 61 40 59 46 C57 41 56 38 54 36 Z',
    rootHighlight: 'M42 64 C42 84 43 103 45 113',
  },
  'lower-3': {
    crown: 'M21 35 C23 21 32 13 45 13 C58 13 67 21 69 35 L63 57 C60 69 54 79 45 83 C36 79 30 69 27 57 Z',
    rootLeft: 'M36 58 C33 84 37 109 45 125 C53 109 57 84 54 58 Z',
    grooves: 'M26 36 C34 29 56 29 64 36 M29 52 C38 48 52 48 61 52 M45 29 C43 46 43 63 45 76',
    highlightPrimary: 'M31 28 C36 21 46 19 53 23 C44 25 38 30 34 39 Z',
    highlightSecondary: 'M55 31 C62 33 66 40 64 48 C60 42 58 37 55 34 Z',
    rootHighlight: 'M40 64 C40 88 41 109 45 120',
  },
  'lower-4': {
    crown: 'M20 36 C20 22 30 13 45 14 C60 13 70 22 70 36 L67 56 C65 68 57 75 45 75 C33 75 25 68 23 56 Z',
    rootLeft: 'M34 57 C31 83 35 107 45 123 C55 107 59 83 56 57 Z',
    grooves: 'M27 34 C36 30 54 30 63 34 M28 51 C37 47 53 47 62 51 M45 34 C44 46 44 58 45 69',
    highlightPrimary: 'M31 28 C36 22 46 21 53 24 C44 26 38 30 35 37 Z',
    highlightSecondary: 'M55 31 C61 33 65 39 63 47 C60 41 58 36 55 34 Z',
    rootHighlight: 'M39 63 C40 84 41 104 45 116',
  },
  'lower-5': {
    crown: 'M18 36 C17 21 28 12 45 13 C62 12 73 21 72 36 L69 57 C67 70 59 78 45 78 C31 78 23 70 21 57 Z',
    rootLeft: 'M34 57 C31 84 35 109 45 126 C55 109 59 84 56 57 Z',
    grooves: 'M24 33 C34 28 56 28 66 33 M25 51 C36 46 54 46 65 51 M39 32 C42 46 42 60 41 72 M51 32 C48 46 48 60 49 72',
    highlightPrimary: 'M29 27 C34 20 45 19 53 23 C44 25 36 29 32 36 Z',
    highlightSecondary: 'M56 30 C63 31 68 38 66 47 C62 40 59 35 56 33 Z',
    rootHighlight: 'M39 63 C40 85 41 106 45 118',
  },
  'lower-6': {
    crown: 'M11 35 C8 18 20 7 34 11 C40 5 51 5 58 12 C72 8 82 19 79 36 L77 56 C75 71 63 81 45 80 C27 81 15 71 13 56 Z',
    rootLeft: 'M22 57 C18 79 19 107 31 125 C38 102 40 79 39 58 Z',
    rootRight: 'M51 58 C50 79 53 107 60 125 C72 107 72 79 68 57 Z',
    grooves: 'M20 32 C30 25 60 25 70 32 M20 51 C33 44 57 44 70 51 M35 30 C39 44 40 59 38 72 M55 30 C51 44 50 59 52 72',
    highlightPrimary: 'M26 26 C31 18 45 17 53 21 C43 23 34 28 30 36 Z',
    highlightSecondary: 'M58 28 C68 28 74 37 71 47 C67 39 64 34 58 32 Z',
    rootHighlight: 'M29 62 C31 85 31 107 35 119',
  },
  'lower-7': {
    crown: 'M13 36 C11 20 21 9 35 12 C41 7 51 7 57 13 C70 10 79 20 77 36 L75 55 C73 70 62 78 45 77 C28 78 17 70 15 55 Z',
    rootLeft: 'M22 57 C19 79 20 103 30 122 C37 101 40 79 39 58 Z',
    rootRight: 'M51 58 C50 79 53 103 60 122 C70 103 71 79 67 57 Z',
    grooves: 'M22 32 C32 27 58 27 68 32 M23 51 C35 45 55 45 67 51 M36 31 C40 44 41 58 39 71 M54 31 C50 44 49 58 51 71',
    highlightPrimary: 'M27 27 C32 20 44 19 51 22 C42 24 35 28 31 35 Z',
    highlightSecondary: 'M56 29 C65 29 71 36 69 45 C65 39 61 34 56 32 Z',
    rootHighlight: 'M30 62 C31 83 32 103 36 115',
  },
  'lower-8': {
    crown: 'M17 36 C14 22 23 12 36 15 C42 9 51 10 56 16 C68 13 77 22 74 37 L72 53 C70 67 60 75 45 74 C30 75 20 67 18 53 Z',
    rootLeft: 'M23 55 C19 76 20 99 31 117 C38 96 40 76 39 57 Z',
    rootRight: 'M51 57 C50 76 53 99 59 117 C70 99 71 76 67 55 Z',
    grooves: 'M22 33 C32 27 58 27 68 33 M23 50 C34 45 56 45 67 50 M45 30 C43 44 43 59 45 70',
    highlightPrimary: 'M28 27 C32 20 44 19 51 22 C42 24 36 28 32 35 Z',
    highlightSecondary: 'M56 29 C64 29 70 36 68 44 C64 38 61 34 56 32 Z',
    rootHighlight: 'M30 61 C31 82 32 100 36 110',
  },
};

function getPosition(toothNumber: string) {
  return Number(toothNumber[1]);
}

function getAnatomyKey(toothNumber: string, arch: Arch): AnatomyKey {
  return `${arch}-${getPosition(toothNumber)}` as AnatomyKey;
}

export function getToothAnatomy(toothNumber: string, arch: Arch, _type?: ToothType): ToothAnatomy {
  void _type;
  return anatomyMap[getAnatomyKey(toothNumber, arch)];
}
