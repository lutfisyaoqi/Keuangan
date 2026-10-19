import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, Download, Plus, Target, Trash2, Wallet } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TransactionType } from '../types/finance.js';
import { apiService, FinanceToolsSummary } from '../services/apiService.js';
import { getTodayDateString } from '../utils/formatters.js';

type Budget = { category: string; amount: number };
type Goal = { id: string; name: string; target: number; saved: number };
type Recurring = { id: string; description: string; amount: number; type: TransactionType; category: string; day: number; lastRun: string };
type Stored = { budgets: Budget[]; goals: Goal[]; recurring: Recurring[] };
const empty: Stored = { budgets: [], goals: [], recurring: [] };
const emptySummary: FinanceToolsSummary = { spentByCategory: {}, monthlyExpenses: {}, goalContributions: [] };
const money = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthName = (offset: number) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1));

export function FinanceTools({ userId, transactionCount, onRefresh, onError }: { userId: string; transactionCount: number; onRefresh: () => void; onError: (message: string) => void }) {
  const key = `catatuang-tools:${userId}`;
  const [data, setData] = useState<Stored>(() => { try { return { ...empty, ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return empty; } });
  const [budgetCategory, setBudgetCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalContributions, setGoalContributions] = useState<Record<string, string>>({});
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [goalError, setGoalError] = useState('');
  const [recDesc, setRecDesc] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recType, setRecType] = useState<TransactionType>('expense');
  const [recCategory, setRecCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [recDay, setRecDay] = useState('1');
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [summary, setSummary] = useState<FinanceToolsSummary>(emptySummary);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(data)); }, [key, data]);
  useEffect(() => {
    let active = true;
    if (transactionCount === 0) {
      setSummary(emptySummary);
      return () => { active = false; };
    }
    void apiService.getFinanceToolsSummary()
      .then((result) => { if (active) setSummary(result); })
      .catch(() => { if (active) onError('Data grafik belum berhasil dimuat.'); });
    return () => { active = false; };
  }, [key, transactionCount]);

  const monthly = useMemo(() => [-5, -4, -3, -2, -1, 0].map((offset) => {
    const date = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1);
    const key = monthKey(date);
    return { label: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(date), amount: summary.monthlyExpenses[key] ?? 0 };
  }), [summary.monthlyExpenses]);
  const current = monthly[5]?.amount ?? 0;
  const previous = monthly[4]?.amount ?? 0;
  const change = previous ? Math.round(((current - previous) / previous) * 100) : null;
  const reminders = data.recurring.filter(item => {
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth(), Math.min(item.day, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
    const days = Math.ceil((due.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
    return days >= 0 && days <= 3;
  });

  useEffect(() => {
    const today = new Date(); const todayKey = today.toISOString().slice(0, 10); const day = today.getDate();
    const due = data.recurring.filter(item => item.day <= day && item.lastRun < `${monthKey()}-${String(item.day).padStart(2, '0')}`);
    if (!due.length || busy) return;
    setBusy(true);
    void (async () => {
      try {
        for (const item of due) {
          const date = `${monthKey()}-${String(Math.min(item.day, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate())).padStart(2, '0')}`;
          await apiService.saveTransaction({ date, amount: item.amount, description: item.description, type: item.type, category: item.category });
        }
        setData(prev => ({ ...prev, recurring: prev.recurring.map(item => due.some(d => d.id === item.id) ? { ...item, lastRun: todayKey } : item) }));
        onRefresh();
      } catch { onError('Transaksi rutin belum berhasil dicatat. Coba muat ulang halaman.'); }
      finally { setBusy(false); }
    })();
  // Check once when account data loads; recurring rows are updated after a successful run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const addBudget = () => { const amount = Number(budgetAmount); if (!Number.isSafeInteger(amount) || amount < 1) return; setData(p => ({ ...p, budgets: [...p.budgets.filter(b => b.category !== budgetCategory), { category: budgetCategory, amount }] })); setBudgetAmount(''); };
  const addGoal = () => { const target = Number(goalTarget); if (!goalName.trim() || !Number.isSafeInteger(target) || target < 1) return; setData(p => ({ ...p, goals: [...p.goals, { id: crypto.randomUUID(), name: goalName.trim(), target, saved: 0 }] })); setGoalName(''); setGoalTarget(''); };
  const addContribution = async (goal: Goal) => {
    const amount = Number(goalContributions[goal.id]);
    if (!Number.isSafeInteger(amount) || amount < 1) return;
    setSavingGoalId(goal.id);
    setGoalError('');
    try {
      // Keep this category compatible with older deployed API validators. The unique
      // description links the expense to its goal, while the transaction affects balance.
      const transaction = await apiService.saveTransaction({ date: getTodayDateString(), amount, description: `Setoran tabungan #${goal.id}: ${goal.name}`, type: 'expense', category: 'Lainnya' });
      setSummary((current) => ({
        ...current,
        spentByCategory: {
          ...current.spentByCategory,
          ...(transaction.date.startsWith(monthKey())
            ? { [transaction.category]: (current.spentByCategory[transaction.category] ?? 0) + transaction.amount }
            : {}),
        },
        monthlyExpenses: {
          ...current.monthlyExpenses,
          ...(transaction.date.startsWith(monthKey())
            ? { [monthKey()]: (current.monthlyExpenses[monthKey()] ?? 0) + transaction.amount }
            : {}),
        },
        goalContributions: [{
          id: transaction.id,
          amount: transaction.amount,
          description: transaction.description,
          category: transaction.category,
        }, ...current.goalContributions],
      }));
      setGoalContributions(p => ({ ...p, [goal.id]: '' }));
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Setoran belum berhasil dicatat.';
      setGoalError(message);
      onError(message);
    } finally { setSavingGoalId(null); }
  };
  const contributionsFor = (goal: Goal) => summary.goalContributions.filter(tx => tx.description === `Setoran tabungan #${goal.id}: ${goal.name}` || (tx.category === 'Tabungan' && tx.description === `Setoran tabungan: ${goal.name}`));
  const savedFor = (goal: Goal) => goal.saved + contributionsFor(goal).reduce((sum, tx) => sum + tx.amount, 0);
  const deleteGoal = async (goal: Goal) => {
    const contributions = contributionsFor(goal);
    const total = contributions.reduce((sum, tx) => sum + tx.amount, 0);
    const confirmation = contributions.length
      ? `Hapus target “${goal.name}” dan ${contributions.length} transaksi setorannya (${money(total)})? Saldo akan dikembalikan sebesar nominal setoran.`
      : `Hapus target “${goal.name}” ini?`;
    if (!window.confirm(confirmation)) return;
    setDeletingGoalId(goal.id);
    setGoalError('');
    try {
      for (const tx of contributions) await apiService.deleteTransaction(tx.id);
      setSummary((current) => ({
        ...current,
        goalContributions: current.goalContributions.filter((tx) => !contributions.some((item) => item.id === tx.id)),
        spentByCategory: {
          ...current.spentByCategory,
          Lainnya: Math.max(0, (current.spentByCategory.Lainnya ?? 0) - contributions
            .filter((tx) => tx.category === 'Lainnya')
            .reduce((sum, tx) => sum + tx.amount, 0)),
          Tabungan: Math.max(0, (current.spentByCategory.Tabungan ?? 0) - contributions
            .filter((tx) => tx.category === 'Tabungan')
            .reduce((sum, tx) => sum + tx.amount, 0)),
        },
      }));
      setData(p => ({ ...p, goals: p.goals.filter(item => item.id !== goal.id) }));
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Target atau transaksi setorannya belum berhasil dihapus.';
      setGoalError(message);
      onError(message);
    } finally { setDeletingGoalId(null); }
  };
  const addRecurring = () => { const amount = Number(recAmount); if (!recDesc.trim() || !Number.isSafeInteger(amount) || amount < 1) return; setData(p => ({ ...p, recurring: [...p.recurring, { id: crypto.randomUUID(), description: recDesc.trim(), amount, type: recType, category: recCategory, day: Number(recDay), lastRun: '' }] })); setRecDesc(''); setRecAmount(''); };
  const downloadBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const filters = { page: 1, pageSize: 50, search: '', type: 'all' as const, category: 'all', startDate: '', endDate: '' };
      const first = await apiService.listTransactions(filters);
      const transactions = [...first.transactions];
      const pageCount = Math.ceil(first.total / filters.pageSize);
      for (let firstPage = 2; firstPage <= pageCount; firstPage += 4) {
        const pages = await Promise.all(Array.from(
          { length: Math.min(4, pageCount - firstPage + 1) },
          (_, index) => apiService.listTransactions({ ...filters, page: firstPage + index }),
        ));
        transactions.push(...pages.flatMap((page) => page.transactions));
      }
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), transactions, tools: data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cadangan-catatuang-${monthKey()}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Cadangan data belum berhasil dibuat.');
    } finally {
      setBackupBusy(false);
    }
  };
  const categories = recType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return <section className="space-y-4" aria-label="Anggaran, analisis, target, transaksi rutin, dan cadangan">
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><Wallet className="h-5 w-5 text-blue-600"/><h3 className="font-bold text-slate-900">Anggaran bulan ini</h3></div>
        <div className="space-y-3">
          {data.budgets.map(b => {
            const spent = summary.spentByCategory[b.category] ?? 0;
            const pct = Math.min(100, Math.round(spent / b.amount * 100));
            return <div key={b.category}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{b.category}</span>
                <div className="flex items-center gap-2">
                  <span className={pct >= 100 ? 'text-rose-700' : pct >= 80 ? 'text-amber-700' : 'text-slate-600'}>{money(Math.max(0, b.amount - spent))} tersisa</span>
                  <button
                    type="button"
                    aria-label={`Hapus anggaran ${b.category}`}
                    title={`Hapus anggaran ${b.category}`}
                    onClick={() => setData(current => ({ ...current, budgets: current.budgets.filter(item => item.category !== b.category) }))}
                    className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5"/><span>Hapus</span>
                  </button>
                </div>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }}/></div>
              <p className="mt-1 text-xs text-slate-500">Terpakai {money(spent)} dari {money(b.amount)}{pct >= 80 && <strong className="ml-1 text-amber-700">{pct >= 100 ? 'Anggaran terlampaui' : 'Hampir habis'}</strong>}</p>
            </div>;
          })}
          {!data.budgets.length && <p className="text-sm text-slate-500">Belum ada anggaran.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><select aria-label="Kategori anggaran" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select><input aria-label="Batas anggaran" className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="1" placeholder="Batas Rp" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)}/><button onClick={addBudget} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white"><Plus className="inline h-4 w-4"/> Atur</button></div>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-2 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-indigo-600"/><h3 className="font-bold">Perbandingan pengeluaran</h3></div><p className="mb-4 text-sm text-slate-500">{monthName(0)} {change === null ? '· Belum ada data bulan lalu' : `· ${change > 0 ? 'Naik' : change < 0 ? 'Turun' : 'Sama'} ${Math.abs(change)}% dari bulan lalu`}</p><div className="flex h-36 items-end gap-2 border-b border-slate-200">{monthly.map((m,i) => <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"><span className="mb-1 truncate text-[10px] text-slate-500">{m.amount ? `${Math.round(m.amount / 1000)}k` : ''}</span><div title={`${m.label}: ${money(m.amount)}`} className={`mx-auto w-full max-w-10 rounded-t-md ${i === 5 ? 'bg-blue-600' : 'bg-blue-200'}`} style={{height: `${m.amount ? Math.max(5, m.amount / Math.max(1, ...monthly.map(x=>x.amount)) * 90) : 2}%`}}/><span className="mt-2 text-xs text-slate-500">{m.label}</span></div>)}</div><p className="mt-3 text-sm font-semibold">Bulan ini: {money(current)}</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-2 flex items-center gap-2"><Target className="h-5 w-5 text-emerald-600"/><h3 className="font-bold">Target menabung</h3></div><p className="mb-3 text-xs text-slate-500">Catat setoran sebagai pengeluaran. Saldo berkurang dan progres target bertambah otomatis.</p>{goalError&&<p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{goalError}</p>}<div className="space-y-4">{data.goals.map(g=>{const saved=savedFor(g);const pct=Math.min(100,Math.round(saved/g.target*100));return <div key={g.id}><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{g.name}</span><button type="button" aria-label={`Hapus target ${g.name}`} title="Hapus target dan transaksi setorannya" disabled={deletingGoalId===g.id} onClick={()=>void deleteGoal(g)} className="text-slate-400 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4"/></button><span>{pct}%</span></div><div className="my-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{width:`${pct}%`}}/></div><div className="mb-2 text-xs text-slate-500">{money(saved)} dari {money(g.target)}</div><div className="flex gap-2"><input aria-label={`Nominal setoran untuk ${g.name}`} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-2 text-sm" type="number" min="1" placeholder="Nominal setoran Rp" value={goalContributions[g.id] ?? ''} onChange={e=>setGoalContributions(p=>({...p,[g.id]:e.target.value}))}/><button type="button" disabled={savingGoalId===g.id || !goalContributions[g.id] || Number(goalContributions[g.id])<1} onClick={()=>void addContribution(g)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{savingGoalId===g.id?'Menyimpan...':'Catat setoran'}</button></div></div>})}{!data.goals.length&&<p className="text-sm text-slate-500">Buat target pertama untuk mulai melacak tabungan.</p>}</div><div className="mt-4 flex flex-wrap gap-2"><input aria-label="Nama target" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama target" value={goalName} onChange={e=>setGoalName(e.target.value)}/><input aria-label="Nominal target" className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="1" placeholder="Target Rp" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)}/><button onClick={addGoal} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Plus className="inline h-4 w-4"/> Buat</button></div></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Bell className="h-5 w-5 text-amber-600"/><h3 className="font-bold">Transaksi rutin</h3></div><p className="mb-3 text-xs text-slate-500">Dicatat otomatis saat dashboard dibuka pada atau setelah tanggal jadwal.</p>{reminders.map(r=><p key={r.id} role="status" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">Pengingat: {r.description} {r.day === new Date().getDate() ? 'jatuh tempo hari ini' : `jatuh tempo tanggal ${r.day}`} · {money(r.amount)}</p>)}<div className="space-y-2">{data.recurring.map(r=><div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm"><span><strong>{r.description}</strong><span className="ml-2 text-slate-500">tgl {r.day} · {money(r.amount)}</span></span><button aria-label={`Hapus ${r.description}`} onClick={()=>setData(p=>({...p,recurring:p.recurring.filter(x=>x.id!==r.id)}))} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button></div>)}{!data.recurring.length&&<p className="text-sm text-slate-500">Belum ada jadwal rutin.</p>}</div><div className="mt-4 grid grid-cols-2 gap-2"><input aria-label="Nama transaksi rutin" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Contoh: Internet" value={recDesc} onChange={e=>setRecDesc(e.target.value)}/><input aria-label="Nominal transaksi rutin" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="1" placeholder="Nominal Rp" value={recAmount} onChange={e=>setRecAmount(e.target.value)}/><select aria-label="Jenis transaksi rutin" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={recType} onChange={e=>{const value=e.target.value as TransactionType;setRecType(value);setRecCategory(value==='expense'?EXPENSE_CATEGORIES[0]:INCOME_CATEGORIES[0])}}><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select><select aria-label="Kategori transaksi rutin" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={recCategory} onChange={e=>setRecCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><label className="col-span-2 flex items-center gap-2 text-sm">Tanggal tiap bulan <input aria-label="Tanggal transaksi rutin" className="w-20 rounded-lg border border-slate-300 px-3 py-2" type="number" min="1" max="31" value={recDay} onChange={e=>setRecDay(String(Math.max(1,Math.min(31,Number(e.target.value)||1))))}/></label><button onClick={addRecurring} className="col-span-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="inline h-4 w-4"/> Tambah jadwal</button></div></article>
    </div>
    <button onClick={() => void downloadBackup()} disabled={backupBusy} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"><Download className="h-4 w-4"/> {backupBusy ? 'Menyiapkan cadangan...' : 'Unduh cadangan lengkap (JSON)'}</button>
  </section>;
}
