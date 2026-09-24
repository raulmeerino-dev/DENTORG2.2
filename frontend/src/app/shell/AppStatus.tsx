import { useIsFetching, useIsMutating } from '@tanstack/react-query';

export default function AppStatus() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = fetching + mutating;

  return (
    <div className={`app-status ${busy ? 'is-busy' : ''}`} aria-live="polite">
      <span>{busy ? 'Sincronizando cambios' : 'Sistema listo'}</span>
      {busy > 0 && <i aria-hidden="true" />}
    </div>
  );
}
