import { test } from "node:test";
import assert from "node:assert/strict";
import { farkHesapla, turet, gunlukBirlestir } from "../src/tahmin.js";

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
