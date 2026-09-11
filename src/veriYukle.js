import { piyasaDogrula } from "./piyasa.js";

export async function piyasaYukle(url, mevcut, { fetcher = fetch, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error(`Veri sunucusu HTTP ${response.status} döndürdü.`);
    const data = piyasaDogrula(await response.json());
    if (data.guncelFiyatlar.tarih < mevcut.guncelFiyatlar.tarih
      || data.guncelFiyatlar.kaynak.yayinTarihi < mevcut.guncelFiyatlar.kaynak.yayinTarihi
      || data.karar.resmiFiyatTarihi < mevcut.karar.resmiFiyatTarihi) {
      throw new Error("Sunucudaki eski veri uygulanmadı.");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// Keep the user's scenario when only the source-check timestamp changes.
export function veriKimligi(veri) {
  const { kontrolZamani, ...fiyat } = veri.guncelFiyatlar;
  return JSON.stringify({ ...veri, guncelFiyatlar: fiyat });
}
