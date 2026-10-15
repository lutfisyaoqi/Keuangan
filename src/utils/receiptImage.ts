const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;
const ALLOWED_RECEIPT_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export async function prepareReceiptImage(file: File): Promise<File> {
  if (!ALLOWED_RECEIPT_MIMES.includes(file.type)) {
    throw new Error('Pilih gambar JPG, PNG, atau WEBP.');
  }
  if (file.size > MAX_RECEIPT_SIZE) {
    throw new Error('Ukuran gambar maksimal 5 MB.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Gambar belum dapat diproses di browser ini.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Gambar belum dapat dikompres.')), file.type, 0.8);
    });
    if (!ALLOWED_RECEIPT_MIMES.includes(blob.type)) throw new Error('Format gambar hasil kompresi tidak didukung.');
    if (blob.size > MAX_RECEIPT_SIZE) throw new Error('Ukuran gambar tetap lebih dari 5 MB setelah dikompres.');
    const stem = file.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'bukti-transaksi';
    const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
    return new File([blob], `${stem}.${extension}`, { type: blob.type, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
