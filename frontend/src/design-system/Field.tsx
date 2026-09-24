import { cloneElement, useId, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';

type FieldControl = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' };
type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement<FieldControl>;
};

export function Field({ label, hint, error, children, className = '', ...props }: FieldProps) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const describedBy = [children.props['aria-describedby'], (error || hint) ? descriptionId : undefined].filter(Boolean).join(' ') || undefined;
  return <div className={`dc-field ${className}`.trim()} {...props}>
    <label htmlFor={controlId}>{label}</label>
    {cloneElement(children, { id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : children.props['aria-invalid'] })}
    {(error || hint) && <p id={descriptionId} className={error ? 'dc-field-error' : 'dc-field-hint'}>{error || hint}</p>}
  </div>;
}
