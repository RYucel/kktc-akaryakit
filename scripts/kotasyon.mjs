#!/usr/bin/env node
// Kotasyon toplayıcı — kur, Brent, gasoil ve HSFO için ÜCRETSİZ kaynakları dener.
//
// Varsayılan kip --dry-run: hiçbir şey yazmaz, her kaynağı deneyip ne bulduğunu raporlar.
// Hangi kaynağın gerçekten erişilebilir olduğunu ölçmek için önce bunu çalıştır.
//
//   node scripts/kotasyon.mjs                 # rapor
//   node scripts/kotasyon.mjs --yaz           # doğrulananları piyasa.json'a işle
//   node scripts/kotasyon.mjs --alan gasoil   # tek alanı dene
//   node scripts/kotasyon.mjs --yaz --gecmis  # serinin tamamını boş günlere işle (bir kerelik)
//
// Disiplin gazete.py ile aynı: şüpheli değeri asla yazma. Kaynak biçim değiştirmiş,
// tarih uyuşmuyor ya da değer olağan aralığın dışındaysa dosyaya dokunmadan çık.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { piyasaDogrula, kktcBugun, tarihGecerli } from "../src/piyasa.js";

export const ARALIK = { gasoil: [300, 3000], hsfo: [50, 3000], ho: [0.5, 20], rb: [0.5, 20], brent: [20, 300], kur: [10, 200] };

// Kaynaklar kayan nokta artığı döndürebiliyor (Yahoo float32: 5.26200008392334). Bu dosya
// elle de düzenleniyor; değerler alanın gerçek hassasiyetine yuvarlanarak yazılır.
export const BASAMAK = { gasoil: 2, hsfo: 3, ho: 4, rb: 4, brent: 2, kur: 4 };
export const yuvarla = (alan, deger) => Number(deger.toFixed(BASAMAK[alan] ?? 4));

export const MAKS_YAS_GUN = 5;
// Geçmiş doldurma kipinde daha eski günler kabul edilir: kalibrasyon penceresi resmî fiyatın
// yürürlük tarihinden öncesine bakar, oradaki günler doğal olarak MAKS_YAS_GUN'den eskidir.
export const GECMIS_YAS_GUN = 45;
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

// Yahoo Finance chart API: günlük kapanış serisi.
export function yahooChart(metin) {
  let j;
  try { j = JSON.parse(metin); } catch { return { hata: "JSON ayrıştırılamadı" }; }
  const r = j?.chart?.result?.[0];
  if (!r) return { hata: j?.chart?.error?.description || "sonuç yok" };
  const zaman = r.timestamp || [];
  const kapanis = r.indicators?.quote?.[0]?.close || [];
  const seri = [];
  for (let i = 0; i < kapanis.length; i++) {
    if (typeof kapanis[i] === "number" && Number.isFinite(kapanis[i]) && zaman[i]) {
      seri.push({ tarih: new Date(zaman[i] * 1000).toISOString().slice(0, 10), deger: kapanis[i] });
    }
  }
  return seri.length ? { seri } : { hata: "kapanış serisi boş" };
}

// Borsa serilerinde bugünün barı henüz kapanmamıştır; kapanış diye kaydedilirse
// gün içi bir değer uzlaşma yerine geçer. Bu yüzden kapanmamış gün elenir.
export const KAPANMIS_GUN_GEREKIR = new Set(["brent", "gasoil", "hsfo", "ho", "rb"]);

// Yahoo tek istekte bir aylık seri döndürüyor; geçmiş doldurma kipi bunun tamamını kullanır.
// Kalibrasyon penceresi ancak böyle dolar: canlı koşu yalnız son kapanmış günü yazabilir.
export function seriSec(sonuc, alan, bugun, maksYas = GECMIS_YAS_GUN) {
  if (sonuc.hata) return [];
  const seri = sonuc.seri || (sonuc.deger != null ? [{ tarih: sonuc.tarih, deger: sonuc.deger }] : []);
  const uygun = KAPANMIS_GUN_GEREKIR.has(alan) ? seri.filter((x) => x.tarih && x.tarih < bugun) : seri;
  return uygun
    .map((x) => ({ ...x, deger: typeof x.deger === "number" ? yuvarla(alan, x.deger) : x.deger }))
    .filter((x) => denetle(alan, x, bugun, maksYas).durum === "kabul");
}

export function sec(sonuc, alan, bugun) {
  if (sonuc.hata) return sonuc;
  const seri = sonuc.seri || (sonuc.deger != null ? [{ tarih: sonuc.tarih, deger: sonuc.deger }] : []);
  const uygun = KAPANMIS_GUN_GEREKIR.has(alan) ? seri.filter((x) => x.tarih && x.tarih < bugun) : seri;
  if (!uygun.length) {
    return { hata: seri.length ? "yalnız kapanmamış günün değeri var (gün içi)" : "seri boş" };
  }
  return uygun[uygun.length - 1];
}

/* ---------------------------------------------------------------- */
/*  Kaynak listesi — hepsi ücretsiz; sıra denenme sırasıdır          */
/* ---------------------------------------------------------------- */

// Yahoo'da CME'nin "European Low Sulphur Gasoil (10 ppm)" sözleşmesi 7F kodlu ve
// vade ayına göre isimlenir (7F + ay kodu + yıl + .NYM). Sürekli sembol tutmazsa
// önümüzdeki üç vade denenir; böylece roll döneminde de bir tanesi yanıt verir.
const AY_KODU = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"];
export function vadeSembolleri(bugun, kok, adet = 3) {
  const [y, a] = bugun.split("-").map(Number);
  const cikti = [];
  for (let i = 0; i < adet; i++) {
    const ay = (a - 1 + i) % 12;
    const yil = y + Math.floor((a - 1 + i) / 12);
    cikti.push(`${kok}${AY_KODU[ay]}${String(yil).slice(-2)}.NYM`);
  }
  return cikti;
}

const yahoo = (sembol, aralik = "1mo") =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}?interval=1d&range=${aralik}`;

// Sembol kökünü tahmin etmek yerine Yahoo'ya sordurmak için: --ara <terim>
export const YAHOO_ARA = (terim) =>
  `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(terim)}&quotesCount=25&newsCount=0`;

export function yahooArama(metin) {
  let j;
  try { j = JSON.parse(metin); } catch { return { hata: "JSON ayrıştırılamadı" }; }
  const q = j?.quotes;
  if (!Array.isArray(q)) return { hata: "quotes alanı yok" };
  return { bulunan: q.map((x) => ({
    sembol: x.symbol, borsa: x.exchange || x.exchDisp || "", tur: x.quoteType || "",
    ad: x.shortname || x.longname || "",
  })) };
}

export const KAYNAKLAR = {
  kur: [
    { ad: "KKTC Merkez Bankası", url: "https://www.kktcmerkezbankasi.org/tr/veriler/doviz_kurlari/kur_sorgulama", ayristir: mbKur },
  ],
  brent: [
    { ad: "Yahoo BZ=F", url: yahoo("BZ=F"), ayristir: yahooChart },
  ],
  // ICE gasoil'in ücretsiz günlük kaynağı bulunamadı. Yahoo'da yalnız S&P GSCI gasoil
  // ENDEKSLERİ var (^SPGPRGOP vb.); bunlar $/ton fiyat değil seviye, toplamsal kalibrasyonla
  // kullanılamaz. Gasoil elle giriliyor; otomatik vekil olarak ho (NY ULSD) kullanılıyor.
  gasoil: [],
  hsfo: [],
  ho: [
    { ad: "Yahoo HO=F", url: yahoo("HO=F", "1mo"), ayristir: yahooChart },
    ...vadeSembolleri(kktcBugun(), "HO").map((s) => ({ ad: `Yahoo ${s}`, url: yahoo(s), ayristir: yahooChart })),
  ],
  // Eurobob'un da ücretsiz günlük kaynağı yok (Yahoo'da Avrupa ürün sözleşmeleri hiç taşınmıyor;
  // 7F gasoil ve 7H/EBB Eurobob kökleri 404 döner). Benzinin otomatik vekili bu yüzden RBOB.
  rb: [
    { ad: "Yahoo RB=F", url: yahoo("RB=F", "1mo"), ayristir: yahooChart },
    ...vadeSembolleri(kktcBugun(), "RB").map((s) => ({ ad: `Yahoo ${s}`, url: yahoo(s), ayristir: yahooChart })),
  ],
};

/* ---------------------------------------------------------------- */
/*  Günlüğe yazma — künye değerle birlikte gider                     */
/* ---------------------------------------------------------------- */

// Var olan bir güne değer eklerken künyeyi de güncellemek şart. Çoğu günün kaydı
// radar formundan zaten oluşmuş oluyor; künye yazılmazsa toplayıcının değeri o
// kaydın önceki kaynağına (ör. elle girilmiş TradingView notuna) sessizce yapışır
// ve uygulamanın günlük tablosu ziyaretçiye yanlış kaynak gösterir.
export function kunyeEkle(kayit, yazilanlar) {
  const adlar = [...new Set(yazilanlar.map((x) => x.ad))];
  const mevcut = (kayit.kaynak || "").split(" + ").map((x) => x.trim()).filter(Boolean);
  kayit.kaynak = [...mevcut, ...adlar.filter((a) => !mevcut.includes(a))].join(" + ");
  kayit.kaynaklar = [...(kayit.kaynaklar || []), ...yazilanlar.map((x) => ({ ad: x.ad, url: x.url }))]
    .filter((x, i, d) => x?.url && d.findIndex((y) => y.url === x.url) === i);
  const dokum = yazilanlar.map((x) => `${x.alan} (${x.ad})`).join(", ");
  const cumle = `Otomatik toplayıcı: ${dokum}; kaynağın belirttiği tarihli kapanış.`;
  kayit.not = kayit.not ? `${kayit.not} ${cumle}` : cumle;
  return kayit;
}

// kabul: [alan, {deger, tarih, ad, url}] çiftleri. veri yerinde değiştirilir.
// Dönüş: yazılan değer sayısı.
export function kayitlariIsle(veri, kabul) {
  const yazilan = new Map();
  for (const [alan, x] of kabul) {
    let kayit = veri.kayitlar.find((k) => k.tarih === x.tarih);
    if (!kayit) { kayit = { tarih: x.tarih }; veri.kayitlar.push(kayit); }
    if (kayit[alan] != null) continue;              // mevcut değerin üzerine yazma
    kayit[alan] = x.deger;
    if (!yazilan.has(x.tarih)) yazilan.set(x.tarih, { kayit, alanlar: [] });
    yazilan.get(x.tarih).alanlar.push({ alan, ad: x.ad, url: x.url });
  }
  for (const { kayit, alanlar } of yazilan.values()) kunyeEkle(kayit, alanlar);
  veri.kayitlar.sort((a, b) => a.tarih.localeCompare(b.tarih));
  return [...yazilan.values()].reduce((a, x) => a + x.alanlar.length, 0);
}

/* ---------------------------------------------------------------- */

export function denetle(alan, sonuc, bugun, maksYas = MAKS_YAS_GUN) {
  if (sonuc.hata) return { durum: "hata", neden: sonuc.hata };
  const [min, max] = ARALIK[alan];
  if (!(typeof sonuc.deger === "number" && Number.isFinite(sonuc.deger))) return { durum: "red", neden: "sayı değil" };
  if (sonuc.deger < min || sonuc.deger > max) return { durum: "red", neden: `${min}–${max} aralığı dışında, birim hatası olabilir` };
  if (!sonuc.tarih) return { durum: "red", neden: "kaynakta tarih yok" };
  if (!tarihGecerli(sonuc.tarih)) return { durum: "red", neden: `tarih geçersiz: ${sonuc.tarih}` };
  if (sonuc.tarih > bugun) return { durum: "red", neden: "gelecek tarih" };
  const yas = Math.round((Date.parse(bugun) - Date.parse(sonuc.tarih)) / 86400000);
  if (yas > maksYas) return { durum: "red", neden: `${yas} gün eski` };
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
      const ayristirilmis = kaynak.ayristir(cevap.metin);
      const secilen = sec(ayristirilmis, alan, bugun);
      if (typeof secilen.deger === "number" && Number.isFinite(secilen.deger)) secilen.deger = yuvarla(alan, secilen.deger);
      const seriKabul = seriSec(ayristirilmis, alan, bugun);
      rapor[alan].push({ ...kaynak, ...secilen, ...denetle(alan, secilen, bugun), seriKabul });
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
  const a = argv.indexOf("--ara");
  if (a >= 0) {
    const terimler = argv.slice(a + 1).filter((x) => !x.startsWith("--"));
    if (!terimler.length) { console.error("Kullanım: --ara <terim> [terim...]"); process.exit(2); }
    for (const terim of terimler) {
      console.log(`\n"${terim}" için Yahoo sembol araması`);
      const cevap = await getir(YAHOO_ARA(terim));
      if (cevap.hata) { console.log(`  ! ${cevap.hata}`); continue; }
      const r = yahooArama(cevap.metin);
      if (r.hata) { console.log(`  ! ${r.hata}`); continue; }
      if (!r.bulunan.length) { console.log("  (sonuç yok)"); continue; }
      for (const x of r.bulunan) {
        console.log(`  ${x.sembol.padEnd(16)} ${String(x.borsa).padEnd(8)} ${String(x.tur).padEnd(8)} ${x.ad}`);
      }
    }
    return;
  }
  const yaz = argv.includes("--yaz");
  const gecmis = argv.includes("--gecmis");
  const i = argv.indexOf("--alan");
  const alanlar = i >= 0 && argv[i + 1] ? [argv[i + 1]] : Object.keys(KAYNAKLAR);
  const bilinmeyen = alanlar.filter((a) => !(a in KAYNAKLAR));
  if (bilinmeyen.length) { console.error(`Bilinmeyen alan: ${bilinmeyen.join(", ")}`); process.exit(2); }

  const bugun = kktcBugun();
  console.log(`Kotasyon taraması — ${bugun}${gecmis ? "  (geçmiş doldurma)" : ""}${yaz ? "" : "  (deneme kipi, dosya değişmez)"}`);
  const rapor = await topla(alanlar, bugun);
  yazdir(rapor);

  // Geçmiş kipinde ilk çalışan kaynağın tüm serisi yazılır; normalde yalnız son kapanmış gün.
  const kabul = [];
  for (const [alan, denemeler] of Object.entries(rapor)) {
    if (gecmis) {
      const ilk = denemeler.find((x) => x.seriKabul?.length);
      if (ilk) for (const g of ilk.seriKabul) kabul.push([alan, { ...g, ad: ilk.ad, url: ilk.url }]);
    } else {
      const x = denemeler.find((d) => d.durum === "kabul");
      if (x) kabul.push([alan, x]);
    }
  }
  const alanSayisi = new Set(kabul.map(([a]) => a)).size;
  console.log(`\n${alanSayisi}/${alanlar.length} alan için doğrulanmış değer bulundu${gecmis ? ` (${kabul.length} gün)` : ""}.`);
  if (!yaz) { console.log(`Yazmak için: node scripts/kotasyon.mjs --yaz${gecmis ? " --gecmis" : ""}`); return; }
  if (!kabul.length) { console.log("Yazılacak değer yok; dosyaya dokunulmadı."); return; }

  const yol = new URL("../public/data/piyasa.json", import.meta.url);
  const veri = JSON.parse(await readFile(yol, "utf8"));
  piyasaDogrula(veri, bugun);
  const degisen = kayitlariIsle(veri, kabul);
  if (!degisen) { console.log("Tüm değerler zaten kayıtlı; dosyaya dokunulmadı."); return; }
  piyasaDogrula(veri, bugun);
  await writeFile(yol, `${JSON.stringify(veri, null, 2)}\n`);
  console.log(`${degisen} değer yazıldı.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
