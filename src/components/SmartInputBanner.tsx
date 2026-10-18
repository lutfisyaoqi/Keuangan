import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { aiService, ParsedTransactionData } from '../services/aiService.js';

interface SmartInputBannerProps {
  onParsed: (data: ParsedTransactionData) => void;
}

export const SmartInputBanner: React.FC<SmartInputBannerProps> = ({ onParsed }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const parsed = await aiService.parseNaturalLanguage(input.trim());
      setInput('');
      onParsed(parsed);
    } catch (err: unknown) {
      console.error('Smart input error:', err);
      const msg = err instanceof Error ? err.message : 'Gagal memproses teks dengan AI.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const examplePrompts = [
    'tadi siang beli nasi padang 25rb',
    'isi bensin motor 30rb',
    'terima uang bulanan 1.5jt',
    'bayar token listrik 100k',
  ];

  return (
    <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 border border-blue-200/80 rounded-2xl p-4 sm:p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
          Catat Cepat dengan AI (Smart Parse)
        </h2>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
          Gemini AI
        </span>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Ketik transaksi dalam bahasa sehari-hari. Sistem akan otomatis mengisi tipe, nominal, kategori, dan tanggal.
      </p>

      <form onSubmit={handleSubmit} className="relative flex items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          disabled={isLoading}
          placeholder='Ketik contoh: "tadi siang beli nasi padang 25rb" lalu tekan Enter...'
          className="w-full pl-4 pr-28 sm:pr-32 py-2.5 sm:py-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 shadow-xs transition-all disabled:opacity-75"
        />

        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-xs transition-all"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Memproses...</span>
            </>
          ) : (
            <>
              <span>Proses AI</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {errorMsg && (
        <p className="mt-2 text-xs text-rose-600 font-medium">{errorMsg}</p>
      )}

      {/* Suggested prompts chips */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-slate-400 mr-1">Coba contoh:</span>
        {examplePrompts.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setInput(example)}
            className="text-[11px] px-2 py-0.5 bg-white border border-slate-200/90 text-slate-600 hover:text-blue-700 hover:border-blue-300 rounded-md transition-colors"
          >
            "{example}"
          </button>
        ))}
      </div>
    </div>
  );
};
