import { Transaction } from '../types/finance.js';
import { BalanceStats, sortTransactions } from './calculations.js';

function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);

  const safeValue = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function createFinancialSummaryCsv(stats: BalanceStats, transactions: Transaction[]): string {
  const rows: (string | number)[][] = [
    ['Ringkasan Keuangan'],
    ['Metrik', 'Nilai'],
    ['Saldo awal', stats.initialBalance],
    ['Total pemasukan', stats.totalIncome],
    ['Total pengeluaran', stats.totalExpense],
    ['Saldo saat ini', stats.currentBalance],
    ['Jumlah transaksi', stats.transactionCount],
    ['Jumlah transaksi pemasukan', stats.incomeCount],
    ['Jumlah transaksi pengeluaran', stats.expenseCount],
    [],
    ['Daftar Transaksi'],
    ['Tanggal', 'Jenis transaksi', 'Kategori', 'Deskripsi', 'Jumlah (Rp)'],
    ...sortTransactions(transactions).map((transaction) => [
      transaction.date,
      transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      transaction.category,
      transaction.description,
      transaction.amount,
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}`;
}
