import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Button, Input } from '../components/ui';
import { errText } from '../lib/errors';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState('_SYSTEM');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(user, password);
      navigate('/');
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-[700px] -translate-x-1/2 rounded-full bg-accent-600/10 blur-3xl" />
      </div>
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-xl border border-ink-700 bg-ink-900 p-8 shadow-2xl"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 text-lg font-bold text-ink-950">
            IO
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">IRIS Mission Control</h1>
            <p className="text-xs text-ink-400">Manage. Diagnose. Secure. Integrate.</p>
          </div>
        </div>
        <label className="mb-1 block text-xs font-medium text-ink-300">Username</label>
        <Input value={user} onChange={(e) => setUser(e.target.value)} autoFocus className="mb-3" />
        <label className="mb-1 block text-xs font-medium text-ink-300">Password</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4"
        />
        {err && <p className="mb-3 text-xs text-red-400">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
        <p className="mt-4 text-center text-[11px] text-ink-500">
          Connects to the IRIS SysAdmin API at <code className="text-ink-400">/api/admin</code> on
          this host
        </p>
      </form>
    </div>
  );
}
