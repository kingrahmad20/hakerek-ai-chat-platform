"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastType = "success" | "error";

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

function Toast({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
    const [visible, setVisible] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        const show = setTimeout(() => setVisible(true), 10);
        const hide = setTimeout(() => setVisible(false), 3600);
        timerRef.current = setTimeout(() => onRemove(item.id), 4000);
        return () => {
            clearTimeout(show);
            clearTimeout(hide);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [item.id, onRemove]);

    return (
        <div
            className={`
                flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm
                backdrop-blur-sm bg-gray-900/95
                transition-all duration-300 ease-out min-w-64 max-w-sm
                ${visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}
                ${item.type === "success" ? "border-green-600/40" : "border-red-600/40"}
            `}
        >
            {item.type === "success"
                ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                : <XCircle size={16} className="text-red-400 shrink-0" />
            }
            <span className="text-gray-200 flex-1 leading-snug">{item.message}</span>
            <button
                onClick={() => { setVisible(false); setTimeout(() => onRemove(item.id), 300); }}
                className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 ml-1"
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const toast = useCallback((message: string, type: ToastType = "success") => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const remove = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className="pointer-events-auto">
                        <Toast item={t} onRemove={remove} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
