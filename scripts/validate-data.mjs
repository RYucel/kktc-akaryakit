import { readFile } from "node:fs/promises";
import { piyasaDogrula } from "../src/piyasa.js";
const data = JSON.parse(await readFile(new URL("../public/data/piyasa.json", import.meta.url), "utf8"));
piyasaDogrula(data);
console.log(`Piyasa verisi doğrulandı. Fiyat: ${data.guncelFiyatlar.tarih}, model: ${data.karar.resmiFiyatTarihi}.`);
