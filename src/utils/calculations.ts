import { Transaction, TransactionType } from '../types/finance.js';

export interface BalanceStats {
  initialBalance: number;
  totalIncome: number;
  totalExpense: number;
  currentBalance: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
}

/**
 * Calculates sum of all income transactions
 */
export function calculateTotalIncome(transactions: Transaction[]): number {
  return transactions.reduce((acc, t) => {
    if (t.type === 'income' && typeof t.amount === 'number' && !isNaN(t.amount) && t.amount > 0) {
      return acc + t.amount;
    }
    return acc;
  }, 0);
}

/**
 * Calculates sum of all expense transactions
 */
export function calculateTotalExpense(transactions: Transaction[]): number {
  return transactions.reduce((acc, t) => {
    if (t.type === 'expense' && typeof t.amount === 'number' && !isNaN(t.amount) && t.amount > 0) {
      return acc + t.amount;
    }
    return acc;
  }, 0);
}

/**
 * Calculates the current balance:
 * balance = initialBalance + totalIncome - totalExpense
 */
export function calculateBalance(initialBalance: number, transactions: Transaction[]): number {
  const safeInitial = typeof initialBalance === 'number' && !isNaN(initialBalance) ? initialBalance : 0;
  const totalIncome = calculateTotalIncome(transactions);
  const totalExpense = calculateTotalExpense(transactions);
  return safeInitial + totalIncome - totalExpense;
}

/**
 * Returns complete aggregated financial statistics
 */
export function calculateStats(initialBalance: number, transactions: Transaction[]): BalanceStats {
  const safeInitial = typeof initialBalance === 'number' && !isNaN(initialBalance) ? initialBalance : 0;
  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const t of transactions) {
    if (typeof t.amount === 'number' && !isNaN(t.amount) && t.amount > 0) {
      if (t.type === 'income') {
        totalIncome += t.amount;
        incomeCount++;
      } else if (t.type === 'expense') {
        totalExpense += t.amount;
        expenseCount++;
      }
    }
  }

  const currentBalance = safeInitial + totalIncome - totalExpense;

  return {
    initialBalance: safeInitial,
    totalIncome,
    totalExpense,
    currentBalance,
    transactionCount: transactions.length,
    incomeCount,
    expenseCount,
  };
}

/**
 * Calculates projected balance when creating or updating a transaction
 * @param currentBalance Current balance before edit/create
 * @param newType 'income' or 'expense'
 * @param newAmount positive amount
 * @param existingTransaction Optional existing transaction if editing
 */
export function previewProjectedBalance(
  currentBalance: number,
  newType: TransactionType,
  newAmount: number,
  existingTransaction?: { type: TransactionType; amount: number }
): number {
  let baseBalance = currentBalance;

  // If editing, first revert the existing transaction effect
  if (existingTransaction) {
    if (existingTransaction.type === 'income') {
      baseBalance -= existingTransaction.amount;
    } else {
      baseBalance += existingTransaction.amount;
    }
  }

  // Apply new transaction
  if (newType === 'income') {
    return baseBalance + newAmount;
  } else {
    return baseBalance - newAmount;
  }
}

/**
 * Sorts transactions by date descending, with tiebreaker on createdAt descending
 */
export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    // Compare date (YYYY-MM-DD)
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    // Compare createdAt
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}
