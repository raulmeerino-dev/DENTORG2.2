import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_PREFERENCE_KEY, useSidebarPreference } from './useSidebarPreference';

beforeEach(() => localStorage.clear());
describe('sidebar preference', () => {
  it('restores the saved choice on a new application mount', () => {
    const first = renderHook(useSidebarPreference);
    act(() => first.result.current[1](true));
    expect(localStorage.getItem(SIDEBAR_PREFERENCE_KEY)).toBe('true');
    first.unmount();
    const reopened = renderHook(useSidebarPreference);
    expect(reopened.result.current[0]).toBe(true);
    act(() => reopened.result.current[1](false));
    expect(localStorage.getItem(SIDEBAR_PREFERENCE_KEY)).toBe('false');
  });
  it('works in memory when persistence is blocked', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    try {
      const hook = renderHook(useSidebarPreference);
      act(() => hook.result.current[1](true));
      expect(hook.result.current[0]).toBe(true);
      act(() => hook.result.current[1](false));
      expect(hook.result.current[0]).toBe(false);
    } finally { read.mockRestore(); write.mockRestore(); }
  });
});
