import { TransactionType } from '../types/finance.js';

/**
 * Format a number to Indonesian Rupiah currency string.
 * Examples:
 *  1300000 -> "Rp1.300.000"
 *  -30000 -> "-Rp30.000"
 *  0 -> "Rp0"
 */
export function formatRupiah(
  amount: number,
  options?: {
    showSign?: boolean;
    type?: TransactionType;
  }
): string {
  if (isNaN(amount) || !isFinite(amount)) {
    return 'Rp0';
  }

  const isNegative = amount < 0;
  const absValue = Math.abs(Math.round(amount));

  // Format with period as thousand separator
  const formattedAbs = new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absValue);

  if (options?.type === 'income') {
    return options.showSign ? `+Rp${formattedAbs}` : `Rp${formattedAbs}`;
  }

  if (options?.type === 'expense') {
    return options.showSign ? `-Rp${formattedAbs}` : `Rp${formattedAbs}`;
  }

  if (isNegative) {
    return `-Rp${formattedAbs}`;
  }

  if (options?.showSign && amount > 0) {
    return `+Rp${formattedAbs}`;
  }

  return `Rp${formattedAbs}`;
}

/**
 * Formats a YYYY-MM-DD date into Indonesian locale readable string.
 * Example: "2026-09-30" -> "30 Sep 2026"
 */
export function formatIndonesianDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return dateString;

    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return dateString;

    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely parses user typed string into a positive integer/number
 */
export function parseAmount(val: string | number): number {
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? 0 : Math.max(0, Math.round(val));
  }
  // Strip out "Rp", ".", ",", spaces, letters
  const cleaned = val.replace(/[^0-9]/g, '');
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}
