import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { piyasaDogrula, fiyatBirlestir, kktcBugun, tarihGecerli } from "../src/piyasa.js";
import { piyasaYukle, veriKimligi } from "../src/veriYukle.js";
import { hesapla, ortukCif } from "../src/hesap.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/piyasa.json", import.meta.url), "utf8"));
const base = () => structuredClone(fixture);
const now = new Date("2026-09-18T09:00:00Z");
const futurePrice = () => ({ ...structuredClone(fixture.guncelFiyatlar), tarih: "2026-09-18", kaynak: { ...fixture.guncelFiyatlar.kaynak, yayinTarihi: "2026-09-17" }, urunler: { b95: { resmiPompa: 74.12 }, b98: { resmiPompa: 75.12 }, dz: { resmiPompa: 73 } } });

test("known official prices are reproduced; inverse and forward calculations agree", () => {
  for (const key of ["b95", "b98", "dz"]) {
    const u = { ...fixture.urunler[key], yogunluk: key === "dz" ? 0.845 : 0.775, turizmUsd: key === "dz" ? 0.003 : 0.01, dizel: key === "dz" };
    for (const rules of [fixture.bugunkuKurallar.ayar, { ...fixture.bugunkuKurallar.ayar, belediye: true, rihtim: true, turizm: true, prim: true, gumruk: 2, kdv: true }]) {
      const cif = ortukCif(u, 48.5, rules, 0.064);
      const result = hesapla(u, cif, 48.5, rules, 0.064);
      assert.ok(Math.abs(result.iaf - u.resmiIAF) < 0.000001);
      assert.ok(Math.abs(Object.values(result.gruplar).reduce((a, b) => a + b, 0) - result.pompa) < 0.000001);
      if (!rules.kdv) assert.equal(Number(result.pompa.toFixed(2)), u.resmiPompa);
    }
  }
});

test("a new price updates all products without changing model or diary", () => {
  const data = base();
  const snapshot = structuredClone(data);
  const next = fiyatBirlestir(data, futurePrice(), now);
  assert.equal(next.guncelFiyatlar.urunler.b95.resmiPompa, 74.12);
  assert.equal(next.guncelFiyatlar.kontrolZamani, now.toISOString());
  for (const key of ["karar", "urunler", "bugunkuKurallar", "kayitlar", "varsayim"]) assert.deepEqual(next[key], data[key]);
  assert.deepEqual(data, snapshot);
});

test("repeated checks preserve scenario identity", () => {
  const first = fiyatBirlestir(base(), futurePrice(), now);
  const second = fiyatBirlestir(first, futurePrice(), new Date("2026-09-18T12:00:00Z"));
  assert.equal(veriKimligi(first), veriKimligi(second));
});

test("same-day official corrections can update prices without silently changing the model", () => {
  const price = structuredClone(fixture.guncelFiyatlar);
  price.urunler.b95.resmiPompa += 1;
  const updated = fiyatBirlestir(base(), price, now);
  assert.equal(updated.guncelFiyatlar.urunler.b95.resmiPompa, 72.12);
  assert.equal(updated.urunler.b95.resmiPompa, 71.12);
});

test("missing, malformed, zero and excessive prices are rejected atomically", () => {
  for (const value of [undefined, null, "71.12", 0, -1, Infinity, NaN, 1001, 71.123]) {
    const data = base();
    const before = structuredClone(data);
    const price = futurePrice();
    price.urunler.b95.resmiPompa = value;
    assert.throws(() => fiyatBirlestir(data, price, now));
    assert.deepEqual(data, before);
  }
  const price = futurePrice();
  delete price.urunler.dz;
  assert.throws(() => fiyatBirlestir(base(), price, now));
});

test("invalid, future and stale dates are rejected", () => {
  assert.equal(tarihGecerli("2026-02-30"), false);
  const price = futurePrice();
  assert.throws(() => fiyatBirlestir(base(), price, new Date("2026-09-17T10:00:00Z")), /yürürlüğe/);
  const newer = fiyatBirlestir(base(), price, now);
  assert.throws(() => fiyatBirlestir(newer, fixture.guncelFiyatlar, now), /Eski fiyat/);
  price.kaynak.yayinTarihi = "2026-09-19";
  assert.throws(() => fiyatBirlestir(base(), price, now), /yayın tarihi/);
});

test("source URL and all model fields are validated", () => {
  const data = base();
  data.guncelFiyatlar.kaynak.url = "javascript:alert(1)";
  assert.throws(() => piyasaDogrula(data, "2026-09-18"));
  for (const mutate of [d => { d.urunler.b95.resmiIAF = 2; }, d => { d.bugunkuKurallar.ayar.kdv = "false"; }, d => { d.varsayim.kur = 0; }, d => { d.karar.paketBitis = "2026-02-30"; }]) {
    const invalid = base(); mutate(invalid);
    assert.throws(() => piyasaDogrula(invalid, "2026-09-18"));
  }
});

test("KKTC midnight determines effective date independently of device timezone", () => {
  assert.equal(kktcBugun(new Date("2026-09-17T21:00:00Z")), "2026-09-18");
  assert.equal(kktcBugun(new Date("2026-09-17T20:59:59Z")), "2026-09-17");
});

test("HTTP failure, invalid JSON and stale response keep the last good data", async () => {
  const data = base();
  const snapshot = structuredClone(data);
  await assert.rejects(piyasaYukle("test", data, { fetcher: async () => ({ ok: false, status: 503 }) }), /503/);
  await assert.rejects(piyasaYukle("test", data, { fetcher: async () => ({ ok: true, json: async () => ({}) }) }));
  const current = fiyatBirlestir(data, futurePrice(), now);
  await assert.rejects(piyasaYukle("test", current, { fetcher: async () => ({ ok: true, json: async () => base() }) }), /eski veri/);
  assert.deepEqual(data, snapshot);
});

test("slow requests are aborted", async () => {
  await assert.rejects(piyasaYukle("test", base(), { timeoutMs: 10, fetcher: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) }), /aborted/);
});
