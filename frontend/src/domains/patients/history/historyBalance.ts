import { money } from '../../../shared/format';

// The ledger stores debt as positive. History presents the patient's position:
// negative = owes money, positive = credit. Never change the accounting amounts.
export function historyBalance(value?: string | number | null) {
  return value == null ? '—' : money(Number(value) === 0 ? 0 : -Number(value));
}

export function historyBalanceClass(value?: string | number | null) {
  return Number(value) > 0 ? 'has-debt' : Number(value) < 0 ? 'has-credit' : '';
}
