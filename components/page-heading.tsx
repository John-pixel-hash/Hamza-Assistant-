import type { ReactNode } from 'react';

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="page-heading-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="h1 page-heading-title">{title}</h1>
        {description && <div className="page-heading-description">{description}</div>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </header>
  );
}
