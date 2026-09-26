import { createContext, useContext } from 'react';

type ToastCtx = { toast: (kind: 'ok' | 'err', text: string) => void };

export const Ctx = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(Ctx);
