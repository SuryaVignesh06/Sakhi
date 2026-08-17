import React, { useState } from 'react';
import { Database, ChevronDown } from 'lucide-react';
import type { FetchedSource } from '../../events';

export const LocalMemoryIndicator = ({ totalSources, offlineSources }: { totalSources: number, offlineSources: string[] }) => {
  const [open, setOpen] = useState(false);

  // Re-use same list structure but without favicons since we only have URLs
  return (
    <div className="source-history-panel">
      <button className="source-history-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Database size={14} className="local-memory-icon" />
        <span className="source-history-label">
          {totalSources === 0 ? 'No saved sources matched this question' : `Answered from ${totalSources} saved source${totalSources !== 1 ? 's' : ''}`}
        </span>
        {totalSources > 0 && <ChevronDown size={14} className={`source-history-chev ${open ? 'is-open' : ''}`} />}
      </button>

      {open && totalSources > 0 && (
        <div className="source-history-list">
          {offlineSources.map((url, i) => {
            const domain = new URL(url).hostname;
            return (
              <div key={url} className="source-history-item" style={{ '--stagger': i } as React.CSSProperties}>
                <span className="source-history-idx">{i + 1}</span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="source-history-item-link">
                  <span className="source-history-item-title">{url.replace(/^https?:\/\//, '')}</span>
                  <span className="source-history-item-domain">{domain}</span>
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
