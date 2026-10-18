import { TransactionType } from '../types/finance.js';

export interface ParsedTransactionData {
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
}

export const aiService = {
  /**
   * Sends natural language text to AI endpoint to parse structured transaction data
   * Example: "tadi siang beli nasi padang 25rb"
   */
  async parseNaturalLanguage(text: string): Promise<ParsedTransactionData> {
    const res = await fetch('/api/ai/parse-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.error || 'Gagal memproses teks dengan AI.');
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error('Hasil pemrosesan AI tidak valid.');
    }

    return json.data as ParsedTransactionData;
  },
};
