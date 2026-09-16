import { test } from "node:test";
import assert from "node:assert/strict";
import { farkHesapla, pencereFarki, turet, gunlukBirlestir, GALON_TON_DIZEL, GALON_TON_BENZIN } from "../src/tahmin.js";

test("future calibration pairs cannot affect older estimates", () => {
  const rows = [{ tarih: "2026-09-10", eurobob: 1400 }, { tarih: "2026-09-11", eurobob: 1410, b95: 1500 }];
  assert.equal(farkHesapla(rows, "b95", "eurobob", "2026-09-10"), null);
  assert.equal(turet(rows)[0].b95, undefined);
  assert.equal(farkHesapla(rows, "b95", "eurobob", "2026-09-11").fark, 90);
});

test("reverse-calculated prices remain estimates after merging", () => {
  const data = [{ tarih: "2026-09-09", b95: 1500, dz: 1350, tahminiAlanlar: ["b95", "dz"] }];
  const derived = turet(gunlukBirlestir(data))[0];
  assert.deepEqual(derived.tahmini, ["b95", "dz"]);
  assert.equal(derived.yontem.b95, "model");
  const override = turet(gunlukBirlestir([...data, { tarih: "2026-09-09", b95: 1550 }]))[0];
  assert.deepEqual(override.tahmini, ["dz"]);
  assert.equal(override.b95, 1550);
});

test("a local partial update preserves shared fields and cannot add negative prices", () => {
  const shared = { tarih: "2026-09-09", b95: 1500, kur: 48.5 };
  const merged = gunlukBirlestir([shared, { tarih: shared.tarih, kur: 49, dz: -1 }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].b95, 1500);
  assert.equal(merged[0].kur, 49);
  assert.equal(merged[0].dz, undefined);
  assert.equal(shared.kur, 48.5);
});

test("pencere farkı, günlük eşleşme olmadan resmî fiyattan kalibre eder", () => {
  const rows = [
    { tarih: "2026-09-03", gasoil: 1300 },
    { tarih: "2026-09-08", gasoil: 1320 },
    { tarih: "2026-09-09", dz: 1351.3 },          // resmî fiyattan geri hesaplanan CIF
    { tarih: "2026-09-16", gasoil: 1549 },
  ];
  const p = pencereFarki([...rows].sort((a, b) => a.tarih.localeCompare(b.tarih)), "dz", "gasoil", "2026-09-11");
  assert.equal(p.hedefGun, 1);
  assert.equal(p.vekilGun, 2);
  assert.ok(Math.abs(p.fark - (1351.3 - 1310)) < 1e-9);
  assert.equal(p.bas, "2026-08-27");
});

test("pencere dışındaki ve pencere sonrasındaki günler kalibrasyona girmez", () => {
  const rows = [
    { tarih: "2026-08-01", gasoil: 100 },          // pencereden önce
    { tarih: "2026-09-09", dz: 1351.3, gasoil: 1300 },
    { tarih: "2026-09-12", gasoil: 9999 },         // fiyat tarihinden sonra
  ];
  const p = pencereFarki(rows, "dz", "gasoil", "2026-09-11");
  assert.equal(p.vekilGun, 1);
  assert.ok(Math.abs(p.fark - 51.3) < 1e-9);
});

test("turet, günlük eşleşme yoksa pencere farkını Brent'e tercih eder", () => {
  const rows = [
    { tarih: "2026-09-09", dz: 1351.3, brent: 101.21, tahminiAlanlar: ["dz"] },
    { tarih: "2026-09-10", gasoil: 1300 },
    { tarih: "2026-09-16", gasoil: 1549, brent: 108.09 },
  ];
  const pencereli = turet(rows, "2026-09-11").at(-1);
  assert.equal(pencereli.yontem.dz, "gasoilPencere");
  assert.ok(Math.abs(pencereli.dz - (1549 + (1351.3 - 1300))) < 1e-9);

  const pencaresiz = turet(rows).at(-1);       // pencere verilmezse eski davranış
  assert.equal(pencaresiz.yontem.dz, "brent");
});

test("aynı güne girilmiş çift, pencere farkının önüne geçer", () => {
  const rows = [
    { tarih: "2026-09-09", dz: 1351.3, gasoil: 1300 },
    { tarih: "2026-09-10", dz: 1500, gasoil: 1450 },
    { tarih: "2026-09-16", gasoil: 1549 },
  ];
  const son = turet(rows, "2026-09-11").at(-1);
  assert.equal(son.yontem.dz, "gasoil");
  assert.ok(Math.abs(son.dz - (1549 + 50.65)) < 1e-9);   // iki günün ortalama farkı
});

test("pencerede vekil ya da hedef yoksa null döner, tahmin Brent'e düşer", () => {
  assert.equal(pencereFarki([{ tarih: "2026-09-09", dz: 1351.3 }], "dz", "gasoil", "2026-09-11"), null);
  assert.equal(pencereFarki([{ tarih: "2026-09-09", gasoil: 1300 }], "dz", "gasoil", "2026-09-11"), null);
  assert.equal(pencereFarki([{ tarih: "2026-09-09", dz: 1, gasoil: 2 }], "dz", "gasoil", "bozuk"), null);
});

test("açık gün listesi verilen pencere, yalnız o günleri kullanır", () => {
  const rows = [
    { tarih: "2026-08-28", gasoil: 1280 },        // listede yok
    { tarih: "2026-09-04", gasoil: 1321.5 },
    { tarih: "2026-09-07", gasoil: 1374.75 },
    { tarih: "2026-09-08", gasoil: 1351.75 },
    { tarih: "2026-09-09", gasoil: 1388.25, dz: 1351.3 },
    { tarih: "2026-09-16", gasoil: 1549 },
  ];
  const gunler = ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"];
  const p = pencereFarki(rows, "dz", "gasoil", { gunler });
  assert.equal(p.vekilGun, 4);
  assert.equal(p.hedefGun, 1);
  assert.equal(p.bas, "2026-09-04");
  assert.equal(p.son, "2026-09-09");
  assert.ok(Math.abs(p.fark - (1351.3 - 1359.0625)) < 1e-9);
});

test("pencere uzunluğu farkı değiştirir: yükselen piyasada uzun pencere sapma yaratır", () => {
  const rows = [
    { tarih: "2026-08-27", gasoil: 1221.75 },
    { tarih: "2026-09-04", gasoil: 1321.5 },
    { tarih: "2026-09-09", gasoil: 1388.25, dz: 1351.3 },
  ];
  const kisa = pencereFarki(rows, "dz", "gasoil", { gunler: ["2026-09-04", "2026-09-09"] });
  const uzun = pencereFarki(rows, "dz", "gasoil", "2026-09-11");
  assert.ok(uzun.fark > kisa.fark, "uzun pencere ucuz günleri içerir, farkı yukarı iter");
});

test("boş ya da geçersiz gün listesi null döner", () => {
  const rows = [{ tarih: "2026-09-09", gasoil: 1388.25, dz: 1351.3 }];
  assert.equal(pencereFarki(rows, "dz", "gasoil", { gunler: [] }), null);
  assert.equal(pencereFarki(rows, "dz", "gasoil", { gunler: ["bozuk"] }), null);
  assert.equal(pencereFarki(rows, "dz", "gasoil", { gunler: ["2026-01-01"] }), null);
});

test("resmî fiyattan türetilmiş CIF, günlük kalibrasyon çifti sayılmaz", () => {
  const rows = [
    { tarih: "2026-09-09", dz: 1351.3, gasoil: 1388.25, tahminiAlanlar: ["dz"] },
    { tarih: "2026-09-16", gasoil: 1549 },
  ];
  assert.equal(farkHesapla(rows, "dz", "gasoil", "2026-09-16"), null);
  // gözlenmiş bir değer girilince çift geçerli olur
  const gozlem = [{ tarih: "2026-09-09", dz: 1400, gasoil: 1388.25 }, ...rows.slice(1)];
  assert.ok(Math.abs(farkHesapla(gozlem, "dz", "gasoil", "2026-09-16").fark - 11.75) < 1e-9);
});

test("türetilmiş çapa varken turet pencere yolunu kullanır, günlük yolu değil", () => {
  const rows = [
    { tarih: "2026-09-04", gasoil: 1321.5 },
    { tarih: "2026-09-07", gasoil: 1374.75 },
    { tarih: "2026-09-08", gasoil: 1351.75 },
    { tarih: "2026-09-09", gasoil: 1388.25, dz: 1351.3, tahminiAlanlar: ["dz"] },
    { tarih: "2026-09-16", gasoil: 1549 },
  ];
  const gunler = ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"];
  const son = turet(rows, { gunler }).at(-1);
  assert.equal(son.yontem.dz, "gasoilPencere");
  assert.ok(Math.abs(son.dz - (1549 + (1351.3 - 1359.0625))) < 1e-9);
});

test("NY ULSD galon fiyatı tona çevrilerek vekil olarak kullanılır", () => {
  assert.ok(Math.abs(GALON_TON_DIZEL - 1000 / 0.845 / 3.785411784) < 1e-9);
  const rows = [
    { tarih: "2026-09-04", ho: 4.20 },
    { tarih: "2026-09-07", ho: 4.38 },
    { tarih: "2026-09-08", ho: 4.31 },
    { tarih: "2026-09-09", ho: 4.44, dz: 1351.3, tahminiAlanlar: ["dz"] },
    { tarih: "2026-09-16", ho: 4.95 },
  ];
  const gunler = ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"];
  const son = turet(rows, { gunler }).at(-1);
  assert.equal(son.yontem.dz, "hoPencere");
  const pencereOrt = ((4.20 + 4.38 + 4.31 + 4.44) / 4) * GALON_TON_DIZEL;
  assert.ok(Math.abs(son.dz - (4.95 * GALON_TON_DIZEL + (1351.3 - pencereOrt))) < 1e-9);
});

test("gasoil varsa NY ULSD'ye düşülmez", () => {
  const rows = [
    { tarih: "2026-09-04", gasoil: 1321.5, ho: 4.20 },
    { tarih: "2026-09-09", gasoil: 1388.25, ho: 4.44, dz: 1351.3, tahminiAlanlar: ["dz"] },
    { tarih: "2026-09-16", gasoil: 1549, ho: 4.95 },
  ];
  const son = turet(rows, { gunler: ["2026-09-04", "2026-09-09"] }).at(-1);
  assert.equal(son.yontem.dz, "gasoilPencere");
});

test("hiç vekil yoksa Brent'e düşülür", () => {
  const rows = [
    { tarih: "2026-09-09", dz: 1351.3, brent: 101.21, tahminiAlanlar: ["dz"] },
    { tarih: "2026-09-16", brent: 108.09 },
  ];
  assert.equal(turet(rows, { gunler: ["2026-09-09"] }).at(-1).yontem.dz, "brent");
});

test("Eurobob yoksa benzin RBOB'dan türetilir, Brent'e düşmez", () => {
  // Benzin yoğunluğu dizelden farklı: çevrim katsayısı da farklı olmalı.
  assert.ok(Math.abs(GALON_TON_BENZIN - 1000 / 0.775 / 3.785411784) < 1e-9);
  assert.ok(GALON_TON_BENZIN > GALON_TON_DIZEL, "hafif üründe tonda daha çok galon var");
  const rows = [
    { tarih: "2026-09-04", rb: 3.10, brent: 100 },
    { tarih: "2026-09-07", rb: 3.22, brent: 101 },
    { tarih: "2026-09-08", rb: 3.18, brent: 102 },
    { tarih: "2026-09-09", rb: 3.30, brent: 103, b95: 1492.6, tahminiAlanlar: ["b95"] },
    { tarih: "2026-09-16", rb: 3.4652, brent: 108.09 },
  ];
  const gunler = ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"];
  const son = turet(rows, { gunler }).at(-1);
  assert.equal(son.yontem.b95, "rbPencere");            // Brent çapası varken bile RBOB kazanır
  const pencereOrt = ((3.10 + 3.22 + 3.18 + 3.30) / 4) * GALON_TON_BENZIN;
  assert.ok(Math.abs(son.b95 - (3.4652 * GALON_TON_BENZIN + (1492.6 - pencereOrt))) < 1e-9);
});

test("Eurobob varsa RBOB'a düşülmez", () => {
  const rows = [
    { tarih: "2026-09-04", eurobob: 1400, rb: 3.10 },
    { tarih: "2026-09-09", eurobob: 1450, rb: 3.30, b95: 1492.6, tahminiAlanlar: ["b95"] },
    { tarih: "2026-09-16", eurobob: 1520, rb: 3.4652 },
  ];
  const son = turet(rows, { gunler: ["2026-09-04", "2026-09-09"] }).at(-1);
  assert.equal(son.yontem.b95, "eurobobPencere");
});

test("benzin ve dizel galon vekilleri birbirinin katsayısını kullanmaz", () => {
  const rows = [
    { tarih: "2026-09-04", rb: 3.10, ho: 4.20 },
    { tarih: "2026-09-09", rb: 3.30, ho: 4.44, b95: 1492.6, dz: 1351.3, tahminiAlanlar: ["b95", "dz"] },
    { tarih: "2026-09-16", rb: 3.4652, ho: 4.95 },
  ];
  const gunler = ["2026-09-04", "2026-09-09"];
  const son = turet(rows, { gunler }).at(-1);
  assert.equal(son.yontem.b95, "rbPencere");
  assert.equal(son.yontem.dz, "hoPencere");
  const bOrt = ((3.10 + 3.30) / 2) * GALON_TON_BENZIN;
  const dOrt = ((4.20 + 4.44) / 2) * GALON_TON_DIZEL;
  assert.ok(Math.abs(son.b95 - (3.4652 * GALON_TON_BENZIN + (1492.6 - bOrt))) < 1e-9);
  assert.ok(Math.abs(son.dz - (4.95 * GALON_TON_DIZEL + (1351.3 - dOrt))) < 1e-9);
});
