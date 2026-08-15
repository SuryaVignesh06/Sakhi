import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronRight, Clipboard, Download, FileText, Folder,
  Globe, Link2, MoreHorizontal, Plus, Settings, Terminal, Upload, X,
} from 'lucide-react';
import './PlusMenu.css';

/**
 * The "+" menu. Six entries, deliberately.
 *
 * Anything context-aware (screen capture, quick note, ask-about-screen) belongs
 * to the Floating Assistant Panel, not here — duplicating them across both
 * surfaces is what makes these menus rot. This one only adds input to the
 * current conversation.
 */

export interface Attachment {
  id: string;
  kind: 'file' | 'folder' | 'image' | 'text' | 'url' | 'code';
  name: string;
  size?: number;
  /** Object URL for previews; revoked when the attachment is removed. */
  preview?: string;
  file?: File;
  text?: string;
}

type Panel = 'root' | 'apps' | 'more';

const APP_CATEGORIES: { label: string; apps: string[] }[] = [
  { label: 'Development', apps: ['GitHub', 'GitLab', 'Bitbucket', 'VS Code', 'Cursor', 'Claude Code', 'Windsurf'] },
  { label: 'Storage', apps: ['Google Drive', 'OneDrive', 'Dropbox', 'Box', 'iCloud'] },
  { label: 'Productivity', apps: ['Notion', 'Obsidian', 'Todoist', 'Trello', 'Jira', 'Linear', 'ClickUp'] },
  { label: 'Communication', apps: ['Slack', 'Discord', 'Microsoft Teams', 'Gmail', 'Outlook'] },
  { label: 'Calendar', apps: ['Google Calendar', 'Outlook Calendar'] },
  { label: 'AI', apps: ['OpenAI', 'Gemini', 'Anthropic', 'OpenRouter', 'Ollama', 'LM Studio'] },
];

const MORE_ITEMS: { label: string; icon: typeof Download }[] = [
  { label: 'Export Chat', icon: Download },
  { label: 'Import Chat', icon: Upload },
  { label: 'Export Conversation', icon: Download },
  { label: 'Import Workspace', icon: Upload },
  { label: 'Create Workspace', icon: Plus },
  { label: 'Open Recent Workspace', icon: Folder },
  { label: 'Settings', icon: Settings },
  { label: 'Developer Tools', icon: Terminal },
];

export default function PlusMenu({
  onAttach,
  webSearch,
  onToggleWebSearch,
  onOpenSettings,
}: {
  onAttach: (a: Attachment[]) => void;
  webSearch: boolean;
  onToggleWebSearch: (on: boolean) => void;
  onOpenSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('root');
  const [note, setNote] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPanel('root');
    setNote(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const kindOf = (f: File): Attachment['kind'] => {
    if (f.type.startsWith('image/')) return 'image';
    if (/\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|css|html|json|sh)$/i.test(f.name)) return 'code';
    return 'file';
  };

  const takeFiles = (list: FileList | null, asFolder = false) => {
    if (!list?.length) return;
    const items: Attachment[] = [...list].map((f) => ({
      id: crypto.randomUUID(),
      kind: asFolder ? 'folder' : kindOf(f),
      // webkitRelativePath is what makes a folder pick readable.
      name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      size: f.size,
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }));
    onAttach(items);
    close();
  };

  /**
   * Reads the clipboard and decides what it is — the user never picks a type.
   * Falls back to plain text when the async Clipboard API is unavailable or
   * permission is refused, which is common outside a secure context.
   */
  const pasteClipboard = async () => {
    setNote('Reading clipboard…');
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        const out: Attachment[] = [];

        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], `clipboard.${imageType.split('/')[1] || 'png'}`, { type: imageType });
            out.push({
              id: crypto.randomUUID(),
              kind: 'image',
              name: file.name,
              size: file.size,
              file,
              preview: URL.createObjectURL(blob),
            });
            continue;
          }
          if (item.types.includes('text/plain')) {
            const text = await (await item.getType('text/plain')).text();
            if (!text.trim()) continue;
            const isUrl = /^https?:\/\/\S+$/i.test(text.trim());
            const looksLikeCode = /[{};=]|^\s*(function|const|class|def|import)\b/m.test(text);
            out.push({
              id: crypto.randomUUID(),
              kind: isUrl ? 'url' : looksLikeCode ? 'code' : 'text',
              name: isUrl ? text.trim() : `Pasted ${looksLikeCode ? 'code' : 'text'}`,
              text,
            });
          }
        }

        if (out.length) {
          onAttach(out);
          close();
          return;
        }
      }

      const text = await navigator.clipboard?.readText?.();
      if (text?.trim()) {
        onAttach([{ id: crypto.randomUUID(), kind: 'text', name: 'Pasted text', text }]);
        close();
      } else {
        setNote('Clipboard is empty.');
      }
    } catch (e) {
      setNote(`Clipboard unavailable — ${(e as Error).message}`);
    }
  };

  return (
    /* The composer wraps this and focuses its textarea on any click, which
       switches views and remounts the menu before it can open. Containing the
       events here keeps the menu independent of that behaviour. */
    <div
      className="pm-root"
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        className={`pm-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add to conversation"
        title="Add to conversation"
        type="button"
      >
        <Plus size={17} strokeWidth={2.2} />
      </button>

      {webSearch && (
        <span className="pm-chip">
          <Globe size={12} />
          Web Search Enabled
          <button onClick={() => onToggleWebSearch(false)} aria-label="Disable web search" type="button">
            <X size={11} />
          </button>
        </span>
      )}

      {open && (
        <div className="pm-pop" role="menu">
          {panel === 'root' && (
            <>
              <button className="pm-item" role="menuitem" onClick={() => fileRef.current?.click()}>
                <FileText size={15} /> <span>Upload File</span>
              </button>
              <button className="pm-item" role="menuitem" onClick={() => folderRef.current?.click()}>
                <Folder size={15} /> <span>Upload Folder</span>
              </button>
              <button
                className={`pm-item ${webSearch ? 'is-on' : ''}`}
                role="menuitem"
                onClick={() => { onToggleWebSearch(!webSearch); close(); }}
              >
                <Globe size={15} /> <span>Web Search</span>
                {webSearch && <Check size={14} className="pm-tick" />}
              </button>
              <button className="pm-item" role="menuitem" onClick={pasteClipboard}>
                <Clipboard size={15} /> <span>Paste Clipboard</span>
              </button>
              <button className="pm-item" role="menuitem" onClick={() => setPanel('apps')}>
                <Link2 size={15} /> <span>Connect Apps</span>
                <ChevronRight size={14} className="pm-more" />
              </button>
              <button className="pm-item" role="menuitem" onClick={() => setPanel('more')}>
                <MoreHorizontal size={15} /> <span>More</span>
                <ChevronRight size={14} className="pm-more" />
              </button>
              {note && <div className="pm-note">{note}</div>}
            </>
          )}

          {panel === 'apps' && (
            <>
              <div className="pm-head">
                <button onClick={() => setPanel('root')} aria-label="Back" type="button"><ArrowLeft size={14} /></button>
                <span>Connect Apps</span>
              </div>
              <div className="pm-scroll">
                {APP_CATEGORIES.map((cat) => (
                  <div key={cat.label} className="pm-cat">
                    <div className="pm-cat-label">{cat.label}</div>
                    {cat.apps.map((app) => (
                      <button key={app} className="pm-app" type="button" disabled title="Integrations are not wired yet">
                        <span className="pm-app-dot" />
                        <span className="pm-app-name">{app}</span>
                        <span className="pm-app-state">Not connected</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="pm-note">
                Integrations need OAuth and a backend callback — none are connected yet.
              </div>
            </>
          )}

          {panel === 'more' && (
            <>
              <div className="pm-head">
                <button onClick={() => setPanel('root')} aria-label="Back" type="button"><ArrowLeft size={14} /></button>
                <span>More</span>
              </div>
              {MORE_ITEMS.map(({ label, icon: Icon }) => {
                const wired = label === 'Settings';
                return (
                  <button
                    key={label}
                    className="pm-item"
                    role="menuitem"
                    disabled={!wired}
                    title={wired ? undefined : 'Not implemented yet'}
                    onClick={() => { if (wired) { onOpenSettings?.(); close(); } }}
                  >
                    <Icon size={15} /> <span>{label}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => { takeFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={folderRef}
        type="file"
        hidden
        multiple
        // Non-standard but supported everywhere this app runs.
        {...{ webkitdirectory: '', directory: '' } as Record<string, string>}
        onChange={(e) => { takeFiles(e.target.files, true); e.target.value = ''; }}
      />
    </div>
  );
}
