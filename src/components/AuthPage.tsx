import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

interface AuthPageProps {
  mode: 'login' | 'register';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(() => (location.state as { message?: string } | null)?.message ?? '');
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';
  const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';

  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Memeriksa sesi...</div>;
  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const normalizedEmail = email.trim().toLowerCase();
    if (isRegister) {
      if (name.trim().length < 2 || name.trim().length > 100) {
        setError('Nama harus berisi 2 sampai 100 karakter.');
        return;
      }
      if (password.length < 8) {
        setError('Password minimal 8 karakter.');
        return;
      }
      if (password !== confirmation) {
        setError('Konfirmasi password tidak sama.');
        return;
      }
    }

    setPending(true);
    try {
      if (isRegister) {
        const needsConfirmation = await register(name.trim(), normalizedEmail, password, confirmation);
        if (needsConfirmation) {
          setMessage('Akun berhasil dibuat. Periksa email Anda untuk konfirmasi sebelum login.');
          return;
        }
      } else {
        await login(normalizedEmail, password);
      }
      navigate(isRegister ? '/dashboard' : destination, { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Permintaan belum dapat diproses.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center selection:bg-blue-100 selection:text-blue-900">
      <div className="w-full max-w-md">
        <Link to="/login" className="mb-8 flex items-center justify-center gap-3 text-slate-900">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold">CatatUang</span>
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">{isRegister ? 'Buat akun' : 'Selamat datang kembali'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isRegister ? 'Mulai catat dan kelola keuanganmu.' : 'Login untuk melihat catatan keuanganmu.'}
          </p>

          {error && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
          {message && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{message}</p>}

          {!message && <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isRegister && <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">Nama</label>
              <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </div>}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input id="password" name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 8 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </div>
            {isRegister && <div>
              <label htmlFor="confirmation" className="mb-1.5 block text-sm font-medium text-slate-700">Konfirmasi password</label>
              <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </div>}
            <button type="submit" disabled={pending} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
              {pending ? 'Memproses...' : isRegister ? 'Daftar' : 'Login'}
            </button>
          </form>}

          <p className="mt-6 text-center text-sm text-slate-600">
            {isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <Link className="font-semibold text-blue-700 hover:text-blue-800" to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Login' : 'Daftar'}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
};