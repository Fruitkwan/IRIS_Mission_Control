import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { tokenStore } from './token';
import { axios } from '../api/axios-instance';

type AuthState = {
  isAuthenticated: boolean;
  user: string;
  login: (user: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null as never);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useSyncExternalStore(
    (cb) => tokenStore.subscribe(cb),
    () => tokenStore.accessToken,
  );

  const login = useCallback(async (user: string, password: string) => {
    const { data } = await axios.post('/login', { user, password });
    const result = data?.result ?? data;
    if (!result?.access_token) throw new Error('No access token in response');
    tokenStore.set(result.access_token, result.refresh_token ?? '', result.sub ?? user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post('/logout');
    } finally {
      tokenStore.clear();
    }
  }, []);

  return (
    <Ctx.Provider
      value={{ isAuthenticated: tokenStore.isAuthenticated, user: tokenStore.user, login, logout }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
