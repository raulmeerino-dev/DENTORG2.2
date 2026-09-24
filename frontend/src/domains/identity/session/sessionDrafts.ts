import { useCallback, useState, useSyncExternalStore } from 'react';
import type { UsuarioMe } from '../../../api/types';

// Clinical text stays only in this tab's memory, for at most 30 minutes.
// Reloading/closing the tab or explicitly logging out discards it.
const DRAFT_TTL_MS = 30 * 60 * 1000;
const drafts = new Map<string, { value: string; expiresAt: number }>();
const listeners = new Set<() => void>();
let owner: string | null = null;

function notify() { listeners.forEach((listener) => listener()); }

export function setSessionDraftOwner(user: Pick<UsuarioMe, 'id' | 'clinica_id'> | null) {
  owner = user ? JSON.stringify([user.id, user.clinica_id]) : null;
  if (owner) {
    for (const key of drafts.keys()) {
      if (!key.startsWith(`${owner}:`)) drafts.delete(key);
    }
  }
  notify();
}

export function clearSessionDrafts() {
  drafts.clear();
  owner = null;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSessionDraft(key: string) {
  const draftKey = owner ? `${owner}:${key}` : null;
  const [localValue, setLocalValue] = useState('');
  const value = useSyncExternalStore(subscribe, () => {
    if (!draftKey) return localValue;
    const draft = drafts.get(draftKey);
    return draft && draft.expiresAt > Date.now() ? draft.value : '';
  });
  const setValue = useCallback((text: string) => {
    if (!draftKey) {
      setLocalValue(text);
      return;
    }
    if (text) drafts.set(draftKey, { value: text, expiresAt: Date.now() + DRAFT_TTL_MS });
    else drafts.delete(draftKey);
    notify();
  }, [draftKey]);
  return [value, setValue] as const;
}
