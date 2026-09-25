import type { HTMLAttributes } from 'react';
import './action-group.css';

/** Shared geometry and stable interaction states from the patient toolbar. */
export function ActionGroup({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`patient-actions-primary ${className}`.trim()} {...props} />;
}
