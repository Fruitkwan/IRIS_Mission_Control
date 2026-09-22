import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast, errText } from '../components/toast';
import { axios } from './axios-instance';

// Unwrap the BaseResponse envelope.
export function resultOf<T>(data: unknown): T | undefined {
  const d = data as { result?: T } | undefined;
  return d?.result ?? (d as T | undefined);
}

// Generic imperative GET for detail fetches where the generated hook
// signature is awkward to wire dynamically.
export function useDetailQuery(enabled: boolean, key: unknown[], path: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: key,
    enabled,
    queryFn: () =>
      axios.get(path, { params }).then((r) => r.data?.result ?? r.data),
  });
}

// Wrap a generated plain function (or any async fn) in a mutation + toast + invalidation.
export function useApiMutation<TVars, TRes>(opts: {
  fn: (vars: TVars) => Promise<TRes>;
  invalidate?: (string | string[])[] | string[];
  okText?: string | ((res: TRes, vars: TVars) => string);
  errText?: string;
  onSuccess?: (res: TRes, vars: TVars) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: opts.fn,
    onSuccess: (res, vars) => {
      const keys = (opts.invalidate ?? []).map((k) => (Array.isArray(k) ? k : [k]));
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      // broad fallback: invalidate everything under /v2
      if (keys.length === 0) qc.invalidateQueries();
      const msg = typeof opts.okText === 'function' ? opts.okText(res, vars) : opts.okText;
      if (msg !== '') toast('ok', msg ?? 'Done');
      opts.onSuccess?.(res, vars);
    },
    onError: (e) => toast('err', opts.errText ?? errText(e)),
  });
}
