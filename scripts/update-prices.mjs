import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { fiyatBirlestir, piyasaDogrula, kktcBugun } from "../src/piyasa.js";

const file = fileURLToPath(new URL("../public/data/piyasa.json", import.meta.url));
const data = JSON.parse(await readFile(file, "utf8"));
piyasaDogrula(data);
const mode = process.argv[2] || "auto";
let price;
if (mode === "manual") {
  // A file for local usage, an environment variable for workflow_dispatch.
  price = JSON.parse(process.argv[3] ? await readFile(resolve(process.argv[3]), "utf8") : process.env.MANUAL_PRICES || "null");
  if (price) price.yontem = "manuel";
} else if (mode === "auto") {
  const { stdout } = await promisify(execFile)(process.env.PYTHON || "python", [fileURLToPath(new URL("./gazete.py", import.meta.url)), "--today", kktcBugun()], { timeout: 12 * 60 * 1000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  price = JSON.parse(stdout);
} else {
  throw new Error("Kullanım: node scripts/update-prices.mjs auto | manual [fiyatlar.json]");
}
const next = fiyatBirlestir(data, price);
const temp = `${file}.tmp`;
try {
  await writeFile(temp, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
  await rename(temp, file);
} catch (error) {
  await unlink(temp).catch(() => {});
  throw error;
}
console.log(`${price.tarih}: 95=${price.urunler.b95.resmiPompa}, 98=${price.urunler.b98.resmiPompa}, dizel=${price.urunler.dz.resmiPompa} TL/L. Model varsayımları korundu.`);
