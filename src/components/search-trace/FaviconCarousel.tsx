import React from 'react';
import type { FetchedSource } from '../../events';
import { AlertCircle } from 'lucide-react';

export const FaviconCarousel = ({ sources, phase }: { sources: FetchedSource[], phase: string }) => {
  const visible = sources.slice(0, 5);
  const extra = sources.length > 5 ? sources.length - 5 : 0;

  return (
    <div className="search-trace-carousel">
      {visible.map((src, i) => (
        <div 
          key={src.id} 
          className={`favicon-chip ${phase === 'complete' ? 'is-exiting' : 'is-entering'}`}
          style={{ '--stagger': i } as React.CSSProperties}
        >
          <img src={src.favicon_url} alt={src.domain} className="favicon-img" />
          {src.success === false && (
            <div className="favicon-error-badge">
              <AlertCircle size={10} />
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className={`favicon-chip favicon-extra ${phase === 'complete' ? 'is-exiting' : 'is-entering'}`} style={{ '--stagger': 5 } as React.CSSProperties}>
          +{extra}
        </div>
      )}
    </div>
  );
};
