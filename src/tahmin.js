const VARIL_TON = { benzin: 1000 / 0.775 / 158.987, dizel: 1000 / 0.845 / 158.987 }; // varil/ton

const KALIBRASYON_GUN = 5;

export const ALANLAR = ["b95", "dz", "eurobob", "gasoil", "hsfo", "brent", "kur"];

export function farkHesapla(sirali, hedef, vekil, tarih) {
  const ciftler = sirali.filter((k) => typeof k[hedef] === "number" && typeof k[vekil] === "number");
  if (!ciftler.length) return null;
  const once = ciftler.filter((k) => k.tarih <= tarih);
  if (!once.length) return null; // gelecekteki kotasyon geçmiş güne sızmamalı
  const kume = once.slice(-KALIBRASYON_GUN);
  return { fark: kume.reduce((a, k) => a + (k[hedef] - k[vekil]), 0) / kume.length, gun: kume.length, son: kume[kume.length - 1].tarih };
}

export function turet(kayitlar) {
  const sirali = [...kayitlar].sort((a, b) => a.tarih.localeCompare(b.tarih));
  let capaB = null, capaDB = null;
  return sirali.map((k) => {
    const r = { ...k, tahmini: [...(k.tahminiAlanlar || [])], yontem: Object.fromEntries((k.tahminiAlanlar || []).map((a) => [a, "model"])) };
    if (k.b95 == null) {
      const f = k.eurobob != null ? farkHesapla(sirali, "b95", "eurobob", k.tarih) : null;
      if (f) { r.b95 = k.eurobob + f.fark; r.tahmini.push("b95"); r.yontem.b95 = "eurobob"; }
      else if (k.brent != null && capaB) { r.b95 = capaB.b95 + (k.brent - capaB.brent) * VARIL_TON.benzin; r.tahmini.push("b95"); r.yontem.b95 = "brent"; }
    }
    if (k.dz == null) {
      const f = k.gasoil != null ? farkHesapla(sirali, "dz", "gasoil", k.tarih) : null;
      if (f) { r.dz = k.gasoil + f.fark; r.tahmini.push("dz"); r.yontem.dz = "gasoil"; }
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
