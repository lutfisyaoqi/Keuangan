import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateInitialBalance, validateTransaction } from './validation.js';
import { calculateStats } from './calculations.js';
import { createFinancialSummaryCsv } from './financeExport.js';
import { Transaction } from '../types/finance.js';

const validExpense = {
  date: '2026-09-30',
  amount: 30_000,
  description: 'Makan siang',
  type: 'expense',
  category: 'Makanan',
};

test('accepts a valid positive transaction', () => {
  assert.equal(validateTransaction(validExpense).isValid, true);
});

test('rejects zero or negative transaction amounts', () => {
  assert.equal(validateTransaction({ ...validExpense, amount: -1 }).isValid, false);
  assert.equal(validateTransaction({ ...validExpense, amount: 0 }).isValid, false);
});

test('rejects unsupported transaction types', () => {
  assert.equal(validateTransaction({ ...validExpense, type: 'transfer' }).isValid, false);
});

test('allows a negative balance after a valid expense', () => {
  const expense: Transaction = {
    id: 'expense-1',
    ...validExpense,
    type: 'expense',
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
  };
  const stats = calculateStats(0, [expense]);
  assert.equal(stats.currentBalance, -30_000);
  assert.equal(stats.totalExpense, 30_000);
});

test('calculates initial balance plus income minus expense', () => {
  const transactions: Transaction[] = [
    { id: 'income-1', ...validExpense, amount: 1_300_000, type: 'income', category: 'Uang bulanan', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    { id: 'expense-2', ...validExpense, type: 'expense', createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' },
  ];
  const stats = calculateStats(100_000, transactions);
  assert.equal(stats.currentBalance, 1_370_000);
  assert.equal(stats.transactionCount, 2);
});

test('exports a spreadsheet-compatible financial summary and safely escapes descriptions', () => {
  const transaction: Transaction = {
    id: 'income-1',
    ...validExpense,
    amount: 1_300_000,
    type: 'income',
    description: '=HYPERLINK("https://example.com")',
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
  };
  const csv = createFinancialSummaryCsv(calculateStats(100_000, [transaction]), [transaction]);

  assert.ok(csv.startsWith('\uFEFF"Ringkasan Keuangan"'));
  assert.ok(csv.includes('"Saldo saat ini";1400000'));
  assert.ok(csv.includes(`"'=HYPERLINK(""https://example.com"")"`));
  assert.ok(csv.includes('"Pemasukan";"Makanan";'));
});

test('rejects negative initial balance', () => {
  assert.equal(validateInitialBalance(-1).isValid, false);
  assert.deepEqual(validateInitialBalance(0), { isValid: true, value: 0 });
});