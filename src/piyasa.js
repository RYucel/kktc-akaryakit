export const URUN_KODLARI = ["b95", "b98", "dz"];

export function kktcBugun(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Nicosia", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function tarihGecerli(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function gerekli(ok, message) { if (!ok) throw new Error(message); }
function sayi(value, min, max, field) {
  gerekli(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max, `${field}: ${min}–${max} arasında sayı gerekli.`);
}
function tarih(value, field) { gerekli(tarihGecerli(value), `${field}: geçerli YYYY-MM-DD tarihi gerekli.`); }
function kaynakUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Geçerli kaynak bağlantısı gerekli."); }
  gerekli(url.protocol === "https:" && !url.username && !url.password, "Kaynak HTTPS bağlantısı olmalı.");
}

export function fiyatDogrula(fiyat, today = kktcBugun()) {
  gerekli(fiyat && typeof fiyat === "object", "Güncel fiyat verisi gerekli.");
  tarih(fiyat.tarih, "Fiyat tarihi");
  gerekli(fiyat.tarih <= today, "Henüz yürürlüğe girmemiş fiyat yayımlanamaz.");
  tarih(fiyat.kaynak?.yayinTarihi, "Kaynak yayın tarihi");
  gerekli(fiyat.kaynak.yayinTarihi <= fiyat.tarih, "Kaynak yayın tarihi yürürlük tarihinden sonra olamaz.");
  gerekli(typeof fiyat.kaynak.ad === "string" && fiyat.kaynak.ad.trim(), "Kaynak adı gerekli.");
  kaynakUrl(fiyat.kaynak.url);
  for (const key of URUN_KODLARI) {
    const urun = fiyat.urunler?.[key];
    sayi(urun?.resmiPompa, 1, 1000, `${key} pompa fiyatı`);
    gerekli(Math.abs(urun.resmiPompa * 100 - Math.round(urun.resmiPompa * 100)) < 0.000001, "Pompa fiyatı en fazla iki ondalık basamak içermeli.");
    if (urun.resmiIAF != null) {
      sayi(urun.resmiIAF, 0.01, urun.resmiPompa, `${key} ithalatçı fiyatı`);
    }
  }
  return fiyat;
}

export function piyasaDogrula(veri, today = kktcBugun()) {
  gerekli(veri?.surum === 1, "Desteklenmeyen piyasa veri sürümü.");
  for (const key of ["resmiFiyatTarihi", "harcMuafiyetiSonGun", "paketBitis", "veriGuncelleme"]) tarih(veri.karar?.[key], `karar.${key}`);
  gerekli(veri.karar.resmiFiyatTarihi <= today && veri.karar.veriGuncelleme <= today, "Model verisi gelecek tarihli olamaz.");
  gerekli(typeof veri.karar.kaynakGazete === "string" && veri.karar.kaynakGazete.trim(), "Model kaynağı gerekli.");
  for (const key of URUN_KODLARI) {
    const urun = veri.urunler?.[key];
    sayi(urun?.resmiPompa, 1, 1000, `${key} model pompa fiyatı`);
    sayi(urun?.resmiIAF, 0.01, urun.resmiPompa, `${key} model ithalatçı fiyatı`);
    sayi(urun?.resmiFif, 0, 500, `${key} fon`);
  }
  const ayar = veri.bugunkuKurallar?.ayar;
  for (const key of ["tampon", "rihtim", "belediye", "turizm", "prim", "kdv"]) gerekli(typeof ayar?.[key] === "boolean", `${key}: true veya false gerekli.`);
  sayi(ayar.gumruk, 0, 100, "Gümrük");
  gerekli(ayar.fifMod === "resmi", "Modelde fifMod resmi olmalı.");
  gerekli(typeof veri.bugunkuKurallar.aciklama === "string", "Model kuralları açıklaması gerekli.");
  // Modelin kendi referans fiyatıyla tutarlı kalmasını doğrula.
  for (const key of URUN_KODLARI) {
    const u = veri.urunler[key];
    gerekli(Math.abs(u.resmiIAF * 1.18 * (ayar.kdv ? 1.1 : 1) - u.resmiPompa) < 0.011, `${key}: model İAF, bayi payı, KDV ve pompa fiyatı uyuşmuyor.`);
  }
  sayi(veri.varsayim?.kur, 1, 1000, "Model kuru");
  sayi(veri.varsayim?.nakliye, 0, 100, "Nakliye");
  gerekli(Array.isArray(veri.kayitlar), "kayitlar bir liste olmalı.");
  for (const kayit of veri.kayitlar) {
    tarih(kayit?.tarih, "Günlük tarihi");
    gerekli(kayit.tarih <= today, "Günlük kaydı gelecek tarihli olamaz.");
    for (const key of ["b95", "dz", "eurobob", "gasoil", "brent", "kur"]) {
      if (kayit[key] != null) sayi(kayit[key], 0.01, 10000, `Günlük ${key}`);
    }
    for (const key of ["kaynak", "not"]) if (kayit[key] != null) gerekli(typeof kayit[key] === "string", `Günlük ${key} metin olmalı.`);
    if (kayit.tahminiAlanlar != null) gerekli(Array.isArray(kayit.tahminiAlanlar) && kayit.tahminiAlanlar.every(a => ["b95", "dz"].includes(a)), "Tahmini alanlar listesi geçersiz.");
    if (kayit.kaynaklar != null) {
      gerekli(Array.isArray(kayit.kaynaklar), "Günlük kaynakları liste olmalı.");
      for (const kaynak of kayit.kaynaklar) kaynakUrl(kaynak?.url);
    }
  }
  fiyatDogrula(veri.guncelFiyatlar, today);
  gerekli(veri.guncelFiyatlar.tarih >= veri.karar.resmiFiyatTarihi, "Güncel fiyat tarihi model tarihinden eski olamaz.");
  if (veri.guncelFiyatlar.kontrolZamani) gerekli(Number.isFinite(Date.parse(veri.guncelFiyatlar.kontrolZamani)), "Kontrol zamanı geçersiz.");
  return veri;
}

// Anahtar sırasından bağımsız karşılaştırma: fiyat yükü Resmî Gazete betiğinden
// ya da manuel girdiden gelir, alan sırası kaynağa göre değişebilir.
function kanonik(deger) {
  if (Array.isArray(deger)) return deger.map(kanonik);
  if (deger && typeof deger === "object") {
    return Object.fromEntries(Object.keys(deger).sort().map(anahtar => [anahtar, kanonik(deger[anahtar])]));
  }
  return deger;
}
function fiyatKimligi(fiyat) {
  const { kontrolZamani, ...yuk } = fiyat || {};
  return JSON.stringify(kanonik(yuk));
}

// Damga her kontrolde tazelenirse fiyat aynıyken bile dosya değişir; otomasyon
// günde beş kez boş commit atıp Pages'i yeniden yayınlar. Fiyat değişmediyse
// damga günde bir yenilenir: App.jsx'teki "kaynak yakın zamanda doğrulanmadı"
// uyarısı iki günlük eşiğe baktığı için bu aralık uyarıyı erken tetiklemez.
export const DAMGA_TAZELEME_SAAT = 24;

export function fiyatBirlestir(veri, fiyat, now = new Date()) {
  const today = kktcBugun(now);
  piyasaDogrula(veri, today);
  fiyatDogrula(fiyat, today);
  gerekli(fiyat.tarih >= veri.guncelFiyatlar.tarih, "Eski fiyatlar güncel fiyatların üzerine yazılamaz.");
  gerekli(fiyat.kaynak.yayinTarihi >= veri.guncelFiyatlar.kaynak.yayinTarihi, "Eski kaynak yeni kaynağın üzerine yazılamaz.");
  const next = structuredClone(veri);
  const onceki = veri.guncelFiyatlar.kontrolZamani;
  const degisti = fiyatKimligi(veri.guncelFiyatlar) !== fiyatKimligi(fiyat);
  const eskidi = !Number.isFinite(Date.parse(onceki))
    || now.getTime() - Date.parse(onceki) >= DAMGA_TAZELEME_SAAT * 3600000;
  next.guncelFiyatlar = { ...fiyat, kontrolZamani: degisti || eskidi ? now.toISOString() : onceki };
  return piyasaDogrula(next, today);
}
