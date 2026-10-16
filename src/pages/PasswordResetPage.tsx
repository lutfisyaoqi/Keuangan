import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { apiService } from '../services/apiService';

type RecoveryTokens = { accessToken: string; refreshToken: string };

export function PasswordResetPage() {
  const navigate = useNavigate();
  const initialized = useRef(false);
  const [tokens, setTokens] = useState<RecoveryTokens | null>(null);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get('access_token') ?? '';
    const refreshToken = fragment.get('refresh_token') ?? '';
    const type = fragment.get('type');
    const providerError = fragment.get('error_description');
    window.history.replaceState(null, document.title, window.location.pathname);
    if (providerError) setLinkError(providerError);
    else if (type !== 'recovery' || !accessToken || !refreshToken) setLinkError('Tautan pemulihan tidak valid atau sudah kedaluwarsa.');
    else setTokens({ accessToken, refreshToken });
    setCheckingLink(false);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password baru minimal 8 karakter.'); return; }
    if (password !== confirmation) { setError('Konfirmasi password tidak sama.'); return; }
    if (!tokens) return;
    setPending(true);
    try {
      await apiService.resetPassword(tokens.accessToken, tokens.refreshToken, password, confirmation);
      navigate('/login', { replace: true, state: { message: 'Password berhasil diperbarui. Silakan login dengan password baru.' } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Password belum dapat diperbarui.');
    } finally { setPending(false); }
  };

  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
    <div className="w-full max-w-md">
      <Link to="/login" className="mb-8 flex items-center justify-center gap-3 text-slate-900"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white"><Wallet className="h-5 w-5" /></span><span className="text-xl font-bold">CatatUang</span></Link>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Buat password baru</h1>
        <p className="mt-1 text-sm text-slate-500">Gunakan password minimal 8 karakter.</p>
        {checkingLink ? <p role="status" className="mt-6 text-sm text-slate-500">Memeriksa tautan pemulihan...</p> : linkError ? <div className="mt-6 space-y-4"><p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{linkError}</p><Link to="/login?forgot=1" className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800">Minta tautan pemulihan baru</Link></div> : <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
          <div><label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password baru</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
          <div><label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">Ulangi password baru</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
          <button type="submit" disabled={pending || !tokens} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{pending ? 'Menyimpan...' : 'Simpan password baru'}</button>
        </form>}
      </section>
    </div>
  </main>;
}
