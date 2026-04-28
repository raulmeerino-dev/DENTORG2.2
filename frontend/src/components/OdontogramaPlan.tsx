import type { OdontogramaPlan } from '../types/api';

const TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

interface Props {
  value: OdontogramaPlan;
  onChange?: (next: OdontogramaPlan) => void;
  readonly?: boolean;
}

export default function OdontogramaPlanView({ value, onChange, readonly = false }: Props) {
  const selected = value.teeth ?? {};

  function toggle(tooth: number) {
    if (readonly || !onChange) return;
    const key = String(tooth);
    const nextTeeth = { ...selected };
    if (nextTeeth[key]) {
      delete nextTeeth[key];
    } else {
      nextTeeth[key] = { estado: 'planificado', superficies: ['O'] };
    }
    onChange({ version: 1, teeth: nextTeeth });
  }

  return (
    <div className="odontograma" aria-label="Odontograma FDI del plan">
      {TEETH.map((tooth) => {
        const state = selected[String(tooth)]?.estado;
        return (
          <button
            key={tooth}
            type="button"
            className={`tooth ${state ? `tooth-${state}` : ''}`}
            onClick={() => toggle(tooth)}
            title={`Pieza ${tooth}`}
          >
            <svg viewBox="0 0 44 58" role="img" aria-hidden="true">
              <path d="M22 2C12 2 6 9 6 21c0 8 3 15 5 22 2 7 5 13 11 13s9-6 11-13c2-7 5-14 5-22C38 9 32 2 22 2Z" />
              <path d="M12 23c5-4 15-4 20 0M17 9c2 5 8 5 10 0" />
            </svg>
            <span>{tooth}</span>
          </button>
        );
      })}
    </div>
  );
}
