import test from "node:test";
import assert from "node:assert/strict";
import { aktifPencere, fiyatiUretenPencere, tahminPenceresi } from "../src/pencere.js";

const g = (y, m, d) => new Date(y, m - 1, d);

test("fiyatı üreten pencere, yürürlük gününe göre kayar", () => {
  // 11 Eylül 2026 Cuma yürürlüğe girdi: penceresi 4-9 Eylül.
  assert.deepEqual(fiyatiUretenPencere("2026-09-11").isoGunler,
    ["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"]);
  // 17 Eylül 2026 PERŞEMBE yürürlüğe girdi: penceresi 11-16 Eylül.
  // Eski "bir hafta geri say" kuralı burada 4-9 Eylül veriyordu; kalibrasyon bir hafta geride kalıyordu.
  assert.deepEqual(fiyatiUretenPencere("2026-09-17").isoGunler,
    ["2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16"]);
});

test("tüketilmiş pencere yeniden tahmin edilmez", () => {
  // 17 Eylül Perşembe: içinde bulunulan pencere (11-16) yeni fiyatı üretendir.
  // Cevabı bellidir; tahmin bir sonraki pencereye geçmeli.
  assert.deepEqual(aktifPencere(g(2026, 9, 17)).isoGunler,
    ["2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16"]);
  assert.deepEqual(tahminPenceresi("2026-09-17", g(2026, 9, 17)).isoGunler,
    ["2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"]);
});

test("pencere tüketilmemişse olduğu gibi kullanılır", () => {
  // 16 Eylül Çarşamba, yürürlükteki fiyat hâlâ 11 Eylül'ünki: 11-16 penceresi gerçek bir tahmindir.
  assert.deepEqual(tahminPenceresi("2026-09-11", g(2026, 9, 16)).isoGunler,
    ["2026-09-11", "2026-09-14", "2026-09-15", "2026-09-16"]);
  // Cuma yeni pencere zaten açılmıştır; ileri kaydırma yapılmamalı.
  assert.deepEqual(tahminPenceresi("2026-09-17", g(2026, 9, 18)).isoGunler,
    ["2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"]);
});

test("her pencere Cuma başlar, Çarşamba biter ve dört iş günüdür", () => {
  for (let i = 0; i < 21; i++) {
    const p = aktifPencere(g(2026, 9, 1 + i));
    assert.equal(p.gunler.length, 4);
    assert.equal(p.bas.getDay(), 5, `${p.isoGunler[0]} Cuma değil`);
    assert.equal(p.son.getDay(), 3, `${p.isoGunler[3]} Çarşamba değil`);
    assert.ok(p.gunler.every((d) => d.getDay() !== 0 && d.getDay() !== 6), "hafta sonu girdi");
  }
});
