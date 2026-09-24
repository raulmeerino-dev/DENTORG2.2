import { useId, type HTMLAttributes, type ReactNode } from 'react';

type ToolbarProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
};

export function Toolbar({ title, context, actions, children, className = '', ...props }: ToolbarProps) {
  const titleId = useId();
  return (
    <header className={`dc-toolbar ${className}`.trim()} aria-labelledby={title ? titleId : undefined} {...props}>
      {(title || context) && <div className="dc-toolbar-heading">
        {title && <h1 id={titleId} className="dc-toolbar-title">{title}</h1>}
        {context && <div className="dc-toolbar-context">{context}</div>}
      </div>}
      {children && <div className="dc-toolbar-content">{children}</div>}
      {actions && <div className="dc-toolbar-actions">{actions}</div>}
    </header>
  );
}
