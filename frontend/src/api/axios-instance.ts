import Axios, { type AxiosRequestConfig } from 'axios';
import { tokenStore } from '../auth/token';

export const axios = Axios.create({ baseURL: '/api/admin' });

// ---- activity log (powers the Log Console "API activity" stream) ----
export type ApiActivity = {
  id: number;
  ts: number;
  method: string;
  url: string;
  status?: number;
  ms?: number;
  error?: string;
  console?: string[];
};
const activityBuf: ApiActivity[] = [];
const activitySubs = new Set<() => void>();
let actId = 1;
const MAX_ACTIVITY = 500;

export const activityLog = {
  list: () => activityBuf,
  subscribe(l: () => void) {
    activitySubs.add(l);
    return () => activitySubs.delete(l);
  },
  clear() {
    activityBuf.length = 0;
    activitySubs.forEach((l) => l());
  },
};
function pushActivity(a: Omit<ApiActivity, 'id'>) {
  activityBuf.unshift({ ...a, id: actId++ });
  if (activityBuf.length > MAX_ACTIVITY) activityBuf.pop();
  activitySubs.forEach((l) => l());
}
// ------------------------------------------------------------------

axios.interceptors.request.use((config) => {
  const token = tokenStore.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = tokenStore.refreshToken;
  if (!rt) return false;
  try {
    const { data } = await Axios.post('/api/admin/refresh', { refresh_token: rt });
    const result = data?.result ?? data;
    if (!result?.access_token) return false;
    tokenStore.set(result.access_token, result.refresh_token ?? rt, result.sub ?? tokenStore.user);
    return true;
  } catch {
    return false;
  }
}

axios.interceptors.response.use(
  (res) => {
    const started = (res.config as { _started?: number })._started;
    pushActivity({
      ts: Date.now(),
      method: (res.config.method ?? 'get').toUpperCase(),
      url: res.config.url ?? '',
      status: res.status,
      ms: started ? Date.now() - started : undefined,
      console: Array.isArray(res.data?.console) ? res.data.console : undefined,
    });
    return res;
  },
  async (error) => {
    const cfg = error.config as (AxiosRequestConfig & { _retried?: boolean; _started?: number }) | undefined;
    if (cfg) {
      pushActivity({
        ts: Date.now(),
        method: (cfg.method ?? 'get').toUpperCase(),
        url: cfg.url ?? '',
        status: error.response?.status,
        ms: cfg._started ? Date.now() - cfg._started : undefined,
        error:
          error.response?.data?.status?.errors?.[0]?.error ||
          error.response?.data?.status?.summary ||
          error.message,
        console: Array.isArray(error.response?.data?.console) ? error.response.data.console : undefined,
      });
    }
    const original = cfg;
    if (error.response?.status !== 401 || original?._retried || original?.url?.endsWith('/login')) {
      throw error;
    }
    original!._retried = true;
    refreshing ??= tryRefresh().finally(() => (refreshing = null));
    if (await refreshing) return axios(original!);
    tokenStore.clear();
    window.location.hash = '#/login';
    throw error;
  },
);

axios.interceptors.request.use((config) => {
  (config as { _started?: number })._started = Date.now();
  return config;
});

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axios(config).then(({ data }) => data);
};
