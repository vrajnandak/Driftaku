import React, { useState, useEffect } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

// ---------------------------------------------------------------------------
// 1. THE TRIGGER FUNCTION (Export this to use anywhere in your app)
// ---------------------------------------------------------------------------
export const toast = (message: string, type: ToastType = 'info', duration: number = 4000) => {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('driftaku-toast', {
      detail: { id: Math.random().toString(36).substring(2, 9), message, type, duration }
    });
    window.dispatchEvent(event);
  }
};

// ---------------------------------------------------------------------------
// 2. THE UI CONTAINER (Mount this once in your Layout or main Client component)
// ---------------------------------------------------------------------------
export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastMessage>;
      const newToast = customEvent.detail;
      
      setToasts((prev) => [...prev, newToast]);

      // Auto-remove after duration
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, newToast.duration);
    };

    window.addEventListener('driftaku-toast', handleToast);
    return () => window.removeEventListener('driftaku-toast', handleToast);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getStyleForType = (type: ToastType) => {
    switch (type) {
      case 'success': return { border: 'border-emerald-500/50', icon: 'text-emerald-400', bg: 'bg-emerald-500/10' };
      case 'error': return { border: 'border-rose-500/50', icon: 'text-rose-400', bg: 'bg-rose-500/10' };
      case 'warning': return { border: 'border-amber-500/50', icon: 'text-amber-400', bg: 'bg-amber-500/10' };
      default: return { border: 'border-indigo-500/50', icon: 'text-indigo-400', bg: 'bg-indigo-500/10' };
    }
  };

  if (toasts.length === 0) return null;

  return (
    // Wrapper: Fixed to bottom-right, scrollable if there are too many, pointer-events-none so users can click the canvas behind it
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-h-[50vh] overflow-y-auto no-scrollbar pointer-events-none p-2 w-80">
      {toasts.map((t) => {
        const styles = getStyleForType(t.type);
        return (
          // Individual Toast: Pointer-events-auto so it can be clicked/closed
          <div 
            key={t.id} 
            className={`pointer-events-auto flex items-start gap-3 bg-slate-900/95 backdrop-blur-xl border ${styles.border} p-4 rounded-2xl shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5`}
          >
            <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${styles.bg} ${styles.icon}`}>
              {t.type === 'success' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
              {t.type === 'error' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>}
              {t.type === 'warning' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
              {t.type === 'info' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white leading-relaxed">{t.message}</p>
            </div>

            <button 
              onClick={() => removeToast(t.id)} 
              className="shrink-0 text-slate-500 hover:text-white transition-colors p-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        );
      })}
    </div>
  );
};