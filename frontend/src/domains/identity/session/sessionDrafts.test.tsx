import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSessionDrafts, setSessionDraftOwner, useSessionDraft } from './sessionDrafts';

const user = { id: 'doctor-1', clinica_id: 'clinic-1' };

afterEach(() => {
  act(() => clearSessionDrafts());
  vi.useRealTimers();
});

describe('clinical session drafts', () => {
  it('recovers an unsaved note after reauthentication by the same user and clinic', () => {
    setSessionDraftOwner(user);
    const first = renderHook(() => useSessionDraft('patient-1:tooth-36'));
    act(() => first.result.current[1]('Nota clínica pendiente'));
    first.unmount();
    setSessionDraftOwner(null);
    setSessionDraftOwner(user);
    const restored = renderHook(() => useSessionDraft('patient-1:tooth-36'));
    expect(restored.result.current[0]).toBe('Nota clínica pendiente');
    expect(renderHook(() => useSessionDraft('patient-2:tooth-36')).result.current[0]).toBe('');
    act(() => restored.result.current[1](''));
    restored.unmount();
    expect(renderHook(() => useSessionDraft('patient-1:tooth-36')).result.current[0]).toBe('');
  });

  it.each([{ id: 'doctor-2', clinica_id: 'clinic-1' }, { id: 'doctor-1', clinica_id: 'clinic-2' }])('discards drafts for another identity %j', (otherUser) => {
    setSessionDraftOwner(user);
    const first = renderHook(() => useSessionDraft('patient-1'));
    act(() => first.result.current[1]('Privado'));
    first.unmount();
    setSessionDraftOwner(otherUser);
    expect(renderHook(() => useSessionDraft('patient-1')).result.current[0]).toBe('');
    act(() => setSessionDraftOwner(user));
    expect(renderHook(() => useSessionDraft('patient-1')).result.current[0]).toBe('');
  });

  it('discards drafts on explicit logout and after 30 minutes', () => {
    vi.useFakeTimers();
    setSessionDraftOwner(user);
    const first = renderHook(() => useSessionDraft('patient-1'));
    act(() => first.result.current[1]('Caduca'));
    first.unmount();
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    const expired = renderHook(() => useSessionDraft('patient-1'));
    expect(expired.result.current[0]).toBe('');
    act(() => expired.result.current[1]('Nuevo borrador'));
    expired.unmount();
    clearSessionDrafts();
    setSessionDraftOwner(user);
    expect(renderHook(() => useSessionDraft('patient-1')).result.current[0]).toBe('');
  });
});
