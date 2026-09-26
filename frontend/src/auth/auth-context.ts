import { createContext, useContext } from 'react';

type AuthState = {
  isAuthenticated: boolean;
  user: string;
  login: (user: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const Ctx = createContext<AuthState>(null as never);

export const useAuth = () => useContext(Ctx);
