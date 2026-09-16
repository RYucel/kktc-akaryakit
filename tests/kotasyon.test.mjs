import test from "node:test";
import assert from "node:assert/strict";
import { mbKur, stooqCsv, yahooChart, yahooArama, sec, denetle, vadeSembolleri, kayitlariIsle, yuvarla, ARALIK, BASAMAK, KAYNAKLAR } from "../scripts/kotasyon.mjs";

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

test("Stooq CSV kapanışı okunur, veri yoksa hata döner", () => {
  const csv = "Symbol,Date,Time,Open,High,Low,Close,Volume\nCB.F,2026-09-15,20:00:00,107.1,108.6,106.1,108.09,12345";
  const r = stooqCsv(csv);
  assert.equal(r.deger, 108.09);
  assert.equal(r.tarih, "2026-09-15");
  assert.match(stooqCsv("Symbol,Date,Time,Open,High,Low,Close,Volume\nX.F,N/D,N/D,N/D,N/D,N/D,N/D,N/D").hata, /N\/D/);
  assert.match(stooqCsv("").hata, /boş/);
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
