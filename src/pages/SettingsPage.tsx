import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import { apiService } from '../services/apiService.js';

interface SettingsPageProps {
  mode: 'profile' | 'security';
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ mode }) => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setPending(true);
    try {
      const result = await apiService.updateProfile(name.trim());
      updateUser(result.user);
      setMessage('Nama berhasil diperbarui.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Profil belum dapat diperbarui.');
    } finally {
      setPending(false);
    }
  };

  const handlePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 8) {
      setError('Password baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('Konfirmasi password tidak sama.');
      return;
    }

    setPending(true);
    try {
      await apiService.changePassword(currentPassword, newPassword, confirmation);
      updateUser(null);
      navigate('/login', { replace: true, state: { message: 'Password berhasil diubah. Silakan login kembali.' } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Password belum dapat diperbarui.');
    } finally {
      setPending(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError('');
    setPending(true);
    try {
      await apiService.deleteAccount();
      updateUser(null);
      navigate('/register', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Akun belum dapat dihapus.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/dashboard" className="font-bold text-slate-900">CatatUang</Link>
          <Link to="/dashboard" className="text-sm font-medium text-blue-700 hover:text-blue-800">Kembali ke dashboard</Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">Pengaturan akun</h1>
        <div className="mt-5 flex gap-5 border-b border-slate-200">
          <Link to="/settings/profile" className={`border-b-2 px-1 pb-3 text-sm font-medium ${mode === 'profile' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>Profil</Link>
          <Link to="/settings/security" className={`border-b-2 px-1 pb-3 text-sm font-medium ${mode === 'security' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>Keamanan</Link>
        </div>

        {error && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{message}</p>}

        {mode === 'profile' ? <>
          <form onSubmit={handleProfile} className="mt-6 max-w-lg space-y-4">
            <div>
              <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium text-slate-700">Nama</label>
              <input id="profile-name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="profile-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input id="profile-email" readOnly value={user?.email ?? ''} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500" />
              <p className="mt-1 text-xs text-slate-500">Email tidak dapat diubah dari pengaturan ini.</p>
            </div>
            <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{pending ? 'Menyimpan...' : 'Simpan profil'}</button>
          </form>

          <section className="mt-10 border-t border-slate-200 pt-6">
            <h2 className="text-base font-semibold text-rose-700">Hapus akun</h2>
            <p className="mt-1 max-w-lg text-sm text-slate-600">Profil, transaksi, dan seluruh data keuangan akun ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</p>
            {!confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="mt-4 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Hapus akun</button> : <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-800">Konfirmasi penghapusan akun?</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Batal</button>
                <button type="button" onClick={handleDeleteAccount} disabled={pending} className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Menghapus...' : 'Ya, hapus permanen'}</button>
              </div>
            </div>}
          </section>
        </> : <form onSubmit={handlePassword} className="mt-6 max-w-lg space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password saat ini</label>
            <input id="current-password" type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password baru</label>
            <input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">Konfirmasi password baru</label>
            <input id="confirm-password" type="password" autoComplete="new-password" required maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{pending ? 'Memperbarui...' : 'Ubah password'}</button>
        </form>}
      </div>
    </main>
  );
};