const VARIL_TON = { benzin: 1000 / 0.775 / 158.987, dizel: 1000 / 0.845 / 158.987 }; // varil/ton

const KALIBRASYON_GUN = 5;

// Resmî fiyatın dayandığı pencere: Tüzük md. 5 tavanın uygulandığı günden geriye bakan
// 15 günlük ortalamadan söz eder. Aynı uzunluk burada kalibrasyon penceresi olarak kullanılır.
const PENCERE_GUN = 15;

export const ALANLAR = ["b95", "dz", "eurobob", "gasoil", "hsfo", "brent", "kur"];

export function farkHesapla(sirali, hedef, vekil, tarih) {
  const ciftler = sirali.filter((k) => typeof k[hedef] === "number" && typeof k[vekil] === "number");
  if (!ciftler.length) return null;
  const once = ciftler.filter((k) => k.tarih <= tarih);
  if (!once.length) return null; // gelecekteki kotasyon geçmiş güne sızmamalı
  const kume = once.slice(-KALIBRASYON_GUN);
  return { fark: kume.reduce((a, k) => a + (k[hedef] - k[vekil]), 0) / kume.length, gun: kume.length, son: kume[kume.length - 1].tarih };
}

// Aynı güne hem hedef hem vekil girilmemişse Akdeniz farkı kalibre edilemez ve tahmin
// Brent değişimine düşer. Brent, distile ürünlerin ham petrolden koptuğu dönemlerde kötü
// bir vekildir. Bu fonksiyon ikinci bir kalibrasyon kaynağı sunar: resmî fiyattan geriye
// hesaplanan CIF ile, o fiyatın dayandığı penceredeki vekil ortalaması. Günlük eşleşme
// gerekmez; iki seri aynı pencerede ayrı ayrı bilinse yeter. Kaynağı Resmî Gazete olduğu
// için abonelik gerektiren kotasyona ihtiyaç duymaz.
export function pencereFarki(sirali, hedef, vekil, son, gun = PENCERE_GUN) {
  if (typeof son !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(son)) return null;
  const bas = new Date(`${son}T00:00:00Z`);
  if (Number.isNaN(bas.getTime())) return null;
  bas.setUTCDate(bas.getUTCDate() - gun);
  const basIso = bas.toISOString().slice(0, 10);
  const icte = sirali.filter((k) => k.tarih >= basIso && k.tarih < son);
  const ort = (alan) => {
    const v = icte.filter((k) => typeof k[alan] === "number" && Number.isFinite(k[alan]));
    return v.length ? { deger: v.reduce((a, k) => a + k[alan], 0) / v.length, gun: v.length } : null;
  };
  const h = ort(hedef), v = ort(vekil);
  if (!h || !v) return null;
  return { fark: h.deger - v.deger, hedefGun: h.gun, vekilGun: v.gun, bas: basIso, son };
}

// pencere: resmî fiyatın yürürlük tarihi (string). Verilmezse pencere kalibrasyonu atlanır.
export function turet(kayitlar, pencere = null) {
  const sirali = [...kayitlar].sort((a, b) => a.tarih.localeCompare(b.tarih));
  let capaB = null, capaDB = null;
  return sirali.map((k) => {
    const r = { ...k, tahmini: [...(k.tahminiAlanlar || [])], yontem: Object.fromEntries((k.tahminiAlanlar || []).map((a) => [a, "model"])) };
    if (k.b95 == null) {
      const f = k.eurobob != null ? farkHesapla(sirali, "b95", "eurobob", k.tarih) : null;
      const p = !f && k.eurobob != null ? pencereFarki(sirali, "b95", "eurobob", pencere) : null;
      if (f) { r.b95 = k.eurobob + f.fark; r.tahmini.push("b95"); r.yontem.b95 = "eurobob"; }
      else if (p) { r.b95 = k.eurobob + p.fark; r.tahmini.push("b95"); r.yontem.b95 = "eurobobPencere"; }
      else if (k.brent != null && capaB) { r.b95 = capaB.b95 + (k.brent - capaB.brent) * VARIL_TON.benzin; r.tahmini.push("b95"); r.yontem.b95 = "brent"; }
    }
    if (k.dz == null) {
      const f = k.gasoil != null ? farkHesapla(sirali, "dz", "gasoil", k.tarih) : null;
      const p = !f && k.gasoil != null ? pencereFarki(sirali, "dz", "gasoil", pencere) : null;
      if (f) { r.dz = k.gasoil + f.fark; r.tahmini.push("dz"); r.yontem.dz = "gasoil"; }
      else if (p) { r.dz = k.gasoil + p.fark; r.tahmini.push("dz"); r.yontem.dz = "gasoilPencere"; }
      else if (k.brent != null && capaDB) { r.dz = capaDB.dz + (k.brent - capaDB.brent) * VARIL_TON.dizel; r.tahmini.push("dz"); r.yontem.dz = "brent"; }
    }
    if (k.b95 != null && k.brent != null) capaB = { b95: k.b95, brent: k.brent };
    if (k.dz != null && k.brent != null) capaDB = { dz: k.dz, brent: k.brent };
    return r;
  });
}

export function gunlukBirlestir(kayitlar) {
  const gunler = new Map();
  for (const k of kayitlar) {
    if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(k.tarih || "")) continue;
    const onceki = gunler.get(k.tarih) || { id: `gun-${k.tarih}`, tarih: k.tarih, kaynaklar: [], kaynakTurleri: [], notlar: [] };
    const yeni = { ...onceki };
    yeni.tahminiAlanlar = [...(onceki.tahminiAlanlar || [])];
    for (const a of ALANLAR) if (typeof k[a] === "number" && Number.isFinite(k[a]) && k[a] > 0) {
      yeni[a] = k[a];
      yeni.tahminiAlanlar = yeni.tahminiAlanlar.filter((alan) => alan !== a);
      if (k.tahminiAlanlar?.includes(a)) yeni.tahminiAlanlar.push(a);
    }
    const tur = k.kaynak || (k.kaynakTurleri || []).join(", ");
    if (tur && !yeni.kaynakTurleri.includes(tur)) yeni.kaynakTurleri = [...yeni.kaynakTurleri, tur];
    yeni.kaynaklar = [...yeni.kaynaklar, ...(k.kaynaklar || [])].filter((x, i, d) => x?.url && d.findIndex((y) => y.url === x.url) === i);
    const not = k.not || (k.notlar || []).join(" ");
    if (not) yeni.notlar = [...yeni.notlar, not];
    gunler.set(k.tarih, yeni);
  }
  return [...gunler.values()].sort((a, b) => a.tarih.localeCompare(b.tarih));
}
