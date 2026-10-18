import React, { useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import { ApiRequestError, apiService } from '../services/apiService.js';

export const AdminLoginPage: React.FC = () => {
  const { user, loading: sessionLoading, updateUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!user || sessionLoading) return;
    let active = true;
    apiService.checkAdmin()
      .then(() => {
        if (active) {
          setRedirecting(true);
          navigate('/admin', { replace: true });
        }
      })
      .catch(async (requestError: unknown) => {
        if (!active || !(requestError instanceof ApiRequestError) || requestError.status !== 403) return;
        try {
          await apiService.logout();
          if (active) {
            updateUser(null);
            setError('Akun ini tidak memiliki akses admin.');
          }
        } catch {
          if (active) setError('Sesi pengguna biasa belum dapat dibersihkan. Keluar dari akun pengguna, lalu coba lagi.');
        } finally {
          if (active) navigate('/admin/login', { replace: true, state: null });
        }
      });
    return () => { active = false; };
  }, [navigate, sessionLoading, updateUser, user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const result = await apiService.adminLogin(email.trim().toLowerCase(), password);
      try {
        await apiService.checkAdmin();
      } catch (checkError) {
        await apiService.logout().catch(() => undefined);
        updateUser(null);
        if (checkError instanceof ApiRequestError && (checkError.status === 401 || checkError.status === 403)) {
          throw new Error('Akun ini tidak memiliki akses admin.');
        }
        throw checkError;
      }
      updateUser(result.user);
      navigate('/admin', { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        setError('Akun ini tidak memiliki akses admin, atau email/password tidak sesuai.');
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Login admin belum dapat diproses.');
      }
    } finally {
      setPending(false);
    }
  };

  if (sessionLoading || redirecting) {
    return <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-300"><span className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Memeriksa akses admin...</span></div>;
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.22),_transparent_55%)]" />
      <div className="relative w-full max-w-md">
        <Link to="/login" className="mb-8 flex items-center justify-center gap-3 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/40"><ShieldCheck className="h-5 w-5" /></span>
          <span><span className="block text-lg font-bold leading-tight">CatatUang</span><span className="text-xs text-slate-400">Admin Console</span></span>
        </Link>
        <section className="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><KeyRound className="h-5 w-5" /></div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Panel Admin</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">Masuk menggunakan akun yang sudah diberi role admin, support, atau owner.</p>

          {error && <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-relaxed text-rose-800">{error}</div>}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email admin</label>
              <input id="admin-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input id="admin-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </div>
            <button type="submit" disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
              {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}{pending ? 'Memverifikasi...' : 'Masuk ke panel admin'}
            </button>
          </form>
          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-blue-700">Login pengguna</Link>
          </div>
        </section>
        <p className="mt-5 text-center text-xs text-slate-500">Akses admin diverifikasi oleh server. Halaman ini terpisah dari login pengguna.</p>
      </div>
    </main>
  );
};
