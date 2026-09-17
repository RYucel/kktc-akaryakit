// Fiyatlama penceresi — Tüzük geçici maddesi: Cuma'dan sonraki Çarşamba'ya kadar olan iş günleri.
// App.jsx bu modülü kullanır; mantık burada olduğu için takvim davranışı test edilebilir.

const isoGun = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isodanTarih = (s) => { const [y, m, g] = s.split("-").map(Number); return new Date(y, m - 1, g); };

export function aktifPencere(simdi = new Date()) {
  const d = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  const cumadanBeri = (d.getDay() - 5 + 7) % 7;
  const bas = new Date(d); bas.setDate(d.getDate() - cumadanBeri);
  const gunler = [0, 3, 4, 5].map((ek) => { const x = new Date(bas); x.setDate(bas.getDate() + ek); return x; });
  const son = gunler[3];
  const aciklama = new Date(son); aciklama.setDate(son.getDate() + 1);
  return { bas, son, aciklama, gunler, isoGunler: gunler.map(isoGun), kapandi: d.getDay() === 4 };
}

// Resmî fiyatı üreten pencere: yürürlük tarihinden bir GÜN önce kapanan pencere.
// Bir hafta geri saymak fiyatın hep Cuma yürürlüğe girdiğini varsayardı; 17 Eylül 2026
// emirnamesi Perşembe yürürlüğe girdi ve kalibrasyon bir hafta geriye kayardı.
export function fiyatiUretenPencere(resmiFiyatTarihi) {
  const d = isodanTarih(resmiFiyatTarihi);
  d.setDate(d.getDate() - 1);
  return aktifPencere(d);
}

// Tahmin penceresi: içinde bulunduğumuz pencere resmî fiyatı üreten pencereyse, onun cevabı
// bellidir (yeni resmî fiyat) — yeniden tahmin etmek anlamsızdır, bir sonrakine geçilir.
export function tahminPenceresi(resmiFiyatTarihi, simdi = new Date()) {
  const simdiki = aktifPencere(simdi);
  const ureten = fiyatiUretenPencere(resmiFiyatTarihi);
  if (simdiki.isoGunler.join() !== ureten.isoGunler.join()) return simdiki;
  const sonraki = new Date(simdiki.son); sonraki.setDate(sonraki.getDate() + 2); // Çarşamba + 2 = Cuma
  return aktifPencere(sonraki);
}
