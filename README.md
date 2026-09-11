# KKTC akaryakıt fiyatı nasıl oluşuyor?

Pompada ödenen paranın nereye gittiğini gösteren, dünya fiyatı, dolar kuru ve vergi kurallarına göre fiyatın nasıl
değiştiğini deneten ve gelecek haftanın fiyatını koşullu olarak tahmin eden açık kaynaklı bir web uygulaması.

Hesap, *2001 Petrol Ürünlerinin Fiyatlandırma Esaslarını Düzenleyen Tüzük* (madde 2, 4, 8, 14) ile Resmi Gazete'de
yayımlanan haftalık kararlara dayanır. Resmi bir hesap cetveli değildir.

## Yayına alma (bir kez)

1. GitHub'da herkese açık yeni bir depo aç (örneğin `kktc-akaryakit`).
2. Bu klasördeki dosyaları depoya gönder:
   ```bash
   git init
   git add .
   git commit -m "İlk sürüm"
   git branch -M main
   git remote add origin https://github.com/KULLANICI/kktc-akaryakit.git
   git push -u origin main
   ```
3. Depoda **Settings → Pages → Build and deployment → Source** alanını **GitHub Actions** yap.
4. **Actions** sekmesinde "GitHub Pages'e yayınla" iş akışının bitmesini bekle (1–2 dakika).
   Site şu adreste açılır: `https://KULLANICI.github.io/kktc-akaryakit/`

Sonraki her `main` gönderiminde site kendiliğinden yeniden yayınlanır.

## Haftalık güncelleme

Kod değiştirmeye gerek yok. Yalnızca `public/data/piyasa.json` dosyası güncellenir; GitHub'ın web düzenleyicisinden
de yapılabilir. Kaydedip commit edince site bir iki dakika içinde güncellenir.

| Alan | Ne zaman değişir | Kaynak |
|---|---|---|
| `karar.resmiFiyatTarihi`, `karar.kaynakGazete` | Yeni azami fiyat emirnamesi çıkınca | Resmi Gazete, EK III |
| `urunler.*.resmiIAF`, `resmiPompa` | Aynı emirnameyle | "Mal ve Hizmetler ... Azami Satış Fiyatları Emirnamesi" cetveli |
| `urunler.*.resmiFif` | FİF emirnamesi değişince | "Fiyat İstikrar Fonu ... Emirnamesi" |
| `karar.harcMuafiyetiSonGun`, `karar.paketBitis` | Muafiyet kararları yenilenince | Bakanlar Kurulu kararları, KDV ve turizm fonu tüzük/emirnameleri |
| `bugunkuKurallar.ayar` | Hangi vergi ve harcın alındığı değişince | Aynı kararlar |
| `kayitlar` | Her iş günü | Aşağıdaki not |
| `karar.veriGuncelleme` | Dosyayı her güncellediğinde | — |

`bugunkuKurallar.ayar` içindeki anahtarlar: `rihtim`, `belediye`, `turizm`, `prim` (dizelde %1), `kdv` için `true`
(alınıyor) ya da `false` (alınmıyor); `gumruk` yüzde olarak; `fifMod` için `"resmi"`.

Bir günlük kayıt örneği:

```json
{ "tarih": "2026-09-14", "eurobob": 1450, "gasoil": 1440.5, "brent": 104.2, "kur": 48.6, "kaynak": "elle" }
```

Alanlar: `b95` ve `dz` (benzin ve dizel CIF Med, $/ton), `eurobob` ve `gasoil` (vadeli, $/ton), `brent` ($/varil),
`kur` (TL). Bilinmeyen alanı yazma. CIF Med yoksa uygulama benzini Eurobob'dan, dizeli gasoil'den tahmin eder.
Bunun için en az bir gün CIF Med ile vekil değerin birlikte bulunması gerekir; o gün için yalnızca resmi fiyattan
geri hesaplanan ortalamayı kullanabilirsin.

## Veri lisansı uyarısı

Platts, Argus ve borsa (ICE, CME) fiyatlarının herkese açık olarak yeniden yayımlanması genellikle lisans gerektirir.
`kayitlar` içindeki her değer bu depoda ve sitede herkes tarafından görülebilir. Lisansın yoksa Platts kotasyonlarını
bu dosyaya yazma; resmi fiyattan geri hesaplanan değerleri ve serbestçe yayımlanan göstergeleri (Brent, kur) kullan.
Kullanıcıların sitede kendi girdiği değerler yalnızca kendi tarayıcılarında saklanır ve kimseyle paylaşılmaz.

## Yerelde çalıştırma

```bash
npm install
npm run dev
```

## Sınırlar

- Tahmin koşullu bir senaryodur; yöntemin geçmiş haftalardaki isabeti henüz ölçülmedi.
- Rıhtım harcı oranı, belediye ücretinin matrahı, nakliye bedeli ve gümrük oranı resmi kaynakta doğrulanamadı.
- 98 oktan, 95'e resmi fiyatlardan çıkan sabit bir primle hesaplanır.
- "Güncel fiyatları internetten getir" düğmesi yalnızca Claude içindeki sürümde görünür; herkese açık sitede API
  anahtarı olmadığı için kapalıdır.
