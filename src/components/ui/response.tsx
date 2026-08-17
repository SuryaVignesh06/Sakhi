import React from 'react';

/**
 * The shell around a rendered answer.
 *
 * This used to be a div carrying Tailwind utilities — `px-4 py-2 rounded-2xl
 * bg-muted/50 border shadow-sm text-sm whitespace-pre-wrap`. Tailwind is not
 * installed in this project, so none of them resolved to anything and the
 * element was an unstyled box. The one that would have mattered most,
 * `whitespace-pre-wrap`, is also wrong for markdown output: the renderer
 * already emits block elements, so preserving the source newlines on top of
 * them doubles every gap. It is kept only for `variant="user"`, where the
 * text is quoted verbatim rather than parsed.
 */
export const Response: React.FC<{
  children: React.ReactNode;
  variant?: 'markdown' | 'user';
  className?: string;
}> = ({ children, variant = 'markdown', className = '' }) => (
  <div
    className={`md-response ${variant === 'user' ? 'md-response--user' : ''} ${className}`.trim()}
  >
    {children}
  </div>
);

export default Response;
