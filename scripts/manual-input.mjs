import { writeFile } from "node:fs/promises";

function number(name) {
  const text = process.env[name]?.trim();
  if (!text || !/^\d+([.,]\d{1,2})?$/.test(text)) throw new Error(`${name}: örnek sayı biçimi 71,12 veya 71.12.`);
  return Number(text.replace(",", "."));
}
const price = {
  tarih: process.env.PRICE_DATE,
  kaynak: { ad: "Elle doğrulanan fiyat kaynağı", url: process.env.SOURCE_URL, yayinTarihi: process.env.PUBLICATION_DATE },
  urunler: {
    b95: { resmiPompa: number("PRICE_B95") },
    b98: { resmiPompa: number("PRICE_B98") },
    dz: { resmiPompa: number("PRICE_DZ") },
  },
};
await writeFile(".tmp/manual-prices.json", JSON.stringify(price));
