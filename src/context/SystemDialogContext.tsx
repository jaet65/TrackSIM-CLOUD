import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

export interface SystemDialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  inputLabel?: string;
  placeholder?: string;
}

interface DialogBase {
  id: number;
  message: string;
  options: SystemDialogOptions;
}

type DialogRequest =
  | (DialogBase & { type: 'alert'; resolve: () => void })
  | (DialogBase & { type: 'confirm'; resolve: (confirmed: boolean) => void })
  | (DialogBase & { type: 'prompt'; resolve: (value: string | null) => void });

interface SystemDialogApi {
  showAlert: (message: string, options?: SystemDialogOptions) => Promise<void>;
  showConfirm: (message: string, options?: SystemDialogOptions) => Promise<boolean>;
  showPrompt: (message: string, options?: SystemDialogOptions) => Promise<string | null>;
}

const SystemDialogContext = createContext<SystemDialogApi | null>(null);

export const SystemDialogProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [activeDialog, setActiveDialog] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const dialogQueue = useRef<DialogRequest[]>([]);
  const activeDialogRef = useRef<DialogRequest | null>(null);
  const nextId = useRef(0);
  const promptRef = useRef<HTMLInputElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const enqueue = useCallback((request: DialogRequest) => {
    if (activeDialogRef.current) {
      dialogQueue.current.push(request);
      return;
    }

    activeDialogRef.current = request;
    setActiveDialog(request);
  }, []);

  const showAlert = useCallback((message: string, options: SystemDialogOptions = {}) =>
    new Promise<void>((resolve) => {
      enqueue({ id: nextId.current++, type: 'alert', message, options, resolve });
    }), [enqueue]);

  const showConfirm = useCallback((message: string, options: SystemDialogOptions = {}) =>
    new Promise<boolean>((resolve) => {
      enqueue({ id: nextId.current++, type: 'confirm', message, options, resolve });
    }), [enqueue]);

  const showPrompt = useCallback((message: string, options: SystemDialogOptions = {}) =>
    new Promise<string | null>((resolve) => {
      enqueue({ id: nextId.current++, type: 'prompt', message, options, resolve });
    }), [enqueue]);

  const finishDialog = (confirmed: boolean) => {
    const current = activeDialogRef.current;
    if (!current) return;

    if (current.type === 'alert') current.resolve();
    else if (current.type === 'confirm') current.resolve(confirmed);
    else current.resolve(confirmed ? promptValue : null);

    const next = dialogQueue.current.shift() || null;
    activeDialogRef.current = next;
    setActiveDialog(next);
  };

  useEffect(() => {
    if (!activeDialog) return;

    setPromptValue('');
    const focusTarget = activeDialog.type === 'prompt' ? promptRef.current : primaryButtonRef.current;
    focusTarget?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeDialog?.id]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finishDialog(false);
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      finishDialog(true);
    } else if (event.key === 'Tab' && dialogRef.current) {
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const api = useMemo(() => ({ showAlert, showConfirm, showPrompt }), [showAlert, showConfirm, showPrompt]);
  const isPrompt = activeDialog?.type === 'prompt';
  const title = activeDialog?.options.title ||
    (activeDialog?.type === 'confirm' ? 'Confirmar acción' : activeDialog?.type === 'prompt' ? 'Confirmación requerida' : 'Aviso');

  return (
    <SystemDialogContext.Provider value={api}>
      {children}
      {activeDialog && (
        <div
          className="modal-overlay active"
          onClick={(event) => {
            if (event.target === event.currentTarget) finishDialog(false);
          }}
          style={{ zIndex: 3000, background: 'rgba(2, 6, 23, 0.72)', backdropFilter: 'blur(5px)' }}
        >
          <div
            key={activeDialog.id}
            ref={dialogRef}
            className="modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`system-dialog-title-${activeDialog.id}`}
            aria-describedby={`system-dialog-message-${activeDialog.id}`}
            onKeyDown={handleKeyDown}
            style={{
              width: 'min(92vw, 520px)',
              padding: '1.5rem',
              transform: 'scale(1)',
              borderColor: activeDialog.options.destructive ? 'var(--danger-border)' : 'var(--border-subtle)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 2.5rem',
                  height: '2.5rem',
                  borderRadius: '50%',
                  color: activeDialog.options.destructive ? 'var(--danger)' : 'var(--primary)',
                  background: activeDialog.options.destructive ? 'var(--danger-bg)' : 'var(--primary-glow)',
                  fontSize: '1.15rem'
                }}
              >
                {activeDialog.options.destructive ? '!' : activeDialog.type === 'alert' ? 'i' : '?'}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2
                  id={`system-dialog-title-${activeDialog.id}`}
                  style={{ margin: '0.25rem 0 0.65rem', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}
                >
                  {title}
                </h2>
                <div
                  id={`system-dialog-message-${activeDialog.id}`}
                  style={{ color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
                >
                  {activeDialog.message}
                </div>
                {isPrompt && (
                  <label style={{ display: 'block', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {activeDialog.options.inputLabel || 'Escribe el texto solicitado'}
                    <input
                      ref={promptRef}
                      autoComplete="off"
                      value={promptValue}
                      placeholder={activeDialog.options.placeholder}
                      onChange={(event) => setPromptValue(event.currentTarget.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.4rem',
                        padding: '0.7rem 0.8rem',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-main)'
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.5rem' }}>
              {activeDialog.type !== 'alert' && (
                <button type="button" className="btn btn-secondary" onClick={() => finishDialog(false)}>
                  {activeDialog.options.cancelLabel || 'Cancelar'}
                </button>
              )}
              <button
                ref={primaryButtonRef}
                type="button"
                className={activeDialog.options.destructive ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => finishDialog(true)}
              >
                {activeDialog.options.confirmLabel || (activeDialog.type === 'alert' ? 'Entendido' : 'Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </SystemDialogContext.Provider>
  );
};

export function useSystemDialogs(): SystemDialogApi {
  const context = useContext(SystemDialogContext);
  if (!context) throw new Error('useSystemDialogs debe usarse dentro de SystemDialogProvider.');
  return context;
}
