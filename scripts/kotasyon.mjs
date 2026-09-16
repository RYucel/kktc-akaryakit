#!/usr/bin/env node
// Kotasyon toplayıcı — kur, Brent, gasoil ve HSFO için ÜCRETSİZ kaynakları dener.
//
// Varsayılan kip --dry-run: hiçbir şey yazmaz, her kaynağı deneyip ne bulduğunu raporlar.
// Hangi kaynağın gerçekten erişilebilir olduğunu ölçmek için önce bunu çalıştır.
//
//   node scripts/kotasyon.mjs                 # rapor
//   node scripts/kotasyon.mjs --yaz           # doğrulananları piyasa.json'a işle
//   node scripts/kotasyon.mjs --alan gasoil   # tek alanı dene
//
// Disiplin gazete.py ile aynı: şüpheli değeri asla yazma. Kaynak biçim değiştirmiş,
// tarih uyuşmuyor ya da değer olağan aralığın dışındaysa dosyaya dokunmadan çık.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { piyasaDogrula, kktcBugun, tarihGecerli } from "../src/piyasa.js";

export const ARALIK = { gasoil: [300, 3000], hsfo: [50, 3000], brent: [20, 300], kur: [10, 200] };
export const MAKS_YAS_GUN = 5;
const ZAMAN_ASIMI_MS = 15000;
const UA = "kktc-akaryakit/1.0 (+https://github.com/RYucel/kktc-akaryakit)";

/* ---------------------------------------------------------------- */
/*  Ayrıştırıcılar — saf fonksiyonlar, ağ yok, test edilebilir       */
/* ---------------------------------------------------------------- */

const sayi = (s) => {
  const v = Number(String(s).trim().replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
};

// KKTC Merkez Bankası "Tarih Bazında Kur Sorgulama": USD satırının Döviz Satış sütunu.
// Sütun sırası: Döviz Alış, Döviz Satış, Efektif Alış, Efektif Satış.
export function mbKur(metin) {
  const duz = metin.replace(/<[^>]+>/g, " ").replace(/&nbsp;?/gi, " ").replace(/\s+/g, " ");
  const tarih = duz.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*Tarihinde/);
  const satir = duz.match(/1\s*AMER[İI]KAN\s*DOLARI\s*\(USD\)\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);
  if (!satir) return { hata: "USD satırı bulunamadı; sayfa biçimi değişmiş olabilir" };
  const deger = sayi(satir[2]);
  if (deger == null) return { hata: "Döviz Satış sayıya çevrilemedi" };
  return { deger, tarih: tarih ? `${tarih[3]}-${tarih[2]}-${tarih[1]}` : null };
}

// Stooq tek satır CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
export function stooqCsv(metin) {
  const satirlar = metin.trim().split(/\r?\n/);
  if (satirlar.length < 2) return { hata: "CSV boş" };
  const baslik = satirlar[0].toLowerCase().split(",");
  const veri = satirlar[1].split(",");
  const al = (ad) => { const i = baslik.indexOf(ad); return i < 0 ? null : veri[i]; };
  const ham = al("close");
  if (ham == null) return { hata: "Close sütunu yok" };
  if (/^n\/?d$/i.test(ham.trim())) return { hata: "Stooq bu sembol için veri döndürmedi (N/D)" };
  const deger = sayi(ham);
  if (deger == null) return { hata: `Close sayıya çevrilemedi: ${ham}` };
  const t = al("date");
  return { deger, tarih: t && tarihGecerli(t) ? t : null };
}

// Yahoo Finance chart API: son kapanmış günün kapanışı.
export function yahooChart(metin) {
  let j;
  try { j = JSON.parse(metin); } catch { return { hata: "JSON ayrıştırılamadı" }; }
  const r = j?.chart?.result?.[0];
  if (!r) return { hata: j?.chart?.error?.description || "sonuç yok" };
  const zaman = r.timestamp || [];
  const kapanis = r.indicators?.quote?.[0]?.close || [];
  for (let i = kapanis.length - 1; i >= 0; i--) {
    if (typeof kapanis[i] === "number" && Number.isFinite(kapanis[i])) {
      return { deger: kapanis[i], tarih: new Date(zaman[i] * 1000).toISOString().slice(0, 10) };
    }
  }
  return { hata: "kapanış serisi boş" };
}

/* ---------------------------------------------------------------- */
/*  Kaynak listesi — hepsi ücretsiz; sıra denenme sırasıdır          */
/* ---------------------------------------------------------------- */

export const KAYNAKLAR = {
  kur: [
    { ad: "KKTC Merkez Bankası", url: "https://www.kktcmerkezbankasi.org/tr/veriler/doviz_kurlari/kur_sorgulama", ayristir: mbKur },
  ],
  brent: [
    { ad: "Stooq cb.f", url: "https://stooq.com/q/l/?s=cb.f&f=sd2t2ohlcv&h&e=csv", ayristir: stooqCsv },
    { ad: "Yahoo BZ=F", url: "https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=10d", ayristir: yahooChart },
  ],
  gasoil: [
    { ad: "Stooq qs.f", url: "https://stooq.com/q/l/?s=qs.f&f=sd2t2ohlcv&h&e=csv", ayristir: stooqCsv },
    { ad: "Stooq lgo.f", url: "https://stooq.com/q/l/?s=lgo.f&f=sd2t2ohlcv&h&e=csv", ayristir: stooqCsv },
    { ad: "Stooq lf.f", url: "https://stooq.com/q/l/?s=lf.f&f=sd2t2ohlcv&h&e=csv", ayristir: stooqCsv },
    { ad: "Yahoo LGO=F", url: "https://query1.finance.yahoo.com/v8/finance/chart/LGO%3DF?interval=1d&range=10d", ayristir: yahooChart },
  ],
  // HSFO'nun bilinen ücretsiz günlük kaynağı yok; sözleşme gün sonu uzlaşması yayımlıyor
  // ve hacmi çok düşük. Aday çıkarsa buraya eklenir.
  hsfo: [],
};

/* ---------------------------------------------------------------- */

export function denetle(alan, sonuc, bugun) {
  if (sonuc.hata) return { durum: "hata", neden: sonuc.hata };
  const [min, max] = ARALIK[alan];
  if (!(typeof sonuc.deger === "number" && Number.isFinite(sonuc.deger))) return { durum: "red", neden: "sayı değil" };
  if (sonuc.deger < min || sonuc.deger > max) return { durum: "red", neden: `${min}–${max} aralığı dışında, birim hatası olabilir` };
  if (!sonuc.tarih) return { durum: "red", neden: "kaynakta tarih yok" };
  if (!tarihGecerli(sonuc.tarih)) return { durum: "red", neden: `tarih geçersiz: ${sonuc.tarih}` };
  if (sonuc.tarih > bugun) return { durum: "red", neden: "gelecek tarih" };
  const yas = Math.round((Date.parse(bugun) - Date.parse(sonuc.tarih)) / 86400000);
  if (yas > MAKS_YAS_GUN) return { durum: "red", neden: `${yas} gün eski` };
  return { durum: "kabul", neden: "" };
}

async function getir(url) {
  const ctrl = new AbortController();
  const zamanlayici = setTimeout(() => ctrl.abort(), ZAMAN_ASIMI_MS);
  try {
    const y = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctrl.signal, redirect: "follow" });
    const metin = await y.text();
    return y.ok ? { metin, kod: y.status } : { hata: `HTTP ${y.status}`, kod: y.status };
  } catch (e) {
    return { hata: e.name === "AbortError" ? "zaman aşımı" : e.message };
  } finally {
    clearTimeout(zamanlayici);
  }
}

export async function topla(alanlar, bugun) {
  const rapor = {};
  for (const alan of alanlar) {
    rapor[alan] = [];
    for (const kaynak of KAYNAKLAR[alan] || []) {
      const cevap = await getir(kaynak.url);
      if (cevap.hata) { rapor[alan].push({ ...kaynak, durum: "hata", neden: cevap.hata }); continue; }
      const sonuc = kaynak.ayristir(cevap.metin);
      rapor[alan].push({ ...kaynak, ...sonuc, ...denetle(alan, sonuc, bugun) });
    }
  }
  return rapor;
}

const KIP = { kabul: "✓", red: "✗", hata: "!" };

function yazdir(rapor) {
  for (const [alan, denemeler] of Object.entries(rapor)) {
    if (!denemeler.length) { console.log(`\n${alan}\n  (tanımlı ücretsiz kaynak yok)`); continue; }
    console.log(`\n${alan}`);
    for (const d of denemeler) {
      const deger = d.deger == null ? "—" : String(d.deger);
      console.log(`  ${KIP[d.durum]} ${d.ad.padEnd(24)} ${deger.padStart(10)}  ${d.tarih || ""}  ${d.neden || ""}`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const yaz = argv.includes("--yaz");
  const i = argv.indexOf("--alan");
  const alanlar = i >= 0 && argv[i + 1] ? [argv[i + 1]] : Object.keys(KAYNAKLAR);
  const bilinmeyen = alanlar.filter((a) => !(a in KAYNAKLAR));
  if (bilinmeyen.length) { console.error(`Bilinmeyen alan: ${bilinmeyen.join(", ")}`); process.exit(2); }

  const bugun = kktcBugun();
  console.log(`Kotasyon taraması — ${bugun}${yaz ? "" : "  (deneme kipi, dosya değişmez)"}`);
  const rapor = await topla(alanlar, bugun);
  yazdir(rapor);

  const kabul = Object.entries(rapor)
    .map(([alan, d]) => [alan, d.find((x) => x.durum === "kabul")])
    .filter(([, x]) => x);
  console.log(`\n${kabul.length}/${alanlar.length} alan için doğrulanmış değer bulundu.`);
  if (!yaz) { console.log("Yazmak için: node scripts/kotasyon.mjs --yaz"); return; }
  if (!kabul.length) { console.log("Yazılacak değer yok; dosyaya dokunulmadı."); return; }

  const yol = new URL("../public/data/piyasa.json", import.meta.url);
  const veri = JSON.parse(await readFile(yol, "utf8"));
  piyasaDogrula(veri, bugun);
  let degisen = 0;
  for (const [alan, x] of kabul) {
    let kayit = veri.kayitlar.find((k) => k.tarih === x.tarih);
    if (!kayit) { kayit = { tarih: x.tarih, kaynak: x.ad, kaynaklar: [{ ad: x.ad, url: x.url }] }; veri.kayitlar.push(kayit); }
    if (kayit[alan] != null) continue;              // mevcut değerin üzerine yazma
    kayit[alan] = x.deger;
    degisen++;
  }
  if (!degisen) { console.log("Tüm değerler zaten kayıtlı; dosyaya dokunulmadı."); return; }
  veri.kayitlar.sort((a, b) => a.tarih.localeCompare(b.tarih));
  piyasaDogrula(veri, bugun);
  await writeFile(yol, `${JSON.stringify(veri, null, 2)}\n`);
  console.log(`${degisen} değer yazıldı.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
