import React from 'react';

export const Conversation: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col h-full w-full overflow-hidden bg-background relative">{children}</div>
);

export const ConversationContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">{children}</div>
);

export const ConversationEmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground opacity-50">
    {icon}
    <h3 className="mt-4 text-lg font-semibold">{title}</h3>
    <p className="text-sm">{description}</p>
  </div>
);

export const ConversationScrollButton: React.FC = () => (
  <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
    {/* Optional scroll to bottom button */}
  </div>
);
