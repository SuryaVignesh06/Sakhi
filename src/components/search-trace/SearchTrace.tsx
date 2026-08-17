import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { FaviconCarousel } from './FaviconCarousel';
import type { CrawlState } from '../../events';
import './SearchTrace.css';

export const SearchTrace = ({ crawl }: { crawl: CrawlState }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (crawl.phase === 'searching' || crawl.phase === 'fetching') {
      setMounted(true);
    }
  }, [crawl.phase]);

  if (!mounted || crawl.mode !== 'online') return null;

  return (
    <div className={`search-trace-container ${crawl.phase === 'complete' ? 'is-exiting' : ''}`}>
      <div className="search-trace-query">
        <Search size={14} className="search-trace-icon" />
        <span className="search-trace-text" key={crawl.query}>
          {crawl.query || 'Searching...'}
        </span>
      </div>
      
      {crawl.phase === 'fetching' && (
        <FaviconCarousel sources={crawl.sources} phase={crawl.phase} />
      )}
    </div>
  );
};
