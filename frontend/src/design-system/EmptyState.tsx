import type { HTMLAttributes, ReactNode } from 'react';

type EmptyStateProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, action, className = '', ...props }: EmptyStateProps) {
  return <section className={`dc-empty-state ${className}`.trim()} {...props}>
    <h2>{title}</h2>
    {description && <p>{description}</p>}
    {action && <div className="dc-empty-state-action">{action}</div>}
  </section>;
}
