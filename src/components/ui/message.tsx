import React from 'react';

export interface MessageProps {
  from: 'user' | 'assistant';
  children: React.ReactNode;
  className?: string;
}

export const Message: React.FC<MessageProps> = ({ from, children, className = '' }) => {
  const isUser = from === 'user';
  return (
    <div
      className={`msg-row ${className}`}
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '16px',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isUser ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
          gap: '12px',
          maxWidth: isUser ? '75%' : '90%',
          width: isUser ? 'auto' : '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export interface MessageAvatarProps {
  src?: string;
  name?: string;
  fallback?: string;
}

export const MessageAvatar: React.FC<MessageAvatarProps> = ({ src, name, fallback }) => {
  if (!src && !name && !fallback) return null;
  return (
    <div
      style={{
        width: '32px',
        height: '32px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        color: 'var(--text-primary)',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      {src ? (
        <img src={src} alt={name || 'Avatar'} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'var(--logo-filter)' }} />
      ) : (
        <span>{fallback || (name ? name.substring(0, 2).toUpperCase() : 'AI')}</span>
      )}
    </div>
  );
};

export interface MessageContentProps {
  children: React.ReactNode;
  variant?: 'contained' | 'flat';
  from?: 'user' | 'assistant';
}

export const MessageContent: React.FC<MessageContentProps> = ({ children, variant, from = 'assistant' }) => {
  const isUser = from === 'user';
  const mode = variant || (isUser ? 'contained' : 'flat');

  /* Every colour here came from the dark palette as a literal — white fills,
     white hairlines, near-white text. Inline styles beat every stylesheet in
     the app, so the light-mode sweep in index.css could not reach them and
     the whole thread rendered white-on-white. They are tokens now.

     `backdrop-filter` is also gone: these bubbles sit over an animated WebGL
     canvas, so each one asked the compositor to re-blur its slice of a
     surface that changes every frame. A flat tinted fill is indistinguishable
     here and costs nothing. */
  const containedStyles: React.CSSProperties = {
    background: isUser ? 'rgba(var(--ink), 0.08)' : 'rgba(var(--ink), 0.05)',
    border: '1px solid rgba(var(--ink), 0.12)',
    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
    padding: '12px 18px',
    boxShadow: '0 2px 10px rgba(var(--shadow), 0.16)',
    color: 'var(--text-primary)',
  };

  const flatStyles: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    padding: '0',
    color: 'var(--text-primary)',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        fontSize: '14.5px',
        lineHeight: '1.6',
        ...(mode === 'contained' ? containedStyles : flatStyles),
      }}
    >
      {children}
    </div>
  );
};

