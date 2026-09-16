import test from "node:test";
import assert from "node:assert/strict";
import { mbKur, stooqCsv, yahooChart, yahooArama, sec, denetle, vadeSembolleri, ARALIK, KAYNAKLAR } from "../scripts/kotasyon.mjs";

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
