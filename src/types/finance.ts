export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // positive number > 0
  description: string;
  type: TransactionType;
  category: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  receiptPath?: string | null;
  receiptMime?: string | null;
  receiptSize?: number | null;
}

export interface AppSettings {
  initialBalance: number;
}

export const EXPENSE_CATEGORIES = [
  'Makanan',
  'Transportasi',
  'Belanja',
  'Tagihan',
  'Hiburan',
  'Kesehatan',
  'Pendidikan',
  'Tabungan',
  'Lainnya',
] as const;

export const INCOME_CATEGORIES = [
  'Uang bulanan',
  'Gaji',
  'Bonus',
  'Hadiah',
  'Lainnya',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export type FilterType = 'all' | 'income' | 'expense';

export interface TransactionFilterState {
  search: string;
  type: FilterType;
  category: string;
  startDate: string;
  endDate: string;
}
