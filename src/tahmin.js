const VARIL_TON = { benzin: 1000 / 0.775 / 158.987, dizel: 1000 / 0.845 / 158.987 }; // varil/ton

const KALIBRASYON_GUN = 5;

// Resmî fiyatın dayandığı pencere: Tüzük md. 5 tavanın uygulandığı günden geriye bakan
// 15 günlük ortalamadan söz eder. Aynı uzunluk burada kalibrasyon penceresi olarak kullanılır.
const PENCERE_GUN = 15;

export const ALANLAR = ["b95", "dz", "eurobob", "gasoil", "hsfo", "ho", "rb", "brent", "kur"];

// NY Heating Oil (ULSD) ve RBOB $/galon olarak kote edilir; Akdeniz CIF ise $/metrik ton.
// Kalibrasyon toplamsal olduğu için iki seri aynı birimde olmalı. Çevrim ürünün yoğunluğuna
// bağlıdır (Tüzük md. 8: dizel 0,845, benzin 0,775) ve 1 US galon = 3,785411784 L:
// dizelde 1 ton = 312,66 galon, benzinde 340,63 galon. Tek bir katsayı ikisine birden uymaz.
const LITRE_GALON = 3.785411784;
export const GALON_TON_DIZEL = 1000 / 0.845 / LITRE_GALON;
export const GALON_TON_BENZIN = 1000 / 0.775 / LITRE_GALON;

// Kalibrasyon yalnız GÖZLENMİŞ CIF ile yapılır. Resmî fiyattan geriye hesaplanan değer
// (tahminiAlanlar'da işaretli) o günün kotasyonu değil, fiyatlama penceresinin ortalamasıdır;
// günlük bir vekil kapanışıyla eşleştirmek elma-armut karşılaştırmasıdır. Böyle bir çapa için
// doğru araç pencereFarki'dır: vekil ortalaması da aynı pencereden alınır.
export function farkHesapla(sirali, hedef, vekil, tarih) {
  const ciftler = sirali.filter((k) => typeof k[hedef] === "number" && typeof k[vekil] === "number"
    && !(k.tahminiAlanlar || []).includes(hedef));
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
// pencere: ya resmî fiyatın yürürlük tarihi (string; geriye `gun` takvim günü bakılır),
// ya da { gunler: [iso...] } ile o fiyatı üreten fiyatlama penceresinin günleri.
// Açık gün listesi tercih edilir: çapa CIF'in kendisi o pencerenin ortalamasıdır, farklı
// uzunlukta bir pencereyle karşılaştırmak yükselen piyasada sistematik sapma yaratır.
export function pencereFarki(sirali, hedef, vekil, pencere, gun = PENCERE_GUN) {
  let icte, basIso, sonIso;
  if (pencere && Array.isArray(pencere.gunler)) {
    const kume = new Set(pencere.gunler.filter((t) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t)));
    if (!kume.size) return null;
    const sirali2 = [...kume].sort();
    basIso = sirali2[0];
    sonIso = sirali2[sirali2.length - 1];
    icte = sirali.filter((k) => kume.has(k.tarih));
  } else {
    const son = pencere;
    if (typeof son !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(son)) return null;
    const bas = new Date(`${son}T00:00:00Z`);
    if (Number.isNaN(bas.getTime())) return null;
    bas.setUTCDate(bas.getUTCDate() - gun);
    basIso = bas.toISOString().slice(0, 10);
    sonIso = son;
    icte = sirali.filter((k) => k.tarih >= basIso && k.tarih < son);
  }
  const ort = (alan) => {
    const v = icte.filter((k) => typeof k[alan] === "number" && Number.isFinite(k[alan]));
    return v.length ? { deger: v.reduce((a, k) => a + k[alan], 0) / v.length, gun: v.length } : null;
  };
  const h = ort(hedef), v = ort(vekil);
  if (!h || !v) return null;
  return { fark: h.deger - v.deger, hedefGun: h.gun, vekilGun: v.gun, bas: basIso, son: sonIso };
}

// Vekilleri sırayla dener: önce günlük eşleşmeden kalibre edilmiş fark, o yoksa resmî
// pencere farkı. İlk tutan vekil kazanır; hiçbiri tutmazsa false döner ve çağıran Brent'e düşer.
function vekilUygula(r, hedef, vekiller, sirali, pencere) {
  for (const [alan, deger, etiketGun, etiketPencere] of vekiller) {
    if (deger == null) continue;
    const f = farkHesapla(sirali, hedef, alan, r.tarih);
    if (f) { r[hedef] = deger + f.fark; r.tahmini.push(hedef); r.yontem[hedef] = etiketGun; return true; }
    const p = pencereFarki(sirali, hedef, alan, pencere);
    if (p) { r[hedef] = deger + p.fark; r.tahmini.push(hedef); r.yontem[hedef] = etiketPencere; return true; }
  }
  return false;
}

// pencere: resmî fiyatın yürürlük tarihi (string). Verilmezse pencere kalibrasyonu atlanır.
export function turet(kayitlar, pencere = null) {
  // hoTon / rbTon: galon kotasyonlarının $/ton karşılığı. Kalibrasyon bu türetilmiş
  // sütunlar üzerinden yapılır, çünkü hedef seri (CIF Med) $/ton.
  const tonaCevir = (k) => {
    const ek = {};
    if (typeof k.ho === "number" && Number.isFinite(k.ho)) ek.hoTon = k.ho * GALON_TON_DIZEL;
    if (typeof k.rb === "number" && Number.isFinite(k.rb)) ek.rbTon = k.rb * GALON_TON_BENZIN;
    return Object.keys(ek).length ? { ...k, ...ek } : k;
  };
  const sirali = [...kayitlar].sort((a, b) => a.tarih.localeCompare(b.tarih)).map(tonaCevir);
  let capaB = null, capaDB = null;
  return sirali.map((k) => {
    const r = { ...k, tahmini: [...(k.tahminiAlanlar || [])], yontem: Object.fromEntries((k.tahminiAlanlar || []).map((a) => [a, "model"])) };
    if (k.b95 == null) {
      // Vekil sırası: Eurobob (Akdeniz benzinine en yakın, ama ücretsiz günlük kaynağı yok),
      // sonra RBOB (aynı ürün ailesi, ABD pazarı, ücretsiz), en son Brent.
      const rbTon = typeof k.rb === "number" && Number.isFinite(k.rb) ? k.rb * GALON_TON_BENZIN : null;
      const vekiller = [["eurobob", k.eurobob, "eurobob", "eurobobPencere"], ["rbTon", rbTon, "rb", "rbPencere"]];
      if (!vekilUygula(r, "b95", vekiller, sirali, pencere) && k.brent != null && capaB) {
        r.b95 = capaB.b95 + (k.brent - capaB.brent) * VARIL_TON.benzin; r.tahmini.push("b95"); r.yontem.b95 = "brent";
      }
    }
    if (k.dz == null) {
      // Vekil sırası: ICE gasoil (Akdeniz dizeline en yakın), sonra NY ULSD (aynı ürün ailesi,
      // farklı pazar), en son Brent. Brent son çaredir: distilat ham petrolden koptuğunda yanıltır.
      const hoTon = typeof k.ho === "number" && Number.isFinite(k.ho) ? k.ho * GALON_TON_DIZEL : null;
      const vekiller = [["gasoil", k.gasoil, "gasoil", "gasoilPencere"], ["hoTon", hoTon, "ho", "hoPencere"]];
      if (!vekilUygula(r, "dz", vekiller, sirali, pencere) && k.brent != null && capaDB) {
        r.dz = capaDB.dz + (k.brent - capaDB.brent) * VARIL_TON.dizel; r.tahmini.push("dz"); r.yontem.dz = "brent";
      }
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
