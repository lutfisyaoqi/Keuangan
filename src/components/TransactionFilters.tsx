import React from 'react';
import { Search, Filter, X, Calendar } from 'lucide-react';
import { EXPENSE_CATEGORIES, FilterType, INCOME_CATEGORIES } from '../types/finance.js';

interface TransactionFiltersProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  typeFilter: FilterType;
  onTypeFilterChange: (type: FilterType) => void;
  categoryFilter: string;
  onCategoryFilterChange: (cat: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  totalFiltered: number;
}

export const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onResetFilters,
  hasActiveFilters,
  totalFiltered,
}) => {
  // Combine all categories uniquely
  const allCategories = Array.from(new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
      {/* Search and Type Filter */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari transaksi (contoh: makan, seblak, bensin, gaji)..."
            className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              title="Hapus pencarian"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Type Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => onTypeFilterChange('all')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              typeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => onTypeFilterChange('income')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              typeFilter === 'income'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => onTypeFilterChange('expense')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              typeFilter === 'expense'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Expense
          </button>
        </div>
      </div>

      {/* Secondary Filters: Category & Date Range */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua Kategori</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Dari tanggal"
            />
            <span className="text-slate-400 font-medium">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Sampai tanggal"
            />
          </div>
        </div>

        {/* Reset Filter Button & Count Indicator */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <span className="text-slate-500">
            Ditemukan: <strong className="text-slate-800 font-semibold">{totalFiltered}</strong> transaksi
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              <X className="w-3.5 h-3.5" />
              Reset Filter
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
