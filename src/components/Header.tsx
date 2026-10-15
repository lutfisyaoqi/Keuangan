import React from 'react';
import { Wallet, Plus, Settings2, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeaderProps {
  onOpenAddModal: () => void;
  onOpenSettingsModal: () => void;
  userName: string;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAddModal,
  onOpenSettingsModal,
  userName,
  onLogout,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">
              CatatUang
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Pencatatan Keuangan Pribadi
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/settings/profile" className="hidden sm:inline text-sm font-medium text-slate-600 hover:text-blue-700">{userName}</Link>
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title="Pengaturan Saldo Awal"
          >
            <Settings2 className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Saldo Awal</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm shadow-blue-600/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Tambah Transaksi</span>
          </button>
        </div>
      </div>
    </header>
  );
};
