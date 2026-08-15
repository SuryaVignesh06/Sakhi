import React from 'react';

export const Response: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 py-2 rounded-2xl bg-muted/50 border shadow-sm text-sm whitespace-pre-wrap">
    {children}
  </div>
);
