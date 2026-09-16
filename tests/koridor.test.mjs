import test from "node:test";
import assert from "node:assert/strict";
import { ipf, koridorDurumu, KORIDOR_ORANI, PENCERE_GUN } from "../src/koridor.js";

const YOG = 0.845;
const gun = (tarih, cif, kur, tahmini = false) => ({ tarih, cif, kur, tahmini });
const taban = { bazCif: 1351.3, bazKur: 48.5, yogunluk: YOG };

test("İthal Parite Fiyatı CIF, yoğunluk ve kurdan TL/litre olarak hesaplanır", () => {
  assert.ok(Math.abs(ipf(1351.3, YOG, 48.5) - 55.3798) < 0.001);
  assert.equal(ipf(1000, 0.775, 40), (1000 * 0.775 / 1000) * 40);
});

test("koridor sınırları baz İPF'nin ±%3'ü", () => {
  const d = koridorDurumu({ ...taban, gunler: [] });
  assert.equal(d.durum, "veriyok");
  assert.ok(Math.abs(d.ust - d.baz * (1 + KORIDOR_ORANI)) < 1e-9);
  assert.ok(Math.abs(d.alt - d.baz * (1 - KORIDOR_ORANI)) < 1e-9);
  assert.equal(d.ortalama, null);
});

test("koridor içinde kalan ortalama tetiklemez", () => {
  const d = koridorDurumu({ ...taban, gunler: [gun("2026-09-12", 1360, 48.5), gun("2026-09-15", 1370, 48.5)] });
  assert.equal(d.durum, "icinde");
  assert.equal(d.asim, 0);
  assert.ok(d.sapma > 0 && d.sapma < KORIDOR_ORANI);
});

test("tavanı aşan ortalama üst yönde tetikler ve aşım yüzdesi verir", () => {
  const d = koridorDurumu({ ...taban, gunler: [gun("2026-09-11", 1504.25, 48.5), gun("2026-09-16", 1574, 48.646)] });
  assert.equal(d.durum, "ust");
  assert.ok(d.asim > 0.10 && d.asim < 0.11, `asim ${d.asim}`);
  assert.ok(d.sapma > 0.14);
});

test("tabanın altına inen ortalama alt yönde tetikler", () => {
  const d = koridorDurumu({ ...taban, gunler: [gun("2026-09-12", 1200, 48.5)] });
  assert.equal(d.durum, "alt");
  assert.ok(d.asim < 0);
});

test("yalnız son 15 gün sayılır ve eksik değerler elenir", () => {
  const gunler = Array.from({ length: 20 }, (_, i) => gun(`2026-09-${String(i + 1).padStart(2, "0")}`, 1400 + i, 48.5));
  gunler.push({ tarih: "2026-10-01", cif: null, kur: 48.5 }, { tarih: "2026-10-02", cif: 1400, kur: 0 });
  const d = koridorDurumu({ ...taban, gunler });
  assert.equal(d.gun, PENCERE_GUN);
  assert.equal(d.sonGun, "2026-09-20");
});

test("türetilmiş günler sayılır ama ayrıca işaretlenir", () => {
  const d = koridorDurumu({ ...taban, gunler: [gun("2026-09-12", 1500, 48.5, true), gun("2026-09-15", 1500, 48.5)] });
  assert.equal(d.gun, 2);
  assert.equal(d.tahminiGun, 1);
});

test("eksik veya bozuk baz değerlerinde null döner", () => {
  assert.equal(koridorDurumu({ ...taban, bazCif: 0, gunler: [] }), null);
  assert.equal(koridorDurumu({ ...taban, bazKur: NaN, gunler: [] }), null);
});
