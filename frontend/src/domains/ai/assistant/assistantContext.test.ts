import { describe, expect, it } from 'vitest';
import { buildAssistantContext } from './assistantContext';

describe('assistant workspace context', () => {
  it.each([
    ['/jornada', '', 'today'],
    ['/jornada', '?vista=agenda', 'schedule'],
    ['/registros', '', 'reports'],
    ['/archivos', '', 'reports'],
    ['/administracion', '', 'admin'],
    ['/ajustes', '', 'admin'],
    ['/agenda', '', 'schedule'],
  ])('recognizes %s%s', (path, search, screen) => {
    expect(buildAssistantContext(path, null, search).screen).toBe(screen);
  });
});
