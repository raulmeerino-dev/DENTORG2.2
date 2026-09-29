/** Keeps a workspace's visual structure while its code or initial data loads. */
export function WorkspaceLoading({ label = 'Cargando módulo…' }: { label?: string }) {
  return <section className="dc-workspace-loading" role="status" aria-label={label}>
    <span>{label}</span>
    <div className="dc-workspace-skeleton" aria-hidden="true">
      <div />
      <div />
      <div />
      <div />
      <div />
    </div>
  </section>;
}
