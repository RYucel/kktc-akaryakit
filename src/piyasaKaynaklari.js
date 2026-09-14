// Fiyatlar kopyalanmaz; kullanıcı kaynakta tarih ve ürün seçerek kendi günlüğüne girer.
export const PIYASA_KAYNAKLARI = {
  b95: {
    aciklama: "Platts: Gasoline Prem Unleaded 10ppmS CIF Med Cargo, AAWZB00; USD/metrik ton. Tarihli günlük değerlendirme değerini kullan.",
    erisim: "Abonelik gerekir. Bu bağlantı veri ürününü tanıtır; güncel fiyatı aboneliğindeki European Marketscan raporundan al. Erişimin yoksa boş bırak.",
    linkler: [{ ad: "Platts veri erişimi", url: "https://www.spglobal.com/energy/en/products-solutions/upstream-midstream-oil-gas/platts-european-marketscan" }],
  },
  dz: {
    aciklama: "Platts: ULSD 10ppmS CIF Med Cargo, AAWYZ00; USD/metrik ton. CIF Med satırını seç; FOB veya CIF NWE farklı serilerdir.",
    erisim: "Abonelik gerekir. Güncel fiyatı aboneliğindeki European Marketscan raporundan al. Erişimin yoksa boş bırak; gasoil değerini bu alana yazma.",
    linkler: [{ ad: "Platts veri erişimi", url: "https://www.spglobal.com/energy/en/products-solutions/upstream-midstream-oil-gas/platts-european-marketscan" }],
  },
  eurobob: {
    aciklama: "ICE: Eurobob Oxy Gasoline NWE FOB Barges (GX), MHN; USD/metrik ton. Gün sonu raporunda tarih, ürün ve en yakın vade için Settlement (uzlaşma) değerini seç.",
    erisim: "Rapor erişimi üyelik gerektirebilir. Oxy/Non-Oxy, GX/Argus ve vade serilerini karıştırma; bulunamayan değeri boş bırak.",
    linkler: [
      { ad: "ICE gün sonu raporu", url: "https://www.ice.com/report/10" },
      { ad: "MHN ürün tanımı", url: "https://www.ice.com/products/83047818" },
    ],
  },
  gasoil: {
    aciklama: "London Gas Oil / ICE Low Sulphur Gasoil; USD/metrik ton. Tarihsel tabloda Daily (günlük) görünümünden ilgili günün Price (kapanış) değerini al.",
    erisim: "Investing.com gösterge verisidir; borsanın resmî uzlaşması için ICE raporunu kullan. Vade ayını kontrol et; bu fiyat Akdeniz CIF dizel fiyatı değildir.",
    linkler: [
      { ad: "Gasoil tarihli fiyatlar", url: "https://www.investing.com/commodities/london-gas-oil-historical-data" },
      { ad: "ICE gün sonu raporu", url: "https://www.ice.com/report/10" },
    ],
  },
  brent: {
    aciklama: "Brent Oil vadeli fiyatı; USD/varil. Daily (günlük) tabloda ilgili günün Price (kapanış) değerini al. WTI veya benzin fiyatını seçme.",
    erisim: "Investing.com gösterge verisidir; borsanın resmî uzlaşması için ICE raporunu kullan. Aynı vade serisini izle; Brent yalnız yaklaşık tahminde kullanılır.",
    linkler: [
      { ad: "Brent tarihli fiyatlar", url: "https://www.investing.com/commodities/brent-oil-historical-data" },
      { ad: "ICE gün sonu raporu", url: "https://www.ice.com/report/10" },
    ],
  },
  kur: {
    aciklama: "KKTC Merkez Bankası'nda ilgili tarihi seç. 1 AMERİKAN DOLARI (USD) satırının Döviz Satış (TRY) sütununu gir; alış veya efektif satış sütununu kullanma.",
    linkler: [{ ad: "Merkez Bankası tarihli kurlar", url: "https://www.kktcmerkezbankasi.org/tr/veriler/doviz_kurlari/kur_sorgulama" }],
  },
};
