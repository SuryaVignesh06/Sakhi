import React from 'react';

export const Message: React.FC<{ from: 'user' | 'assistant'; children: React.ReactNode }> = ({ from, children }) => (
  <div className={`flex w-full ${from === 'user' ? 'justify-end' : 'justify-start'} mb-4 gap-2`}>
    <div className={`max-w-[80%] flex ${from === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
      {children}
    </div>
  </div>
);

export const MessageContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col gap-1 w-full">{children}</div>
);
