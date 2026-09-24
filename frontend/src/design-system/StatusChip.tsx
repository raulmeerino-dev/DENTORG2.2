import type { HTMLAttributes, ReactNode } from 'react';

type StatusChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
};

export function StatusChip({ tone = 'neutral', icon, children, className = '', ...props }: StatusChipProps) {
  return <span className={`dc-status-chip ${className}`.trim()} data-tone={tone} {...props}>
    {icon && <span aria-hidden="true">{icon}</span>}{children}
  </span>;
}
