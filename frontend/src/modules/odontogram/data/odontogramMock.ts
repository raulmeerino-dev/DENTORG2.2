import type { ToothData } from '../types/odontogram.types';
import { createBaseTooth, dentalArches } from './toothMap';

const allNumbers = [...dentalArches.upper, ...dentalArches.lower];

export const odontogramMock: ToothData[] = allNumbers.map((number) => {
  const tooth = createBaseTooth(number);

  switch (number) {
    case '24':
      return {
        ...tooth,
        status: 'pending',
        surfaces: { crown: 'crown' },
        plannedTreatments: [
          {
            id: 'tr-24-crown',
            name: 'Corona ceramica',
            status: 'pending',
            price: 420,
            surface: 'crown',
            createdAt: '2026-05-08',
          },
        ],
      };
    case '36':
      return {
        ...tooth,
        status: 'pending',
        surfaces: { occlusal: 'crown' },
        plannedTreatments: [
          {
            id: 'tr-36-crown',
            name: 'Corona sobre molar',
            status: 'planned',
            price: 460,
            surface: 'occlusal',
            createdAt: '2026-05-08',
          },
        ],
      };
    case '46':
      return {
        ...tooth,
        surfaces: { occlusal: 'filling' },
        completedTreatments: [
          {
            id: 'tr-46-fill',
            name: 'Obturacion composite',
            status: 'completed',
            price: 85,
            surface: 'occlusal',
            completedAt: '2026-04-18',
          },
        ],
      };
    case '28':
      return {
        ...tooth,
        status: 'missing',
        surfaces: {},
        notes: 'Pieza ausente registrada en exploracion inicial.',
      };
    case '16':
      return {
        ...tooth,
        surfaces: { distal: 'caries' },
        plannedTreatments: [
          {
            id: 'tr-16-caries',
            name: 'Restauracion distal',
            status: 'planned',
            price: 95,
            surface: 'distal',
            createdAt: '2026-05-08',
          },
        ],
      };
    case '26':
      return {
        ...tooth,
        surfaces: { root: 'endodontics', crown: 'endodontics' },
        completedTreatments: [
          {
            id: 'tr-26-endo',
            name: 'Endodoncia molar',
            status: 'completed',
            price: 280,
            completedAt: '2026-03-29',
          },
        ],
      };
    default:
      return tooth;
  }
});
