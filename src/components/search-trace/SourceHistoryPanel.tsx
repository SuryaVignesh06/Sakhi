import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FetchedSource } from '../../events';

export const SourceHistoryPanel = ({ sources }: { sources: FetchedSource[] }) => {
  const [open, setOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  const visibleFavicons = sources.slice(0, 5);
  const successCount = sources.filter(s => s.success !== false).length;

  return (
    <div className="source-history-panel">
      <button className="source-history-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="source-history-stack">
          {visibleFavicons.map((s, i) => (
            <img key={s.id} src={s.favicon_url} alt="" className="source-history-stack-img" style={{ zIndex: 10 - i }} />
          ))}
        </div>
        <span className="source-history-label">
          {successCount === 0 ? 'Search attempted — no sources retrieved' : `Searched ${sources.length} source${sources.length !== 1 ? 's' : ''}`}
        </span>
        <ChevronDown size={14} className={`source-history-chev ${open ? 'is-open' : ''}`} />
      </button>

      {open && (
        <div className="source-history-list">
          {sources.map((s, i) => (
            <div key={s.id} className="source-history-item" style={{ '--stagger': i } as React.CSSProperties}>
              <span className="source-history-idx">{i + 1}</span>
              <img src={s.favicon_url} alt="" className="source-history-item-favicon" />
              {s.success === false ? (
                <span className="source-history-item-failed">Could not retrieve this source</span>
              ) : (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="source-history-item-link">
                  <span className="source-history-item-title">{s.url.replace(/^https?:\/\//, '')}</span>
                  <span className="source-history-item-domain">{s.domain}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
