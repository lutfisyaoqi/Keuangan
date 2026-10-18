import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, Check, ChevronLeft, ChevronRight, ClipboardList, Database,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Megaphone, RefreshCw, Search, Shield,
  ShieldAlert, ShieldCheck, Trash2, Users, Wrench, X,
} from 'lucide-react';
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import {
  AdminActivity, AdminAuditLog, AdminGrowthPoint, AdminOverview, AdminRetention, AdminRole, AdminSettings, AdminStorageUsage,
  AdminUser, ApiRequestError, apiService,
} from '../services/apiService.js';

const userPageSize = 10;
const auditPageSize = 20;

type AdminSection = 'overview' | 'users' | 'audit' | 'settings';
type UserAction = 'disable' | 'enable' | 'delete';

interface ActionDialogState {
  user: AdminUser;
  action: UserAction;
}

const sectionDetails: Record<AdminSection, { title: string; description: string }> = {
  overview: { title: 'Ringkasan layanan', description: 'Metrik agregat dan status layanan, tanpa akses ke detail transaksi pengguna.' },
  users: { title: 'Akun pengguna', description: 'Kelola status akun. Panel hanya menampilkan identitas dan status, bukan data keuangan.' },
  audit: { title: 'Audit log', description: 'Riwayat tindakan administratif dan hasilnya.' },
  settings: { title: 'Pengaturan layanan', description: 'Atur pengumuman untuk pengguna dan pemberitahuan pemeliharaan.' },
};

const navigation: Array<{ path: string; section: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
  { path: '/admin', section: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
  { path: '/admin/users', section: 'users', label: 'Akun', icon: Users },
  { path: '/admin/audit', section: 'audit', label: 'Audit Log', icon: ClipboardList },
  { path: '/admin/settings', section: 'settings', label: 'Pengaturan', icon: Wrench },
];

const auditActions = [
  ['user.disable', 'Nonaktifkan akun'],
  ['user.enable', 'Aktifkan akun'],
  ['user.delete', 'Hapus akun'],
  ['settings.announcement.update', 'Ubah pengumuman'],
  ['settings.maintenance.update', 'Ubah mode pemeliharaan'],
] as const;

function displayError(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError && error.status === 503) {
    if (/migrasi (fitur admin terbaru|pemantauan admin)/i.test(error.message)) {
      return `${error.message} Jalankan migrasi SQL dashboard admin terbaru melalui Supabase SQL Editor.`;
    }
    return `${error.message} Periksa konfigurasi service role server dan pastikan migrasi admin sudah dijalankan.`;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value.toLocaleString('id-ID')} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unit = -1;
  do {
    amount /= 1024;
    unit += 1;
  } while (amount >= 1024 && unit < units.length - 1);
  return `${amount.toLocaleString('id-ID', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

function MetricCard({ label, value, icon: Icon, tone = 'blue' }: {
  label: string;
  value: string;
  icon: typeof Users;
  tone?: 'blue' | 'green' | 'amber' | 'slate';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
    </div>
    <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
  </article>;
}

function AccountGrowthChart({ points }: { points: AdminGrowthPoint[] }) {
  if (!points.length) return <p className="py-12 text-center text-sm text-slate-500">Belum ada data pertumbuhan akun.</p>;
  const width = 720;
  const height = 190;
  const padding = 24;
  const maximum = Math.max(1, ...points.map((point) => point.accounts));
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padding + index * ((width - 2 * padding) / Math.max(points.length - 1, 1)),
    y: height - padding - (point.accounts / maximum) * (height - 2 * padding),
  }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;
  return <div>
    <div className="flex items-center justify-between text-xs text-slate-400"><span>{coordinates[0]?.day}</span><span>{coordinates.at(-1)?.day}</span></div>
    <svg role="img" aria-label="Grafik jumlah akun baru per hari selama 30 hari terakhir" viewBox={`0 0 ${width} ${height}`} className="mt-2 h-48 w-full overflow-visible">
      <defs><linearGradient id="account-growth-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".18" /><stop offset="100%" stopColor="#2563eb" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map((tick) => <line key={tick} x1={padding} x2={width - padding} y1={padding + tick * ((height - 2 * padding) / 3)} y2={padding + tick * ((height - 2 * padding) / 3)} stroke="#e2e8f0" strokeDasharray="4 5" />)}
      <polygon points={area} fill="url(#account-growth-fill)" />
      <polyline points={line} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {coordinates.map((point) => <circle key={point.day} cx={point.x} cy={point.y} r="3" fill="#fff" stroke="#2563eb" strokeWidth="2"><title>{point.day}: {point.accounts} akun baru</title></circle>)}
    </svg>
    <p className="text-right text-xs text-slate-500">Akun baru per hari</p>
  </div>;
}

function Pagination({ page, pageCount, loading, onPage }: {
  page: number;
  pageCount: number;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  return <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
    <button type="button" aria-label="Halaman sebelumnya" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
    <span className="text-xs text-slate-500">Halaman {page} / {pageCount}</span>
    <button type="button" aria-label="Halaman berikutnya" disabled={page >= pageCount || loading} onClick={() => onPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
  </div>;
}

export const AdminPage: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const section = useMemo<AdminSection | null>(() => {
    const path = location.pathname.replace(/\/+$/, '') || '/admin';
    if (path === '/admin') return 'overview';
    if (path === '/admin/users') return 'users';
    if (path === '/admin/audit') return 'audit';
    if (path === '/admin/settings') return 'settings';
    return null;
  }, [location.pathname]);

  const [role, setRole] = useState<AdminRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [roleError, setRoleError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [growth, setGrowth] = useState<AdminGrowthPoint[] | null>(null);
  const [storageUsage, setStorageUsage] = useState<AdminStorageUsage | null>(null);
  const [health, setHealth] = useState<{ status: 'ok' | 'degraded'; checks: Record<string, boolean> } | null>(null);
  const [activity, setActivity] = useState<AdminActivity | null>(null);
  const [retention, setRetention] = useState<AdminRetention | null>(null);
  const [activityPeriod, setActivityPeriod] = useState(30);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [userSort, setUserSort] = useState<'created_at' | 'name' | 'email' | 'account_status'>('created_at');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');
  const [usersLoading, setUsersLoading] = useState(false);
  const [userStatus, setUserStatus] = useState<'' | 'active' | 'disabled'>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditAction, setAuditAction] = useState('');
  const [auditRole, setAuditRole] = useState<AdminRole | ''>('');
  const [auditAdminId, setAuditAdminId] = useState('');
  const [auditAdminIdDraft, setAuditAdminIdDraft] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [settingsReason, setSettingsReason] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [maintenanceDialog, setMaintenanceDialog] = useState(false);
  const [maintenanceReason, setMaintenanceReason] = useState('');

  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [pendingAction, setPendingAction] = useState(false);
  const [exportPending, setExportPending] = useState(false);

  const canWrite = role === 'admin' || role === 'owner';
  const usersPageCount = Math.max(1, Math.ceil(usersTotal / userPageSize));
  const auditPageCount = Math.max(1, Math.ceil(auditTotal / auditPageSize));

  useEffect(() => {
    let active = true;
    apiService.checkAdmin()
      .then(({ role: verifiedRole }) => { if (active) setRole(verifiedRole); })
      .catch((requestError: unknown) => {
        if (active) setRoleError(displayError(requestError, 'Akses admin belum dapat diverifikasi.'));
      })
      .finally(() => { if (active) setCheckingRole(false); });
    return () => { active = false; };
  }, []);

  const refreshOverview = useCallback(async () => {
    setPageLoading(true);
    const [overviewResult, growthResult, usageResult, healthResult, activityResult, retentionResult] = await Promise.allSettled([
      apiService.getAdminOverview(),
      apiService.getAdminAccountGrowth(),
      apiService.getAdminStorageUsage(),
      apiService.getAdminHealth(),
      apiService.getAdminActivity(activityPeriod),
      apiService.getAdminRetention(),
    ]);
    const failures: string[] = [];
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    else failures.push(displayError(overviewResult.reason, 'Metrik agregat belum dapat dimuat.'));
    if (growthResult.status === 'fulfilled') setGrowth(growthResult.value.points);
    else failures.push(displayError(growthResult.reason, 'Grafik pertumbuhan akun belum dapat dimuat.'));
    if (usageResult.status === 'fulfilled') setStorageUsage(usageResult.value);
    else failures.push(displayError(usageResult.reason, 'Penggunaan storage belum dapat dimuat.'));
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    else failures.push(displayError(healthResult.reason, 'Status layanan belum dapat dimuat.'));
    if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
    else failures.push(displayError(activityResult.reason, 'Aktivitas layanan belum dapat dimuat.'));
    if (retentionResult.status === 'fulfilled') setRetention(retentionResult.value);
    else failures.push(displayError(retentionResult.reason, 'Informasi retensi dan error belum dapat dimuat.'));
    setError(failures.join(' '));
    setPageLoading(false);
  }, [activityPeriod]);

  const refreshUsers = useCallback(async () => {
    setUsersLoading(true);
    setError('');
    try {
      const result = await apiService.listAdminUsers(usersPage, userPageSize, search, userSort, userSortOrder, {
        ...(userStatus ? { status: userStatus } : {}), ...(createdFrom ? { createdFrom } : {}), ...(createdTo ? { createdTo } : {}),
      });
      setUsers(result.users);
      setUsersTotal(result.total);
    } catch (requestError) {
      setError(displayError(requestError, 'Daftar akun belum dapat dimuat.'));
    } finally {
      setUsersLoading(false);
    }
  }, [createdFrom, createdTo, search, userSort, userSortOrder, userStatus, usersPage]);

  const refreshAudit = useCallback(async () => {
    setAuditLoading(true);
    setError('');
    try {
      const result = await apiService.listAdminAuditLogs(auditPage, auditPageSize, {
        ...(auditAction ? { action: auditAction } : {}),
        ...(auditRole ? { actorRole: auditRole } : {}),
        ...(auditAdminId ? { actorId: auditAdminId.trim() } : {}),
        ...(auditFrom ? { from: auditFrom } : {}),
        ...(auditTo ? { to: auditTo } : {}),
      });
      setAuditLogs(result.logs);
      setAuditTotal(result.total);
    } catch (requestError) {
      setError(displayError(requestError, 'Audit log belum dapat dimuat.'));
    } finally {
      setAuditLoading(false);
    }
  }, [auditAction, auditAdminId, auditFrom, auditPage, auditRole, auditTo]);

  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true);
    setError('');
    try {
      const result = await apiService.getAdminSettings();
      setSettings(result);
      setAnnouncementDraft(result.announcement ?? '');
      setAnnouncementEnabled(Boolean(result.announcement));
    } catch (requestError) {
      setError(displayError(requestError, 'Pengaturan layanan belum dapat dimuat.'));
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!role || !section) return;
    setError('');
    setNotice('');
    if (section === 'overview') void refreshOverview();
    if (section === 'users') void refreshUsers();
    if (section === 'audit') void refreshAudit();
    if (section === 'settings') void refreshSettings();
  }, [refreshAudit, refreshOverview, refreshSettings, refreshUsers, role, section]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft.trim());
      setUsersPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const pageRange = usersTotal === 0 ? '0 akun' : `${(usersPage - 1) * userPageSize + 1}–${Math.min(usersPage * userPageSize, usersTotal)} dari ${usersTotal}`;

  const logoutAdmin = async () => {
    setLoggingOut(true);
    setError('');
    try {
      await logout();
      updateUser(null);
      navigate('/admin/login', { replace: true });
    } catch (logoutError) {
      setError(displayError(logoutError, 'Logout belum berhasil. Coba lagi.'));
    } finally {
      setLoggingOut(false);
    }
  };

  const openUserAction = (targetUser: AdminUser, action: UserAction) => {
    setActionReason('');
    setConfirmEmail('');
    setActionDialog({ user: targetUser, action });
  };

  const submitUserAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!actionDialog) return;
    setError('');
    setNotice('');
    setPendingAction(true);
    try {
      const { user: target, action } = actionDialog;
      if (action === 'disable') await apiService.disableAdminUser(target.id, actionReason.trim());
      else if (action === 'enable') await apiService.enableAdminUser(target.id, actionReason.trim());
      else await apiService.deleteAdminUser(target.id, confirmEmail.trim(), actionReason.trim());
      setActionDialog(null);
      setNotice(action === 'delete' ? 'Akun berhasil dihapus.' : action === 'disable' ? 'Akun berhasil dinonaktifkan.' : 'Akun berhasil diaktifkan.');
      await refreshUsers();
    } catch (requestError) {
      setError(displayError(requestError, 'Tindakan akun belum berhasil.'));
    } finally {
      setPendingAction(false);
    }
  };

  const submitAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setSettingsPending(true);
    setError('');
    setNotice('');
    try {
      const result = await apiService.updateAdminAnnouncement(announcementEnabled ? announcementDraft.trim() : '', settingsReason.trim());
      setAnnouncementDraft(result.announcement ?? announcementDraft);
      setAnnouncementEnabled(Boolean(result.announcement));
      setSettingsReason('');
      setNotice('Pengumuman berhasil disimpan.');
      await refreshSettings();
    } catch (requestError) {
      setError(displayError(requestError, 'Pengumuman belum dapat diperbarui.'));
    } finally {
      setSettingsPending(false);
    }
  };

  const submitMaintenance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings || !canWrite) return;
    setSettingsPending(true);
    setError('');
    setNotice('');
    try {
      const result = await apiService.updateAdminMaintenance(!settings.maintenanceMode, maintenanceReason.trim());
      setSettings({ ...settings, maintenanceMode: result.enabled });
      setMaintenanceReason('');
      setMaintenanceDialog(false);
      setNotice(result.enabled ? 'Pemberitahuan pemeliharaan diaktifkan.' : 'Pemberitahuan pemeliharaan dinonaktifkan.');
      await refreshSettings();
    } catch (requestError) {
      setError(displayError(requestError, 'Mode pemeliharaan belum dapat diperbarui.'));
    } finally {
      setSettingsPending(false);
    }
  };

  const exportMetrics = async () => {
    setExportPending(true);
    setError('');
    try {
      const blob = await apiService.exportAdminMetrics(activityPeriod);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'catatuang-admin-metrics.csv';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(displayError(requestError, 'Ekspor metrik belum dapat diunduh.'));
    } finally {
      setExportPending(false);
    }
  };

  if (checkingRole) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500"><span className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Memverifikasi akses admin...</span></div>;
  }

  if (!role) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-700"><ShieldAlert className="h-6 w-6" /></span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Panel admin tidak dapat diakses</h1>
        <p role="alert" className="mt-2 text-sm text-slate-600">{roleError || 'Akses admin diperlukan.'}</p>
        <Link to="/admin/login" className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Kembali ke login admin</Link>
      </section>
    </main>;
  }

  if (!section) return <Navigate to="/admin" replace />;

  const refreshCurrentPage = () => {
    if (section === 'overview') void refreshOverview();
    if (section === 'users') void refreshUsers();
    if (section === 'audit') void refreshAudit();
    if (section === 'settings') void refreshSettings();
  };

  return <main className="min-h-screen bg-slate-50">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Shield className="h-5 w-5" /></span>
          <div><p className="text-sm font-bold leading-tight text-slate-900">CatatUang · Panel Admin</p><p className="mt-0.5 text-xs text-slate-500">Pengelolaan terbatas dan agregat</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="max-w-[112px] truncate text-right sm:max-w-none"><span className="block truncate text-xs font-semibold text-slate-800 sm:text-sm">{user?.name || 'Admin'}</span><span className="block truncate text-[10px] text-slate-500 sm:text-xs">{user?.email} · {role}</span></span>
          <button type="button" onClick={refreshCurrentPage} aria-label="Muat ulang halaman" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /></button>
          <button type="button" onClick={() => void logoutAdmin()} disabled={loggingOut} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">{loggingOut ? 'Keluar...' : 'Logout'}</span></button>
          <button type="button" aria-expanded={menuOpen} aria-label="Buka menu admin" onClick={() => setMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700 lg:hidden"><Menu className="h-4 w-4" /></button>
        </div>
      </div>
      {menuOpen && <nav aria-label="Navigasi admin" className="grid gap-1 border-t border-slate-200 p-3 lg:hidden">
        {navigation.map(({ path, section: navSection, label, icon: Icon }) => <NavLink key={path} to={path} end={navSection === 'overview'} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{label}</NavLink>)}
      </nav>}
    </header>

    <div className="mx-auto flex max-w-[1440px]">
      <aside className="hidden min-h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
        <p className="px-3 pb-3 pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Panel</p>
        <nav aria-label="Navigasi admin" className="space-y-1">
          {navigation.map(({ path, section: navSection, label, icon: Icon }) => <NavLink key={path} to={path} end={navSection === 'overview'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{label}</NavLink>)}
        </nav>
        <p className="mt-8 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">Admin tidak dapat melihat transaksi, saldo awal, foto bukti, kata sandi, atau token pengguna.</p>
      </aside>

      <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administrasi</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{sectionDetails[section].title}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">{sectionDetails[section].description}</p></div>
          {section === 'overview' && <button type="button" onClick={() => void exportMetrics()} disabled={exportPending} className="inline-flex w-fit items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" />{exportPending ? 'Menyiapkan...' : 'Ekspor metrik anonim'}</button>}
        </div>
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-800">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

        {section === 'overview' && <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-700">Aktivitas periode</p><select aria-label="Periode aktivitas layanan" value={activityPeriod} onChange={(event) => setActivityPeriod(Number(event.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select></div>
          <section aria-label="Metrik agregat" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {pageLoading && !overview ? Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />) : overview ? <>
              <MetricCard label="Total akun" value={overview.totalAccounts.toLocaleString('id-ID')} icon={Users} />
              <MetricCard label="Akun baru · 30 hari" value={overview.newAccounts30d.toLocaleString('id-ID')} icon={Activity} tone="green" />
              <MetricCard label="Pengguna aktif" value={overview.activeAccounts.toLocaleString('id-ID')} icon={ShieldCheck} tone="green" />
              <MetricCard label={`Aktif Â· ${activityPeriod} hari`} value={(activity?.activeUsers ?? 0).toLocaleString('id-ID')} icon={Activity} tone="green" />
              <MetricCard label={`Transaksi baru Â· ${activityPeriod} hari`} value={(activity?.newTransactions ?? 0).toLocaleString('id-ID')} icon={ClipboardList} tone="blue" />
              <MetricCard label="Total transaksi · agregat" value={overview.totalTransactions.toLocaleString('id-ID')} icon={ClipboardList} tone="slate" />
              <MetricCard label="Pemakaian storage" value={storageUsage ? formatBytes(storageUsage.totalBytes) : 'Belum tersedia'} icon={Database} tone="amber" />
            </> : <div className="col-span-full rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Metrik belum tersedia. Periksa service role server dan migrasi admin.</div>}
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4"><h2 className="font-bold text-slate-900">Pertumbuhan akun</h2><p className="mt-1 text-sm text-slate-500">Jumlah akun baru per hari selama 30 hari terakhir.</p></div>
              {growth ? <AccountGrowthChart points={growth} /> : pageLoading ? <Skeleton className="h-52" /> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Grafik tidak tersedia. Pastikan migrasi agregat dashboard admin sudah dijalankan.</p>}
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">Status layanan</h2><p className="mt-1 text-sm text-slate-500">Pemeriksaan database, Auth, dan Storage.</p></div><button type="button" onClick={() => void refreshOverview()} aria-label="Segarkan status layanan" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${pageLoading ? 'animate-spin' : ''}`} /></button></div>
              <div className="mt-5 space-y-3">
                {(['api', 'database', 'auth', 'storage'] as const).map((service) => {
                  const ok = health?.checks[service] ?? false;
                  const label = service === 'api' ? 'API' : service === 'database' ? 'Database' : service === 'auth' ? 'Supabase Auth' : 'Storage';
                  return <div key={service} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium text-slate-700">{label}</span>{health ? <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{ok ? 'Tersedia' : 'Gangguan'}</span> : pageLoading ? <Skeleton className="h-4 w-20" /> : <span className="text-xs text-slate-500">Belum diperiksa</span>}</div>;
                })}
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">{storageUsage ? `${storageUsage.objectCount.toLocaleString('id-ID')} berkas terhitung; hanya jumlah dan ukuran total yang ditampilkan.` : 'Pemakaian storage agregat memerlukan migrasi dashboard admin terbaru.'}</p>
              </div>
            </article>
          </section>
          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Retensi transaksi 2 bulan</h2><p className="mt-1 text-sm text-slate-500">Transaksi yang mendekati batas retensi dan hasil penghapusan 30 hari terakhir.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><MetricCard label="Kedaluwarsa 30 hari" value={(retention?.expiringSoon ?? 0).toLocaleString('id-ID')} icon={Activity} tone="amber"/><MetricCard label="Menunggu penghapusan" value={(retention?.overduePending ?? 0).toLocaleString('id-ID')} icon={Database} tone="amber"/><MetricCard label="Terhapus 30 hari" value={(retention?.purgedLast30Days ?? 0).toLocaleString('id-ID')} icon={Trash2} tone="slate"/></div></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Error layanan terbaru</h2><p className="mt-1 text-sm text-slate-500">Ringkasan error API/database dan kegagalan storage, tanpa data pengguna.</p><div className="mt-4 divide-y divide-slate-100">{retention?.recentErrors.length ? retention.recentErrors.slice(0, 8).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="font-medium text-slate-700">{item.service.toUpperCase()} Â· {item.route}</span><span className="text-rose-700">HTTP {item.statusCode} Â· {formatDate(item.createdAt)}</span></div>) : <p className="py-4 text-sm text-slate-500">Belum ada error tercatat.</p>}</div></article>
          </section>
          <p className="text-xs text-slate-500">Ekspor dan kartu ringkasan hanya memuat metrik agregat anonim. Tidak ada rincian transaksi yang ditampilkan.</p>
        </div>}

        {section === 'users' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="font-bold text-slate-900">Daftar akun</h2><p className="mt-1 text-sm text-slate-500">{pageRange}; email dan status verifikasi, tanpa informasi keuangan.</p></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <label className="relative"><span className="sr-only">Cari nama atau email</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" maxLength={120} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Cari nama atau email" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
              <label className="sr-only" htmlFor="account-sort">Urutkan akun</label><select id="account-sort" value={userSort} onChange={(event) => { setUsersPage(1); setUserSort(event.target.value as typeof userSort); }} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="created_at">Tanggal dibuat</option><option value="name">Nama</option><option value="email">Email</option><option value="account_status">Status</option></select>
              <button type="button" onClick={() => { setUsersPage(1); setUserSortOrder((order) => order === 'asc' ? 'desc' : 'asc'); }} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700">Urutan: {userSortOrder === 'asc' ? 'Naik' : 'Turun'}</button>
              <select aria-label="Filter status akun" value={userStatus} onChange={(event) => { setUsersPage(1); setUserStatus(event.target.value as typeof userStatus); }} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Semua status</option><option value="active">Aktif</option><option value="disabled">Nonaktif</option></select>
              <label className="text-xs text-slate-500">Dibuat dari<input aria-label="Akun dibuat dari tanggal" type="date" value={createdFrom} onChange={(event) => { setUsersPage(1); setCreatedFrom(event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700" /></label>
              <label className="text-xs text-slate-500">Sampai tanggal<input aria-label="Akun dibuat sampai tanggal" type="date" value={createdTo} onChange={(event) => { setUsersPage(1); setCreatedTo(event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700" /></label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Akun</th><th className="px-4 py-3 font-semibold">Dibuat</th><th className="px-4 py-3 font-semibold">Status akun</th><th className="px-4 py-3 font-semibold">Email</th><th className="px-5 py-3 text-right font-semibold">Tindakan</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {usersLoading && users.length === 0 ? Array.from({ length: 5 }, (_, index) => <tr key={index}><td colSpan={5} className="px-5 py-3"><Skeleton className="h-8" /></td></tr>) : users.map((account) => <tr key={account.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4"><p className="font-semibold text-slate-900">{account.name || 'Tanpa nama'}</p><p className="mt-0.5 text-xs text-slate-500">{account.email}</p></td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(account.created_at)}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.account_status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{account.account_status === 'active' ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.emailConfirmed ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{account.emailConfirmed ? 'Terkonfirmasi' : 'Belum dikonfirmasi'}</span></td>
                  <td className="px-5 py-4"><div className="flex justify-end gap-2">
                    {account.id === user?.id ? <span className="text-xs text-slate-400">Akun Anda</span> : canWrite ? <>
                      <button type="button" onClick={() => openUserAction(account, account.account_status === 'active' ? 'disable' : 'enable')} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${account.account_status === 'active' ? 'border-amber-200 text-amber-800 hover:bg-amber-50' : 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>{account.account_status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      <button type="button" onClick={() => openUserAction(account, 'delete')} aria-label={`Hapus akun ${account.email}`} className="grid h-8 w-8 place-items-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </> : <span className="text-xs text-slate-400">Baca saja</span>}
                  </div></td>
                </tr>)}
                {!usersLoading && !users.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">Tidak ada akun yang cocok dengan pencarian.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={usersPage} pageCount={usersPageCount} loading={usersLoading} onPage={setUsersPage} />
        </section>}

        {section === 'audit' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-2 xl:grid-cols-6">
            <label className="text-xs font-medium text-slate-600">Tindakan<select aria-label="Filter tindakan" value={auditAction} onChange={(event) => { setAuditPage(1); setAuditAction(event.target.value); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Semua tindakan</option>{auditActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-medium text-slate-600">Role admin<select aria-label="Filter admin" value={auditRole} onChange={(event) => { setAuditPage(1); setAuditRole(event.target.value as AdminRole | ''); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Semua admin</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="support">Support</option></select></label>
            <label className="text-xs font-medium text-slate-600">ID admin<input aria-label="Filter berdasarkan ID admin" maxLength={36} value={auditAdminIdDraft} onChange={(event) => setAuditAdminIdDraft(event.target.value)} placeholder="UUID admin" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <button type="button" onClick={() => { setAuditPage(1); setAuditAdminId(auditAdminIdDraft.trim()); }} className="self-end rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Terapkan admin</button>
            <label className="text-xs font-medium text-slate-600">Dari tanggal<input aria-label="Tanggal mulai audit" type="date" value={auditFrom} onChange={(event) => { setAuditPage(1); setAuditFrom(event.target.value); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-slate-600">Sampai tanggal<input aria-label="Tanggal akhir audit" type="date" value={auditTo} onChange={(event) => { setAuditPage(1); setAuditTo(event.target.value); }} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
          </div>
          <div className="divide-y divide-slate-100">
            {auditLoading && !auditLogs.length ? Array.from({ length: 4 }, (_, index) => <div key={index} className="p-5"><Skeleton className="h-12" /></div>) : auditLogs.map((log) => <article key={log.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{auditActions.find(([value]) => value === log.action)?.[1] ?? log.action.replaceAll('.', ' ')}</p><p className="mt-1 text-xs text-slate-500">{formatDate(log.created_at)} · {log.actor_role} · ID admin {log.actor_user_id?.slice(0, 8) ?? 'tidak tersedia'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${log.result === 'success' ? 'bg-emerald-50 text-emerald-800' : log.result === 'pending' ? 'bg-blue-50 text-blue-800' : 'bg-rose-50 text-rose-800'}`}>{log.result === 'success' ? 'Berhasil' : log.result === 'pending' ? 'Diproses' : 'Ditolak'}</span></div>
              {log.reason && <p className="mt-2 text-sm text-slate-600">Alasan: {log.reason}</p>}
            </article>)}
            {!auditLoading && !auditLogs.length && <p className="px-5 py-12 text-center text-sm text-slate-500">Belum ada audit log yang sesuai filter.</p>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5"><span className="text-xs text-slate-500">{auditTotal.toLocaleString('id-ID')} catatan</span><Pagination page={auditPage} pageCount={auditPageCount} loading={auditLoading} onPage={setAuditPage} /></div>
        </section>}

        {section === 'settings' && <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Megaphone className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">Pengumuman pengguna</h2><p className="mt-1 text-sm text-slate-500">Ditampilkan sebagai teks biasa di aplikasi pengguna.</p></div></div>
            {settingsLoading && !settings ? <div className="mt-6 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-28" /><Skeleton className="h-10" /></div> : settings ? <form onSubmit={(event) => void submitAnnouncement(event)} className="mt-6 space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-700">Pengumuman aktif<input type="checkbox" checked={announcementEnabled} disabled={!canWrite} onChange={(event) => setAnnouncementEnabled(event.target.checked)} className="h-4 w-4 accent-blue-700" /></label>
              <div><label htmlFor="announcement-text" className="mb-1.5 block text-sm font-medium text-slate-700">Isi pengumuman</label><textarea id="announcement-text" rows={5} maxLength={1000} disabled={!canWrite} value={announcementDraft} onChange={(event) => setAnnouncementDraft(event.target.value)} placeholder="Tulis informasi untuk pengguna..." className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100" /><p className="mt-1 text-right text-xs text-slate-400">{announcementDraft.length}/1000</p></div>
              {canWrite && <><div><label htmlFor="announcement-reason" className="mb-1.5 block text-sm font-medium text-slate-700">Alasan perubahan</label><input id="announcement-reason" required minLength={3} maxLength={500} value={settingsReason} onChange={(event) => setSettingsReason(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div><button type="submit" disabled={settingsPending || (announcementEnabled && !announcementDraft.trim())} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{settingsPending ? 'Menyimpan...' : 'Simpan pengumuman'}</button></>}
              {!canWrite && <p className="text-xs text-slate-500">Role support hanya dapat melihat pengaturan.</p>}
              {settings.updatedAt && <p className="text-xs text-slate-400">Terakhir diperbarui: {formatDate(settings.updatedAt)}</p>}
            </form> : <p className="mt-5 text-sm text-slate-600">Pengaturan belum tersedia. Pastikan migrasi admin sudah dijalankan.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-800"><Wrench className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">Mode pemeliharaan</h2><p className="mt-1 text-sm text-slate-500">Menampilkan pemberitahuan di aplikasi pengguna; admin tetap dapat masuk.</p></div></div>
            {settingsLoading && !settings ? <Skeleton className="mt-6 h-24" /> : settings && <div className={`mt-6 flex items-center justify-between gap-4 rounded-xl border p-4 ${settings.maintenanceMode ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <div><p className="text-sm font-semibold text-slate-900">{settings.maintenanceMode ? 'Pemberitahuan aktif' : 'Tidak aktif'}</p><p className="mt-1 text-xs text-slate-600">Status akan terlihat pada aplikasi pengguna.</p></div>
              {canWrite ? <button type="button" onClick={() => { setMaintenanceReason(''); setMaintenanceDialog(true); }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${settings.maintenanceMode ? 'border border-amber-300 bg-white text-amber-900' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>{settings.maintenanceMode ? 'Nonaktifkan' : 'Aktifkan'}</button> : <span className="text-xs text-slate-500">Baca saja</span>}
            </div>}
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">Mode ini memberi tahu pengguna tentang pemeliharaan. Akses pengguna tidak diblokir dan panel admin tetap tersedia.</div>
          </section>
        </div>}

        <footer className="mt-8 border-t border-slate-200 pt-5 text-center text-xs text-slate-500">Akses admin tetap diverifikasi backend pada setiap permintaan. Data transaksi dan bukti keuangan tidak ditampilkan.</footer>
      </section>
    </div>

    {actionDialog && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingAction) setActionDialog(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="admin-action-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h2 id="admin-action-title" className={`text-lg font-bold ${actionDialog.action === 'delete' ? 'text-rose-800' : 'text-slate-900'}`}>{actionDialog.action === 'delete' ? 'Hapus akun permanen' : actionDialog.action === 'disable' ? 'Nonaktifkan akun' : 'Aktifkan akun'}</h2><p className="mt-1 text-sm text-slate-600">{actionDialog.user.name} · {actionDialog.user.email}</p></div><button type="button" disabled={pendingAction} onClick={() => setActionDialog(null)} aria-label="Tutup dialog" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button></div>
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">{actionDialog.action === 'delete' ? 'Penghapusan permanen menghapus akun melalui Supabase Auth.' : actionDialog.action === 'disable' ? 'Akun tidak dapat login selama statusnya nonaktif.' : 'Akun dapat login kembali setelah diaktifkan.'} Semua tindakan dicatat pada audit log.</p>
        <form onSubmit={(event) => void submitUserAction(event)} className="mt-4 space-y-4">
          {actionDialog.action === 'delete' && <div><label htmlFor="delete-confirm-email" className="mb-1.5 block text-sm font-medium text-slate-700">Ketik ulang email persis</label><input id="delete-confirm-email" type="email" required value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-100" /></div>}
          <div><label htmlFor="admin-action-reason" className="mb-1.5 block text-sm font-medium text-slate-700">Alasan (minimal 3 karakter)</label><textarea id="admin-action-reason" required minLength={3} maxLength={500} rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
          <div className="flex justify-end gap-2"><button type="button" disabled={pendingAction} onClick={() => setActionDialog(null)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button><button type="submit" disabled={pendingAction || (actionDialog.action === 'delete' && confirmEmail !== actionDialog.user.email)} className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${actionDialog.action === 'delete' ? 'bg-rose-700 hover:bg-rose-800' : 'bg-blue-700 hover:bg-blue-800'}`}>{pendingAction && <LoaderCircle className="h-4 w-4 animate-spin" />}{actionDialog.action === 'delete' ? 'Hapus permanen' : actionDialog.action === 'disable' ? 'Nonaktifkan akun' : 'Aktifkan akun'}</button></div>
        </form>
      </section>
    </div>}

    {maintenanceDialog && settings && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="maintenance-confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 id="maintenance-confirm-title" className="text-lg font-bold text-slate-900">{settings.maintenanceMode ? 'Nonaktifkan pemberitahuan pemeliharaan?' : 'Aktifkan pemberitahuan pemeliharaan?'}</h2><p className="mt-2 text-sm text-slate-600">Admin tetap dapat masuk dan pengguna tidak diblokir.</p><form onSubmit={(event) => void submitMaintenance(event)} className="mt-5 space-y-4"><div><label htmlFor="maintenance-reason" className="mb-1.5 block text-sm font-medium text-slate-700">Alasan perubahan (wajib)</label><textarea id="maintenance-reason" required minLength={3} maxLength={500} rows={3} value={maintenanceReason} onChange={(event) => setMaintenanceReason(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div><div className="flex justify-end gap-2"><button type="button" disabled={settingsPending} onClick={() => setMaintenanceDialog(false)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700">Batal</button><button type="submit" disabled={settingsPending} className="rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">{settingsPending ? 'Menyimpan...' : 'Konfirmasi perubahan'}</button></div></form></section></div>}
  </main>;
};
