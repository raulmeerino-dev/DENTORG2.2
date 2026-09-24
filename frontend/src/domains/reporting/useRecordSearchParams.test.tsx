import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useRecordSearchParams } from './useRecordSearchParams';

function Filters() {
  const { searchParams, updateSearch } = useRecordSearchParams();
  const navigate = useNavigate();
  return <><output>{searchParams.toString()}</output><button onClick={() => {
    updateSearch(current => { current.set('paciente_id', 'p1'); return current; });
    updateSearch(current => { current.set('tipo', 'radiografia'); return current; });
  }}>Cambios consecutivos</button><button onClick={() => navigate(-1)}>Volver</button></>;
}

describe('queued record filters', () => {
  it('merges consecutive changes before router commit and respects browser back', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/archivos?vista=documentos']}><Filters /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Cambios consecutivos' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('vista=documentos&paciente_id=p1&tipo=radiografia'));
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('vista=documentos&paciente_id=p1'));
  });
});
