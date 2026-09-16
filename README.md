# KKTC akaryakıt fiyatları ve hesaplayıcı

[Uygulamayı aç](https://ryucel.github.io/kktc-akaryakit/) · [Fiyat güncelleme ekranı](https://github.com/RYucel/kktc-akaryakit/actions/workflows/update-prices.yml)

Benzin 95, Benzin 98 ve Euro Diesel için son resmî pompa fiyatlarını gösteren React/Vite uygulaması. Fiyat dökümü, kur/vergi senaryoları ve piyasa günlüğüne dayanan koşullu zam radarı da içerir.

## Otomatik güncelleme

**Akaryakıt fiyatlarını güncelle** iş akışı [KKTC Resmî Gazete](https://basimevi.gov.ct.tr/) kaynağını **her gün UTC 00:17, 06:17, 12:17, 18:17 ve 21:17'de** kontrol eder. Haftalık değişikliklerin yanında ara kararlar da yakalanır. GitHub işleri geciktirebilir; bunlar kesin çalışma saatleri değildir.

1. Dizin sayfasından tarihli akaryakıt azami satış emirnamelerini bulur.
2. PDF cetvelinden üç ürünün perakende/ithalatçı fiyatlarını ve yürürlük tarihini okur.
3. KKTC takvimine göre henüz yürürlüğe girmeyen fiyatı uygulamaz. Eski tarih, eksik ürün, hatalı sayı, belirsiz cetvel veya bağlantı hatasında dosyayı değiştirmeden durur.
4. Doğrulanan sonucu `public/data/piyasa.json` dosyasının `guncelFiyatlar` alanına yazar ve commit eder. Fiyat değişmese de başarılı kaynak kontrolünün zamanı kaydedilir.
5. Yayın işini ayrıca çağırır; GitHub'ın kendi token'ıyla yapılan push yeni bir push iş akışı başlatmaz.

Site verileri açılışta, sekme tekrar görünür olduğunda ve açık sekmede 15 dakikada bir alır. **Yayımlanan fiyatları yenile** düğmesi de aynı işi yapar; Resmî Gazete taramasını başlatmaz. Taramayı hemen çalıştırmak için Actions'tan otomatik işi elle başlat.

Yalnız kontrol zamanı değişirse mevcut senaryo korunur; fiyat/model değişirse hesap başlangıcına dönülür. Veri alınamazsa son geçerli veri ve hata mesajı gösterilir. Kaynak iki günden uzun süredir kontrol edilmediyse uyarı görünür.

### GitHub'da ilk kurulum

- Kod ve `.github/workflows/` dosyaları `main` dalında olmalı.
- **Settings → Pages → Source: GitHub Actions** olmalı.
- Actions çalıştırma ve iş akışının `contents: write` yetkisiyle `main` dalına commit yapmasına izin verilmeli. Dal koruması engelliyorsa mevcut korumaları incele; iş akışı zorla push yapmaz.
- **Actions → Akaryakıt fiyatlarını güncelle → Run workflow → otomatik** ile ilk çalışmayı başlat.
- API anahtarı veya ücretli piyasa verisi aboneliği gerekmez. Python paketleri iş akışında kurulur.
- GitHub uzun süre etkinlik olmayan herkese açık depolarda zamanlamayı durdurabilir. Actions durumunu takip et. Dosyaların yalnız yerelde olması otomasyonu çalıştırmaz.

## Kotasyon toplayıcı (deneme aşamasında)

`scripts/kotasyon.mjs` kur, Brent, gasoil ve HSFO için **ücretsiz** kaynakları dener. Varsayılan
kip hiçbir şey yazmaz; her kaynağı deneyip ne bulduğunu raporlar:

```bash
node scripts/kotasyon.mjs                 # rapor, dosya değişmez
node scripts/kotasyon.mjs --alan gasoil   # tek alan
node scripts/kotasyon.mjs --yaz           # yalnız doğrulananları piyasa.json'a işle
```

Rapordaki işaretler: `✓` doğrulandı, `✗` bulundu ama elendi (aralık dışı, tarihsiz, eski,
gelecek tarihli), `!` kaynağa erişilemedi.

Disiplin `gazete.py` ile aynı: **şüpheli değeri asla yazma.** `--yaz` kipinde bile mevcut bir
değerin üzerine yazılmaz, yalnız boş alanlar doldurulur; yazım öncesi ve sonrası `piyasaDogrula`
çalışır. Kaynak biçim değiştirmişse ayrıştırıcı hata döndürür, dosyaya dokunulmaz.

Kaynaklar `KAYNAKLAR` sabitinde sırayla denenir; yenisini eklemek bir satır ve bir ayrıştırıcıdır.
Gasoil ve HSFO, CME'nin nakit uzlaşan Avrupa sözleşmeleri üzerinden alınır (`7F` ve `UV`); vade
sembolü aya göre değiştiği için önümüzdeki üç vade denenir, roll döneminde biri yanıt verir.

**Borsa serilerinde bugünün barı elenir.** Gün içi bir değer uzlaşma yerine kaydedilirse koridor
ortalaması sahte olur. `kur` bu kuralın dışındadır: Merkez Bankası kuru o gün için resmî olarak
ilan edilir, kapanış beklemez.

Hangi kaynağın çalıştığı ağa göre değişir (bazı siteler bulut IP'lerini engeller). Cron'a
bağlamadan önce kendi makinende ve bir kez de GitHub Actions üzerinde deneme kipinde çalıştır.

## Manuel güncelleme

**Actions → Akaryakıt fiyatlarını güncelle → Run workflow** ekranında:

1. Dal: `main`, yöntem: `manuel`.
2. Yürürlük tarihi: `YYYY-MM-DD`.
3. 95 oktan, 98 oktan ve Euro Diesel fiyatlarını TL/litre olarak gir; `71,12` veya `71.12` kabul edilir.
4. Kaynak bağlantısını ve kaynağın yayın tarihini gir.
5. **Run workflow** düğmesine bas. Üç fiyat birlikte doğrulanır, kaydedilir ve site yayımlanır.

Gelecek tarihli fiyatı ancak yürürlüğe girdiği gün girebilirsin. Hata ayrıntıları Actions çalışmasında görünür.
Tarayıcıdaki **Değer ekle** formu kişisel piyasa günlüğüdür; ortak resmî pompa fiyatlarını değiştirmez.

### Yerelden manuel güncelleme

Bir `fiyatlar.json` dosyası oluştur. Aşağıdaki fiyatlar tarihli bir örnektir:

```json
{
  "tarih": "2026-09-11",
  "kaynak": {
    "ad": "KKTC Resmî Gazete",
    "url": "https://basimevi.gov.ct.tr/Portals/6/2026/169.pdf",
    "yayinTarihi": "2026-09-10"
  },
  "urunler": {
    "b95": { "resmiPompa": 71.12 },
    "b98": { "resmiPompa": 72.12 },
    "dz": { "resmiPompa": 70.00 }
  }
}
```

```bash
npm run prices:manual -- fiyatlar.json
npm run build
```

Ardından `public/data/piyasa.json` değişikliğini commit edip `main` dalına gönder. JSON'u doğrudan GitHub düzenleyicisinden de değiştirebilirsin; yayın öncesi aynı doğrulama çalışır.

Otomatik kontrol günde beş kez çalışır ama yalnız fiyat değiştiğinde commit atıp siteyi yeniden yayınlar.
`guncelFiyatlar.kontrolZamani` damgası fiyat aynıysa günde bir tazelenir; böylece hem boş commit birikmez
hem de uygulamadaki iki günlük "kaynak yakın zamanda doğrulanmadı" uyarısı yanlışlıkla çıkmaz.

## Mevzuat dayanağı

Hesap modelinin oranları **2001 Petrol Ürünlerinin Fiyatlandırma Esaslarını Düzenleyen Tüzük**'ün
10.09.2026 (R.G. 169 – EK III – A.E. 822) ile birleştirilmiş şekline karşı kontrol edildi
([Merkezi Mevzuat Dairesi](https://mevzuat.gov.ct.tr/)).

| Model sabiti | Tüzük | Durum |
| --- | --- | --- |
| `tampon` %3 | md. 2 "Tavan Fiyatı": İthal Parite Fiyatı'nın %3 fazlası | doğrulandı |
| `ithalatci` %4 | md. 14(a): CİF Mal Bedeli Fiyatı üzerinden; 95, 98, gazyağı ve Eurodiesel için %4 | doğrulandı (matrah dahil) |
| `bayi` %18 | md. 14(b): İthalatçı Şirket KDV hariç azami satış fiyatı üzerinden %18 | doğrulandı |
| Yoğunluklar 0,775 / 0,845 | md. 8 tablosu | doğrulandı |
| Kotasyonlar | md. 4: 95 ve 98 için aynı "Prem Unl 10 ppm", Eurodiesel için "10 ppm ULSD" | doğrulandı |
| `rihtim`, `belediye`, `prim`, turizm fonu | Tüzükte geçmiyor; md. 2 yalnız "Vergi ve Harçlar" der | doğrulanamadı |
| `nakliye` (sabit TL/litre) | md. 14(c): "km × Lt × katsayı" formülü, yılda en az iki kez belirlenir | modelde sabit kabul |

İki ayrıntı kodda tam karşılanmıyor:

- **Kotasyon esası.** md. 4 fiyatı *cargoes CIF Med Basis Genova/Lavera* günlük değerlerinin
  **üst ve alt limitlerinin ortalaması** olarak tanımlar. Radar alanı yalnız "CIF Med" der;
  farklı bir Akdeniz serisi girilirse model sessizce sapar.
- **Ortalama penceresi.** md. 5 tavanın uygulandığı günden başlayarak son 15 günün İPF
  ortalamasına bakar; uygulamadaki tahmin penceresi haftalık (Cuma–Perşembe) fiyatlama
  ritmini izler. İkisi farklı şeydir; koridor göstergesi md. 5'i ayrıca hesaplar.

### Akdeniz farkının iki kalibrasyon yolu

CIF Med kotasyonları abonelik ürünüdür; çoğu gün elde olmaz. Model bu yüzden vekil seri
kullanır (benzinde Eurobob, dizelde gasoil) ve aradaki **Akdeniz farkı**nı kalibre etmeye
çalışır. İki yol var, bu sırayla denenir:

1. **Günlük eşleşme** — aynı güne hem CIF Med hem vekil **gözlenmişse** son 5 çiftin ortalama
   farkı. En güvenilir yol. Resmî fiyattan geriye hesaplanan CIF bu yola girmez: o değer günlük
   bir kotasyon değil, fiyatlama penceresinin ortalamasıdır; günlük bir vekil kapanışıyla
   eşleştirmek elma-armut karşılaştırmasıdır.
2. **Resmî pencere** — eşleşme yoksa: resmî fiyattan geriye hesaplanan CIF ile, **o fiyatı üreten
   fiyatlama penceresindeki** vekil ortalamasının farkı. Pencere, yürürlük tarihinden bir hafta
   öncesinin Cuma–Çarşamba aralığıdır — yani çapanın kendisinin ortalandığı günler. Günlük
   eşleşme gerekmez; iki seri aynı pencerede ayrı ayrı bilinse yeter. Kaynağı Resmî Gazete
   olduğu için aboneliğe ihtiyaç duymaz.

   Pencere uzunluğu önemlidir. Yükselen piyasada uzun pencere ucuz günleri içine alır ve farkı
   sistematik olarak yukarı iter: Eylül 2026'da 15 takvim günü +4,78 \$/t verirken, fiyatı üreten
   dört günlük pencere −7,76 \$/t veriyor. `pencereFarki` bu yüzden açık gün listesi kabul eder.

İkisi de yoksa tahmin **Brent değişimine** düşer. Bu son çare kötüdür: distile ürünlerin ham
petrolden koptuğu dönemlerde (2026 Eylül'ünde gasoil üç ayda %61, Brent %28 arttı) Brent vekili
CIF'i yüzlerce dolar düşük tahmin eder, zam radarı ve koridor göstergesi olduğundan zayıf okur.
Kartlarda kaç günün hangi yöntemle türetildiği yazar; "Brent değişiminden" ibaresini gördüğünde
sayılara temkinli yaklaş.

**Pencere kalibrasyonunu açmak için** resmî fiyatın yürürlük tarihinden önceki 15 güne birkaç
gün vekil değeri (gasoil / Eurobob) gir. Bu seriler
[herkese açık](https://www.investing.com/commodities/london-gas-oil-historical-data), CIF Med
gibi abonelik gerektirmez. Hedef tarafta zaten resmî fiyattan türetilmiş CIF duruyor.

### Fiyat değişim koridoru (md. 2, 5 ve 6)

Tüzük zam tetikleyicisini sayısal olarak tanımlar:

- **md. 2** — "Fiyat Değişim Koridoru": İthal Parite Fiyatı değişikliğinin içinde kaldığı **artı veya eksi %3** aralığı.
- **md. 5** — Tavanın uygulamaya konulduğu günden başlamak üzere (önceki günler hesaba alınmaksızın)
  hesaplanan **son 15 günün İPF ortalaması** koridorun dışına çıkarsa ithalatçılar tavanı yeniden belirler.
  Dini, milli, resmi, idari ve hafta sonu tatillerine isabet eden günlerde bu işlem yapılmaz.
- **md. 6** — Bilgi verildikten sonra **en geç 24 saat** içinde Ekonomi Bakanlığı emirname ile ilan eder.

`src/koridor.js` bunu hesaplar: her günün İPF'si (CIF × yoğunluk ÷ 1000 × o günün kuru, TL/litre),
son fiyat kararından bu yana yürüyen ortalama, ±%3 bandı, baza göre sapma ve banttan aşım.
Pencere fiyatın yürürlüğe girdiği günde başlar (md. 5: "önceki günler hesaba alınmaksızın").
Zam radarında Benzin 95 ve Euro Diesel için ayrı ayrı gösterilir.

Göstergenin okunuşunda iki sınır var:

- **Koşul ≠ karar.** Koridorun aşılmış olması emirnameyi zorunlu kılar ama fiyat Fon'la veya
  ayrı bir kararla dondurulabilir; Nisan'da olduğu gibi.
- **Türetilmiş gün sayısına bak.** Kartta kaç günün türetildiği yazar. Dizel CIF Med ile gasoil
  aynı güne birlikte girilmediyse Akdeniz farkı kalibre edilemez ve dizel, Brent değişiminden
  türetilir. Distile krizinde Brent kötü bir vekildir: gasoil'in Brent'ten koptuğu dönemde bu
  yöntem CIF'i yüzlerce dolar düşük tahmin eder ve koridor sinyali olduğundan zayıf görünür.
  Bandın kenarındaki bir sonucu, türetilmiş günler ağırlıktaysa kesin sayma.

## Pompa fiyatı ile hesap modelinin farkı

### Kişisel piyasa günlüğü için kaynaklar

Zam radarı → **Değer ekle** formunda her alanın altında kaynak, birim ve hangi sütunun okunacağı bulunur:

- **Benzin/dizel CIF Med:** [Platts European Marketscan](https://www.spglobal.com/energy/en/products-solutions/upstream-midstream-oil-gas/platts-european-marketscan). Abonelik ürünüdür; bağlantı güncel fiyat tablosu değildir. Benzin için `AAWZB00`, dizel için `AAWYZ00`, USD/metrik ton. Erişim yoksa boş bırak.
- **Eurobob:** [ICE Futures Europe gün sonu raporu](https://www.ice.com/report/10), [GX Oxy ürün tanımı, MHN](https://www.ice.com/products/83047818). Tarih, ürün ve en yakın vadenin uzlaşma fiyatı, USD/metrik ton. Rapor erişimi üyelik gerektirebilir.
- **Gasoil:** [tarihli gösterge fiyatları](https://www.investing.com/commodities/london-gas-oil-historical-data), USD/metrik ton.
- **HSFO 3,5%:** European 3.5% Fuel Oil Barges FOB Rotterdam (Platts) vadeli, NYMEX kodu `UV`; USD/metrik ton. Elektrik üretiminin (KIB-TEK No.6 fuel-oil) maliyet göstergesidir; pompa fiyatı modeline girmez, yalnız radar tablosunda izlenir. VLSFO (%0,5) ve Singapur 380cst farklı serilerdir.
- **Brent:** [tarihli gösterge fiyatları](https://www.investing.com/commodities/brent-oil-historical-data), USD/varil. Gasoil ve Brent için borsanın resmî uzlaşma fiyatı ICE raporundan kontrol edilebilir.
- **Dolar:** [KKTC Merkez Bankası tarihli kurlar](https://www.kktcmerkezbankasi.org/tr/veriler/doviz_kurlari/kur_sorgulama), USD satırındaki **Döviz Satış (TRY)**.

Günlük tabloda tamamlanan günün kapanışını kullan; aynı kayıt içindeki tüm değerler aynı tarihe ait olmalı. Kaynak ve vade ayını not et; farklı ürün/sağlayıcı/vade serilerini karıştırma. İngilizce `1,250.50` değerini `1250.50` olarak gir. Bağlantılar fiyatları uygulamaya otomatik aktarmaz.

### Hesap modelinin güncellenmesi

**Otomasyon pompa fiyatını günceller; vergi mevzuatını yorumlamaz.** `guncelFiyatlar` son emirnameyi, `karar`, `urunler`, `bugunkuKurallar` ve `varsayim` hesap modelinin son elle doğrulanan sürümünü tutar.

Pompa fiyatı değişip model yenilenmediyse uygulama uyarı gösterir. Döküm ve radar eski varsayımlara bağlı kalır; yeni İAF eski fonlarla sessizce birleştirilmez.

Modeli haftalık kararlarla birlikte yenilemek için:

| Alan | İçerik |
| --- | --- |
| `karar.resmiFiyatTarihi`, `kaynakGazete` | Model cetvelinin tarihi ve kaynağı |
| `urunler.*.resmiIAF`, `resmiPompa`, `resmiFif` | Aynı dönemin İAF, pompa ve FİF tutarı |
| `karar.harcMuafiyetiSonGun`, `paketBitis` | Muafiyetin son günü ve paketin sona erme tarihi |
| `bugunkuKurallar.ayar` | `tampon`, `rihtim`, `belediye`, `turizm`, `prim`, `kdv`: boolean; `gumruk`: yüzde; `fifMod`: `resmi` |
| `varsayim.kur`, `varsayim.nakliye` | Model kuru (TL/USD) ve nakliye (TL/litre) |
| `karar.veriGuncelleme` | Modelin elle güncellendiği gün |
| `kayitlar` | Radarın tarihli piyasa verileri; otomasyon bunları değiştirmez |

Model İAF × 1,18 × (KDV varsa 1,10) ile model pompa fiyatının tutarlılığı doğrulanır. Modelin resmî fiyatı yeniden üretmesi tüm vergi matrahlarının bağımsız doğrulanması anlamına gelmez.

## Yerelde çalıştırma ve test

Node.js 22 ve otomatik okuyucu için Python 3.12 kullanılır:

```bash
npm ci
python -m pip install -r scripts/requirements.txt
npm run dev
```

```bash
npm test
python -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run prices:update
```

Son komut gerçek kaynaktan okuyup yerel veri dosyasını günceller. Testler internete bağımlı değildir. PDF örneği: 10 Eylül 2026, sayı 169, PDF sayfa 35 (basılı sayfa 4170).

## Sınırlar

- Resmî Gazete'nin HTML/PDF biçimi değişirse okuyucu durur. Hatayı incele veya manuel yöntemi kullan. Taranmış PDF için otomatik OCR uygulanmaz.
- Radar koşullu senaryodur. Günlük kotasyon/kur beslemesi otomatik değildir; ortak JSON veya kişisel günlük üzerinden eklenir.
- 98 oktan tahmini, 95 oktana modelden çıkan sabit prim ekler. Geçmiş haftalardaki tahmin isabeti ölçülmedi.
- Rıhtım oranı, belediye matrahı, nakliye ve gümrük varsayımları bağımsız resmî cetvelle doğrulanmış değildir.
- Kaynak kodundaki ayrı fiyat/yedek kotasyon listesi kaldırıldı. Çevrimdışı yedek derlemede aynı JSON'dan alınır.
- Özel veri sağlayıcılarının kotasyonlarını yeniden yayımlamadan önce kullanım haklarını kontrol et. Otomasyon yalnız resmî pompa fiyat cetvelini kullanır.
- Kullanıcının radar kayıtları kendi tarayıcısında saklanır. Ortak JSON'a girilen veriler depoda ve sitede herkese açıktır.
