// Module-level token holder so the axios interceptor can access tokens
// without importing the React store (avoids circular imports with codegen).
const LS_KEY = 'irisops.auth';

type Stored = { accessToken: string; refreshToken: string; user: string };

function load(): Stored {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') ?? { accessToken: '', refreshToken: '', user: '' };
  } catch {
    return { accessToken: '', refreshToken: '', user: '' };
  }
}

let state = load();
const listeners = new Set<() => void>();

export const tokenStore = {
  get accessToken() {
    return state.accessToken;
  },
  get refreshToken() {
    return state.refreshToken;
  },
  get user() {
    return state.user;
  },
  get isAuthenticated() {
    return Boolean(state.accessToken);
  },
  set(accessToken: string, refreshToken: string, user: string) {
    state = { accessToken, refreshToken, user };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    listeners.forEach((l) => l());
  },
  clear() {
    state = { accessToken: '', refreshToken: '', user: '' };
    localStorage.removeItem(LS_KEY);
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
