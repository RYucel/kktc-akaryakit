// Fiyat değişim koridoru — 2001 Petrol Ürünlerinin Fiyatlandırma Esaslarını Düzenleyen Tüzük,
// 10.09.2026 (R.G. 169 – EK III – A.E. 822) ile birleştirilmiş şekli.
//
// md. 2  "Fiyat Değişim Koridoru": İthal Parite Fiyatı değişikliğinin içinde kaldığı
//        artı veya eksi %3 aralığı.
// md. 5  Tavan fiyatın uygulamaya konulduğu günden başlamak üzere (önceki günler hesaba
//        alınmaksızın) hesaplanan her son 15 günün İthal Parite Fiyatları ortalamasının
//        koridorun dışına çıkması halinde ithalatçılar tavan satış fiyatlarını yeniden
//        belirler. Dini, milli, resmi, idari ve hafta sonu tatillerine isabet eden
//        günlerde bu işlemler yapılmaz.
// md. 6  En geç 24 saat zarfında yeni düzenlemeye gidilir ve emirname ile ilan edilir.
//
// Bu modül yalnız koşulun gerçekleşip gerçekleşmediğini söyler. Kararın çıkacağını
// söylemez: fiyat, Fon ile veya ayrı bir kararla dondurulabilir.

export const KORIDOR_ORANI = 0.03;
export const PENCERE_GUN = 15;

// İthal Parite Fiyatı, TL/litre. md. 2: CIF fiyatın aynı güne ait döviz kuru ile TL'ye
// çevrilmiş değeri. Hacim esası md. 8'deki 15 °C yoğunluk tablosundan gelir.
export function ipf(cif, yogunluk, kur) {
  return ((cif * yogunluk) / 1000) * kur;
}

function gecerliSayi(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

// gunler: fiyat kararından SONRAKİ günler, artan tarih sırasında.
// Her biri { tarih, cif, kur, tahmini } — cif $/metrik ton, kur TL/USD.
export function koridorDurumu({ gunler = [], bazCif, bazKur, yogunluk, oran = KORIDOR_ORANI, pencere = PENCERE_GUN }) {
  if (!gecerliSayi(bazCif) || !gecerliSayi(bazKur) || !gecerliSayi(yogunluk)) return null;
  const baz = ipf(bazCif, yogunluk, bazKur);
  const alt = baz * (1 - oran);
  const ust = baz * (1 + oran);
  const seri = gunler
    .filter((g) => gecerliSayi(g?.cif) && gecerliSayi(g?.kur))
    .slice(-pencere)
    .map((g) => ({ tarih: g.tarih, ipf: ipf(g.cif, yogunluk, g.kur), tahmini: !!g.tahmini }));
  const temel = { baz, alt, ust, oran, pencere, gun: seri.length, tahminiGun: seri.filter((x) => x.tahmini).length, seri };
  if (!seri.length) return { ...temel, ortalama: null, sapma: null, asim: null, durum: "veriyok", sonGun: null };
  const ortalama = seri.reduce((a, x) => a + x.ipf, 0) / seri.length;
  const durum = ortalama > ust ? "ust" : ortalama < alt ? "alt" : "icinde";
  const asim = durum === "ust" ? ortalama / ust - 1 : durum === "alt" ? ortalama / alt - 1 : 0;
  return { ...temel, ortalama, sapma: ortalama / baz - 1, asim, durum, sonGun: seri[seri.length - 1].tarih };
}
