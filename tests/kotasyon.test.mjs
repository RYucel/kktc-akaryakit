import test from "node:test";
import assert from "node:assert/strict";
import { mbKur, yahooChart, yahooArama, sec, seriSec, denetle, vadeSembolleri, kayitlariIsle, yuvarla, ARALIK, BASAMAK, KAYNAKLAR, MAKS_YAS_GUN, GECMIS_YAS_GUN } from "../scripts/kotasyon.mjs";

const BUGUN = "2026-09-16";

test("Merkez Bankası sayfasından USD Döviz Satış ve tarih okunur", () => {
  const html = `<h2>16/09/2026 - Tarihinde Geçerli Olan Resmi Kurlar</h2>
    <tr><td>1 AMERİKAN DOLARI (USD)</td><td>48.43050</td><td>48.64600</td><td>48.39660</td><td>48.59060</td></tr>
    <tr><td>1 EURO (EUR)</td><td>56.17540</td><td>56.27660</td><td>56.13600</td><td>56.36100</td></tr>`;
  const r = mbKur(html);
  assert.equal(r.deger, 48.646);          // Döviz Satış, alış değil
  assert.equal(r.tarih, "2026-09-16");
});

test("Merkez Bankası biçimi değişirse sessizce yanlış değer üretmez", () => {
  assert.match(mbKur("<p>bakımdayız</p>").hata, /bulunamadı/);
});

test("Yahoo chart yanıtı günlük seri döndürür, boş barlar atlanır", () => {
  const j = JSON.stringify({ chart: { result: [{
    timestamp: [1789344000, 1789430400, 1789516800],   // 14, 15, 16 Eylül 2026
    indicators: { quote: [{ close: [104.61, 108.97, null] }] },
  }] } });
  const r = yahooChart(j);
  assert.deepEqual(r.seri.map((x) => x.tarih), ["2026-09-14", "2026-09-15"]);
  assert.match(yahooChart("{}").hata, /sonuç yok/);
  assert.match(yahooChart("bozuk").hata, /ayrıştırılamadı/);
});

test("borsa serilerinde kapanmamış gün elenir, kur için elenmez", () => {
  const seri = { seri: [{ tarih: "2026-09-15", deger: 108.97 }, { tarih: "2026-09-16", deger: 107.72 }] };
  assert.equal(sec(seri, "brent", BUGUN).deger, 108.97);        // bugünün gün içi barı atlanır
  assert.equal(sec(seri, "kur", BUGUN).deger, 107.72);          // resmî kur bugün için geçerli
  const yalnizBugun = { seri: [{ tarih: "2026-09-16", deger: 107.72 }] };
  assert.match(sec(yalnizBugun, "gasoil", BUGUN).hata, /gün içi/);
  assert.match(sec({ hata: "HTTP 404" }, "gasoil", BUGUN).hata, /404/);
});

test("vade sembolleri ay kodlarını doğru üretir ve yıl sonunda taşar", () => {
  assert.deepEqual(vadeSembolleri("2026-09-16", "7F"), ["7FU26.NYM", "7FV26.NYM", "7FX26.NYM"]);
  assert.deepEqual(vadeSembolleri("2026-11-02", "UV"), ["UVX26.NYM", "UVZ26.NYM", "UVF27.NYM"]);
});

test("denetle: aralık, tarih ve yaş kontrolleri", () => {
  assert.equal(denetle("gasoil", { deger: 1549, tarih: "2026-09-15" }, BUGUN).durum, "kabul");
  assert.equal(denetle("gasoil", { deger: 154900, tarih: "2026-09-15" }, BUGUN).durum, "red");   // birim hatası
  assert.equal(denetle("kur", { deger: 48.6, tarih: "2026-09-20" }, BUGUN).durum, "red");        // gelecek
  assert.equal(denetle("brent", { deger: 108, tarih: "2026-09-01" }, BUGUN).durum, "red");       // eski
  assert.equal(denetle("brent", { deger: 108, tarih: null }, BUGUN).durum, "red");               // tarihsiz
  assert.equal(denetle("brent", { hata: "HTTP 403" }, BUGUN).durum, "hata");
});

test("her alan için aralık tanımlı ve kaynak listesi bir dizi", () => {
  for (const alan of Object.keys(KAYNAKLAR)) {
    assert.ok(Array.isArray(KAYNAKLAR[alan]), alan);
    assert.ok(Array.isArray(ARALIK[alan]), `${alan} için aralık yok`);
    for (const k of KAYNAKLAR[alan]) {
      assert.ok(k.url.startsWith("https://"), `${k.ad} HTTPS değil`);
      assert.equal(typeof k.ayristir, "function");
    }
  }
});

test("Yahoo sembol araması sonuçları sadeleştirir", () => {
  const j = JSON.stringify({ quotes: [
    { symbol: "7FX26.NYM", exchange: "NYM", quoteType: "FUTURE", shortname: "European Low Sulphur Gasoil" },
    { symbol: "HO=F", exchange: "NYM", quoteType: "FUTURE", longname: "Heating Oil Futures" },
  ] });
  const r = yahooArama(j);
  assert.equal(r.bulunan.length, 2);
  assert.equal(r.bulunan[0].sembol, "7FX26.NYM");
  assert.equal(r.bulunan[1].ad, "Heating Oil Futures");
  assert.match(yahooArama("{}").hata, /quotes/);
  assert.match(yahooArama("bozuk").hata, /ayrıştırılamadı/);
});

test("var olan güne yazılan değer kendi künyesini de götürür", () => {
  // Elle girilmiş bir gün: değerleri başka bir kaynaktan, kendi notuyla.
  const veri = { kayitlar: [{
    tarih: "2026-09-15", gasoil: 1568.25,
    kaynak: "TradingView (gecikmeli)",
    not: "Gasoil ICEEUR:ULS1! gün sonu kapanışı.",
    kaynaklar: [{ ad: "ICE gün sonu raporu", url: "https://www.ice.com/report/10" }],
  }] };
  const degisen = kayitlariIsle(veri, [
    ["brent", { deger: 108.75, tarih: "2026-09-15", ad: "Yahoo BZ=F", url: "https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF" }],
    ["gasoil", { deger: 1, tarih: "2026-09-15", ad: "Yahoo X", url: "https://example.com/x" }],
  ]);
  const k = veri.kayitlar[0];
  assert.equal(degisen, 1);
  assert.equal(k.brent, 108.75);
  assert.equal(k.gasoil, 1568.25);                       // mevcut değerin üzerine yazılmaz
  assert.ok(k.kaynak.includes("TradingView"), "önceki künye korunmalı");
  assert.ok(k.kaynak.includes("Yahoo BZ=F"), "yeni kaynak künyeye eklenmeli");
  assert.ok(!k.kaynak.includes("Yahoo X"), "yazılmayan alanın kaynağı künyeye girmemeli");
  assert.deepEqual(k.kaynaklar.map((x) => x.ad), ["ICE gün sonu raporu", "Yahoo BZ=F"]);
  assert.match(k.not, /Gasoil ICEEUR/);                  // önceki not silinmez
  assert.match(k.not, /Otomatik toplayıcı: brent \(Yahoo BZ=F\)/);
});

test("yeni gün açılırken de künye yazılır ve kayıtlar tarihe göre sıralanır", () => {
  const veri = { kayitlar: [{ tarih: "2026-09-16", kur: 48.646 }] };
  const degisen = kayitlariIsle(veri, [
    ["brent", { deger: 108.75, tarih: "2026-09-15", ad: "Yahoo BZ=F", url: "https://y/1" }],
  ]);
  assert.equal(degisen, 1);
  assert.deepEqual(veri.kayitlar.map((k) => k.tarih), ["2026-09-15", "2026-09-16"]);
  const yeni = veri.kayitlar[0];
  assert.equal(yeni.kaynak, "Yahoo BZ=F");
  assert.deepEqual(yeni.kaynaklar, [{ ad: "Yahoo BZ=F", url: "https://y/1" }]);
  assert.match(yeni.not, /Otomatik toplayıcı/);
});

test("değerler alanın hassasiyetine yuvarlanır", () => {
  assert.equal(yuvarla("ho", 5.26200008392334), 5.262);   // Yahoo float32 artığı
  assert.equal(yuvarla("brent", 108.7500114), 108.75);
  assert.equal(yuvarla("kur", 48.64600000001), 48.646);
  for (const alan of Object.keys(ARALIK)) assert.equal(typeof BASAMAK[alan], "number", `${alan} için basamak yok`);
});

test("seriSec serinin tamamını verir; sec yalnız son kapanmış günü", () => {
  const sonuc = { seri: [
    { tarih: "2026-09-04", deger: 3.10 },
    { tarih: "2026-09-08", deger: 3.1800000123 },
    { tarih: "2026-09-15", deger: 3.4652 },
    { tarih: "2026-09-16", deger: 3.50 },      // bugün: kapanmamış
  ] };
  assert.equal(sec(sonuc, "rb", BUGUN).tarih, "2026-09-15");
  const seri = seriSec(sonuc, "rb", BUGUN);
  assert.deepEqual(seri.map((x) => x.tarih), ["2026-09-04", "2026-09-08", "2026-09-15"]);
  assert.equal(seri[1].deger, 3.18, "geçmiş günler de yuvarlanmalı");
});

test("geçmiş doldurma kalibrasyon penceresine yetecek kadar geriye bakar", () => {
  // Kalibrasyon penceresi resmî fiyattan öncesine bakar: o günler MAKS_YAS_GUN'den eskidir.
  assert.ok(GECMIS_YAS_GUN > MAKS_YAS_GUN);
  const eski = { deger: 3.10, tarih: "2026-09-04" };                 // 12 gün önce
  assert.equal(denetle("rb", eski, BUGUN).durum, "red");             // canlı koşuda elenir
  assert.equal(denetle("rb", eski, BUGUN, GECMIS_YAS_GUN).durum, "kabul");
  const cokEski = { deger: 3.10, tarih: "2026-01-02" };
  assert.equal(denetle("rb", cokEski, BUGUN, GECMIS_YAS_GUN).durum, "red");
  assert.deepEqual(seriSec({ seri: [cokEski] }, "rb", BUGUN), []);
});

test("geçmiş doldurma mevcut değerin üzerine yazmaz", () => {
  const veri = { kayitlar: [{ tarih: "2026-09-08", rb: 9.99, kaynak: "elle" }] };
  const degisen = kayitlariIsle(veri, [
    ["rb", { deger: 3.18, tarih: "2026-09-08", ad: "Yahoo RB=F", url: "https://y/rb" }],
    ["rb", { deger: 3.10, tarih: "2026-09-04", ad: "Yahoo RB=F", url: "https://y/rb" }],
  ]);
  assert.equal(degisen, 1);
  assert.equal(veri.kayitlar.find((k) => k.tarih === "2026-09-08").rb, 9.99);
  assert.equal(veri.kayitlar.find((k) => k.tarih === "2026-09-04").rb, 3.10);
});

test("denetle tanımsız alanda çökmez, temiz ret döner", () => {
  const r = denetle("bilinmeyen", { deger: 5, tarih: "2026-09-15" }, BUGUN);
  assert.equal(r.durum, "red");
  assert.match(r.neden, /aralık tanımlı değil/);
});
