import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { closeApiResources, createApiRouter } from './server/api';

dotenv.config({
  path: [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
  ],
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
export default app;

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.path === '/admin' || req.path.startsWith('/admin/')) {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  }
  next();
});

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '32kb' }));

// Indonesian fallback parser when AI key is missing or offline
function fallbackSmartParse(text: string) {
  const lower = text.toLowerCase();
  const today = new Date();
  let dateStr = today.toISOString().split('T')[0];

  if (lower.includes('kemarin')) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    dateStr = yesterday.toISOString().split('T')[0];
  }

  // Detect Type
  const isIncome =
    lower.includes('gaji') ||
    lower.includes('uang bulanan') ||
    lower.includes('bonus') ||
    lower.includes('terima') ||
    lower.includes('dapat uang') ||
    lower.includes('hadiah') ||
    lower.includes('transfer dari') ||
    lower.includes('pemasukan');

  const type = isIncome ? 'income' : 'expense';

  // Detect Category
  let category = type === 'income' ? 'Lainnya' : 'Lainnya';
  if (type === 'income') {
    if (lower.includes('gaji')) category = 'Gaji';
    else if (lower.includes('bulanan')) category = 'Uang bulanan';
    else if (lower.includes('bonus')) category = 'Bonus';
    else if (lower.includes('hadiah')) category = 'Hadiah';
  } else {
    if (
      lower.includes('makan') ||
      lower.includes('minum') ||
      lower.includes('kopi') ||
      lower.includes('padang') ||
      lower.includes('seblak') ||
      lower.includes('bakso') ||
      lower.includes('sarapan') ||
      lower.includes('siang') ||
      lower.includes('resto') ||
      lower.includes('kafe')
    ) {
      category = 'Makanan';
    } else if (
      lower.includes('bensin') ||
      lower.includes('ojol') ||
      lower.includes('grab') ||
      lower.includes('gojek') ||
      lower.includes('parkir') ||
      lower.includes('tol') ||
      lower.includes('kereta') ||
      lower.includes('bus')
    ) {
      category = 'Transportasi';
    } else if (
      lower.includes('listrik') ||
      lower.includes('air') ||
      lower.includes('wifi') ||
      lower.includes('pulsa') ||
      lower.includes('token') ||
      lower.includes('tagihan')
    ) {
      category = 'Tagihan';
    } else if (
      lower.includes('beli') ||
      lower.includes('baju') ||
      lower.includes('sepatu') ||
      lower.includes('shopee') ||
      lower.includes('tokopedia')
    ) {
      category = 'Belanja';
    } else if (
      lower.includes('bioskop') ||
      lower.includes('game') ||
      lower.includes('nonton') ||
      lower.includes('liburan')
    ) {
      category = 'Hiburan';
    } else if (
      lower.includes('obat') ||
      lower.includes('dokter') ||
      lower.includes('klinik') ||
      lower.includes('rumah sakit')
    ) {
      category = 'Kesehatan';
    } else if (
      lower.includes('buku') ||
      lower.includes('kursus') ||
      lower.includes('sekolah') ||
      lower.includes('kuliah')
    ) {
      category = 'Pendidikan';
    }
  }

  // Extract Amount (e.g., 25rb, 25k, 1.5jt, 25000)
  let amount = 0;
  const jtMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:jt|juta)/);
  const rbMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:rb|ribu|k)\b/);
  const rpMatch = lower.match(/(?:rp\.?|nominal)?\s*(\d{1,3}(?:\.\d{3})+|\d+)/);

  if (jtMatch) {
    const val = parseFloat(jtMatch[1].replace(',', '.'));
    amount = Math.round(val * 1000000);
  } else if (rbMatch) {
    const val = parseFloat(rbMatch[1].replace(',', '.'));
    amount = Math.round(val * 1000);
  } else if (rpMatch) {
    const cleanStr = rpMatch[1].replace(/\./g, '');
    amount = parseInt(cleanStr, 10) || 0;
  }

  // Clean description
  let description = text
    .replace(/(?:tadi siang|tadi pagi|kemarin|tadi malam|hari ini)/gi, '')
    .replace(/(?:\b\d+(?:[.,]\d+)?\s*(?:jt|juta|rb|ribu|k)\b)/gi, '')
    .replace(/(?:rp\.?\s*\d+(?:\.\d+)*)/gi, '')
    .trim();

  // Capitalize first letter
  if (description.length > 0) {
    description = description.charAt(0).toUpperCase() + description.slice(1);
  } else {
    description = type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  }

  return {
    description,
    amount: amount > 0 ? amount : 25000,
    type,
    category,
    date: dateStr,
  };
}

// POST endpoint for Natural Language parsing with Gemini AI
app.post('/api/ai/parse-transaction', async (req: Request, res: Response) => {
  const { input } = req.body;

  if (!input || typeof input !== 'string' || !input.trim()) {
    res.status(400).json({ error: 'Input teks tidak boleh kosong.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // If no Gemini key is set or key is placeholder, use intelligent local fallback
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    const fallbackResult = fallbackSmartParse(input);
    res.json({
      success: true,
      source: 'heuristic',
      data: fallbackResult,
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({});
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Anda adalah asisten cerdas pencatatan keuangan pribadi Indonesia.
Tugas Anda adalah membaca kalimat transaksi bahasa sehari-hari dan mengekstraknya ke format terstruktur.

Tanggal hari ini: ${today}.
Input user: "${input}"

Aturan ekstraksi:
1. "description": deskripsi singkat yang rapi (contoh: "Beli nasi padang", "Uang bulanan", "Beli bensin").
2. "amount": angka nominal positif tanpa simbol (contoh: 25rb -> 25000, 1.5jt -> 1500000, 50k -> 50000). Nominal harus bilangan bulat positif.
3. "type": hanya boleh "income" (pemasukan/gaji/terima uang) atau "expense" (pengeluaran/beli/bayar).
4. "category":
   - Jika expense: pilih salah satu dari ["Makanan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"].
   - Jika income: pilih salah satu dari ["Uang bulanan", "Gaji", "Bonus", "Hadiah", "Lainnya"].
5. "date": format YYYY-MM-DD. Jika menyebut "kemarin", hitung tanggal kemarin. Jika "hari ini" / "tadi siang" / default gunakan ${today}.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ['income', 'expense'] },
            category: { type: Type.STRING },
            date: { type: Type.STRING },
          },
          required: ['description', 'amount', 'type', 'category', 'date'],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');

    // Basic sanitation
    const finalAmount = Math.max(1, Math.round(Number(parsedJson.amount) || 0));
    const finalType = parsedJson.type === 'income' ? 'income' : 'expense';
    const finalDate = /^\d{4}-\d{2}-\d{2}$/.test(parsedJson.date) ? parsedJson.date : today;
    const finalDesc = String(parsedJson.description || 'Transaksi').slice(0, 200);
    const finalCat = String(parsedJson.category || (finalType === 'income' ? 'Gaji' : 'Makanan'));

    res.json({
      success: true,
      source: 'gemini',
      data: {
        description: finalDesc,
        amount: finalAmount,
        type: finalType,
        category: finalCat,
        date: finalDate,
      },
    });
  } catch (err) {
    console.error('Gemini parse error, using fallback parser:', err);
    const fallbackResult = fallbackSmartParse(input);
    res.json({
      success: true,
      source: 'fallback',
      data: fallbackResult,
    });
  }
});

// Register API routes before the local development server is started so the
// same Express app can be exported as a Vercel Function.
try {
  app.use('/api', createApiRouter());
} catch (error) {
  const reason = error instanceof Error ? error.message : 'API configuration is invalid.';
  console.error(`API unavailable: ${reason}`);
  app.use('/api', (_req, res) => {
    res.status(503).json({ error: 'Layanan belum siap. Periksa konfigurasi server.' });
  });
}

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CatatUang server running at ${process.env.APP_URL}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      void closeApiResources().catch(() => {
        console.error('Failed to close the PostgreSQL session pool cleanly.');
      });
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  void startServer().catch(async (error: unknown) => {
    await closeApiResources().catch(() => undefined);
    console.error(error instanceof Error ? error.message : 'Server startup failed.');
    process.exitCode = 1;
  });
}
