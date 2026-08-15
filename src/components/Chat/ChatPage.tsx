import React from 'react';
import { useChat } from './hooks/useChat';
import { useStreaming } from './hooks/useStreaming';
import { useModelSelector } from './hooks/useModelSelector';
import { ChatHeader } from './ChatHeader';
import { ModelSelector } from './ModelSelector';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { StatusBar } from './StatusBar';
import './ChatPage.css';

interface ChatPageProps {
  onOpenSettings?: () => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenSettings }) => {
  const {
    messages,
    chatInput,
    setChatInput,
    attachments,
    addAttachment,
    removeAttachment,
    webSearchEnabled,
    setWebSearchEnabled,
    sendMessage,
  } = useChat();

  const {
    thinkingState,
    activeTools,
    voiceState,
    isGenerating,
    connectionStatus,
  } = useStreaming();

  const {
    isOpen: isModelSelectorOpen,
    setIsOpen: setIsModelSelectorOpen,
    activeProvider,
    setActiveProvider,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    models,
    isLoading: isModelsLoading,
    error: modelsError,
    isBlocked,
    selectedModel,
    selectModel,
    refresh: refreshModels,
    localStats,
  } = useModelSelector();

  const handleSendMessage = () => {
    sendMessage();
  };

  const handleSelectPrompt = (promptText: string) => {
    setChatInput(promptText);
    sendMessage(promptText);
  };

  return (
    <div className="chat-page-root-v2">
      {/* Top Header */}
      <ChatHeader
        selectedModel={selectedModel}
        onOpenModelSelector={() => setIsModelSelectorOpen(true)}
        connectionStatus={connectionStatus}
        voiceState={voiceState}
        onOpenSettings={onOpenSettings}
        isGenerating={isGenerating}
      />

      {/* Model Selector Floating Modal */}
      <ModelSelector
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        activeProvider={activeProvider}
        setActiveProvider={setActiveProvider}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        models={models}
        isLoading={isModelsLoading}
        error={modelsError}
        isBlocked={isBlocked}
        selectedModel={selectedModel}
        onSelectModel={selectModel}
        onRefresh={refreshModels}
        localStats={localStats}
      />

      {/* Message Stream Area */}
      <main className="chat-main-area-v2">
        <MessageList
          messages={messages}
          thinkingState={thinkingState}
          activeTools={activeTools}
          selectedModel={selectedModel}
          onSelectPrompt={handleSelectPrompt}
          onRegenerateMessage={text => sendMessage(`Regenerate: ${text}`)}
        />
      </main>

      {/* Bottom Composer Bar */}
      <footer className="chat-composer-footer-v2">
        <Composer
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSendMessage={handleSendMessage}
          attachments={attachments}
          onAddAttachment={addAttachment}
          onRemoveAttachment={removeAttachment}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={setWebSearchEnabled}
          voiceState={voiceState}
        />
      </footer>

      {/* System Status Bar */}
      <StatusBar activeModelName={selectedModel.name} isGenerating={isGenerating} />
    </div>
  );
};

export default ChatPage;
