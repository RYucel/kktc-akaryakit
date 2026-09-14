import { useEffect, useMemo, useRef, useState } from "react";
import { ALANLAR, farkHesapla, turet, gunlukBirlestir } from "./tahmin.js";
import { SABIT, hesapla, ortukCif } from "./hesap.js";
import yerlesikVeri from "../public/data/piyasa.json";
import { piyasaDogrula, kktcBugun, tarihGecerli } from "./piyasa.js";
import { PIYASA_KAYNAKLARI } from "./piyasaKaynaklari.js";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ================================================================== */
/*  Tasarım belirteçleri                                               */
/* ================================================================== */

const T = {
  bg: "#F5F7F8",
  yuzey: "#FFFFFF",
  ink: "#15232B",
  mute: "#5A6972",
  cizgi: "#D6DEE2",
  vurgu: "#1D5C8C",
  artis: "#B8492A",
  azalis: "#2E7D4F",
};

// Paranın gittiği dört yer. Renk körlüğüne dayanıklı (Okabe-Ito tabanlı),
// her segment ayrıca metinle etiketli.
const GRUP = {
  dunya: { ad: "Dünya piyasası", alt: "Ürünün kendisi: Akdeniz fiyatı × dolar kuru", renk: "#1D5C8C", yazi: "#FFFFFF" },
  sirket: { ad: "İthalatçı şirket", alt: "Şirket payı, fiyat tamponu ve nakliye", renk: "#7DB9E0", yazi: "#15232B" },
  bayi: { ad: "İstasyon", alt: "Bayinin payı", renk: "#E3AA2E", yazi: "#15232B" },
  devlet: { ad: "Devlet", alt: "Fon, harçlar ve KDV", renk: "#B8492A", yazi: "#FFFFFF" },
};
const GRUP_SIRA = ["dunya", "sirket", "bayi", "devlet"];

const KALEM = {
  urun: { ad: "Ürün bedeli", grup: "dunya" },
  tampon: { ad: "Fiyat tamponu (%3)", grup: "sirket" },
  ithalatci: { ad: "İthalatçı payı (%4)", grup: "sirket" },
  nakliye: { ad: "Nakliye", grup: "sirket", dogrulanmadi: true },
  bayi: { ad: "Bayi payı (%18)", grup: "bayi" },
  fif: { ad: "Fiyat İstikrar Fonu", grup: "devlet" },
  harc: { ad: "Harç ve fonlar", grup: "devlet", dogrulanmadi: true },
  kdv: { ad: "KDV (%10)", grup: "devlet" },
};
const KALEM_SIRA = ["urun", "tampon", "ithalatci", "nakliye", "bayi", "fif", "harc", "kdv"];

/* ================================================================== */
/*  Ürün özellikleri; tarihli fiyatlar tek JSON dosyasından gelir      */
/* ================================================================== */

const URUNLER = {
  b95: {
    ad: "Benzin 95", kotasyon: "Prem Unl 10 ppm CIF Med", yogunluk: 0.775,
    turizmUsd: 0.01, dizel: false,
  },
  b98: {
    ad: "Benzin 98", kotasyon: "Prem Unl 10 ppm CIF Med", yogunluk: 0.775,
    turizmUsd: 0.01, dizel: false,
  },
  dz: {
    ad: "Euro Diesel", kotasyon: "10 ppm ULSD CIF Med", yogunluk: 0.845,
    turizmUsd: 0.003, dizel: true,
  },
};


let VARSAYILAN_KUR;
let VARSAYILAN_NAKLIYE;
let KARAR = {};
let GUNCEL = {};
let MODEL_ESKI = false;

const KURALLAR = {
  bugun: {
    ad: "Bugünkü kurallar",
    aciklama: "Devlet neredeyse hiçbir şey almıyor: harçlar, turizm fonu ve KDV bu hafta askıda.",
    ayar: { tampon: true, rihtim: false, belediye: false, turizm: false, prim: false, kdv: false, gumruk: 0, fifMod: "resmi" },
  },
  muafiyetBiter: {
    ad: "Harç muafiyeti biterse",
    aciklama: "Süresi dolan rıhtım, belediye, gümrük ve turizm payları geri gelir. KDV yine alınmaz.",
    ayar: { tampon: true, rihtim: true, belediye: true, turizm: true, prim: true, kdv: false, gumruk: 0, fifMod: "resmi" },
  },
  krizOncesi: {
    ad: "Kriz öncesi kurallar",
    aciklama: "Tüm harçlar, %10 KDV ve litrede 9,12 TL fon birlikte alınır.",
    ayar: { tampon: true, rihtim: true, belediye: true, turizm: true, prim: true, kdv: true, gumruk: 0, fifMod: "eski" },
  },
};

/* ------------------------------------------------------------------ */
/*  Dış veri: yayındaki sürüm her hafta data/piyasa.json'dan günceller */
/* ------------------------------------------------------------------ */

let TABAN = [];

export function veriUygula(veri) {
  piyasaDogrula(veri); // doğrulama bitmeden hiçbir ortak değer değişmez
  KARAR = { ...veri.karar };
  GUNCEL = veri.guncelFiyatlar;
  MODEL_ESKI = GUNCEL.tarih !== KARAR.resmiFiyatTarihi || Object.keys(URUNLER).some(k => veri.urunler[k].resmiPompa !== GUNCEL.urunler[k].resmiPompa);
  VARSAYILAN_KUR = veri.varsayim.kur;
  VARSAYILAN_NAKLIYE = veri.varsayim.nakliye;
  for (const k of Object.keys(URUNLER)) {
    Object.assign(URUNLER[k], {
      resmiIAF: veri.urunler[k].resmiIAF,
      resmiFif: veri.urunler[k].resmiFif,
      resmiPompa: GUNCEL.urunler[k].resmiPompa,
    });
  }
  KURALLAR.bugun.ayar = { ...veri.bugunkuKurallar.ayar };
  KURALLAR.bugun.aciklama = veri.bugunkuKurallar.aciklama;
  KURALLAR.bugun.ad = MODEL_ESKI ? "Modeldeki kurallar" : "Bugünkü kurallar";
  TABAN = veri.kayitlar;
}
veriUygula(yerlesikVeri);

/* ================================================================== */
/*  Hesap motoru (önceki sürümle aynı, doğrulandı)                      */
/* ================================================================== */



/* ================================================================== */
/*  Biçim yardımcıları                                                  */
/* ================================================================== */

const tl = (v, d = 2) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const isaretli = (v, d = 2) => (v >= 0 ? "+" : "−") + tl(Math.abs(v), d);
// Türkçe ve noktalı ondalık biçimler kabul edilir; "123abc" reddedilir.
const sayiOku = (s) => {
  let t = String(s ?? "").trim().replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return parseFloat(t);
};
const baslangicCif = () => Object.fromEntries(
  Object.entries(URUNLER).map(([k, u]) => [k, Math.round(ortukCif(u, VARSAYILAN_KUR, KURALLAR.bugun.ayar, VARSAYILAN_NAKLIYE) * 10) / 10])
);

/* ================================================================== */
/*  Uygulama                                                            */
/* ================================================================== */

export default function App({ veriDurumu = {} }) {
  const [urunKey, setUrunKey] = useState("b95");
  const [cifler, setCifler] = useState(baslangicCif);
  const [kur, setKur] = useState(VARSAYILAN_KUR);
  const [nakliye, setNakliye] = useState(VARSAYILAN_NAKLIYE);
  const [kuralKey, setKuralKey] = useState("bugun");
  const [rejim, setRejim] = useState({ ...KURALLAR.bugun.ayar, fifOzel: 0 });
  const [gunluk, setGunluk] = useState(["", "", "", ""]);
  const [kopyalandi, setKopyalandi] = useState(false);
  const kartRef = useRef(null);
  const [kartGorunur, setKartGorunur] = useState(true);

  useEffect(() => {
    if (!kartRef.current || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver(([e]) => setKartGorunur(e.isIntersecting || e.boundingClientRect.top > 0), { threshold: 0.15 });
    o.observe(kartRef.current);
    return () => o.disconnect();
  }, []);

  const u = URUNLER[urunKey];
  const cif = Number(cifler[urunKey]) || 0;
  const bugunCif = ortukCif(u, VARSAYILAN_KUR, KURALLAR.bugun.ayar, VARSAYILAN_NAKLIYE);
  const sonuc = hesapla(u, cif, kur, rejim, nakliye);
  const fark = sonuc.pompa - u.resmiPompa;
  const bugunde = Math.abs(fark) < 0.005;

  const suruculer = useMemo(() => {
    const baz = sonuc.pompa;
    const d = (c, k, r) => hesapla(u, c, k, r, nakliye).pompa - baz;
    const liste = [
      { ad: "Dünya fiyatı 100 $/ton artarsa", tur: "piyasa", d: d(cif + 100, kur, rejim) },
      { ad: "Dünya fiyatı bir günde %2 sıçrarsa", tur: "piyasa", d: d(cif * 1.02, kur, rejim) },
      { ad: "Dolar 1 TL artarsa", tur: "piyasa", d: d(cif, kur + 1, rejim) },
    ];
    if (!rejim.kdv) liste.push({ ad: "%10 KDV geri gelirse", tur: "devlet", d: d(cif, kur, { ...rejim, kdv: true }) });
    if (rejim.fifMod !== "eski") liste.push({ ad: "Fon kriz öncesi seviyeye dönerse", tur: "devlet", d: d(cif, kur, { ...rejim, fifMod: "eski" }) });
    if (!rejim.rihtim || !rejim.belediye || !rejim.turizm || (u.dizel && !rejim.prim))
      liste.push({ ad: "Harç muafiyeti biterse", tur: "devlet", d: d(cif, kur, { ...rejim, rihtim: true, belediye: true, turizm: true, prim: true }) });
    return liste.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  }, [u, cif, kur, rejim, nakliye, sonuc.pompa]);
  const maxD = Math.max(...suruculer.map((s) => Math.abs(s.d)), 0.01);

  const grafik = useMemo(() => {
    const out = [];
    for (let x = 600; x <= 2000; x += 50) {
      out.push({ cif: x, fiyat: +hesapla(u, x, kur, rejim, nakliye).pompa.toFixed(2) });
    }
    return out;
  }, [u, kur, rejim, nakliye]);

  const yuzYansima = hesapla(u, cif + 100, kur, rejim, nakliye).pompa - sonuc.pompa;
  const kurEsdeger = cif > 0 ? (100 * kur) / cif : 0;
  const yuzTL = (g) => (sonuc.gruplar[g] / sonuc.pompa) * 100;

  function cifAyarla(v) { setCifler((o) => ({ ...o, [urunKey]: v })); }
  function kuralSec(k) { setKuralKey(k); setRejim((r) => ({ ...KURALLAR[k].ayar, fifOzel: r.fifOzel })); }
  function kalemDegistir(alan, deger) { setKuralKey("ozel"); setRejim((r) => ({ ...r, [alan]: deger })); }
  function bugunlereDon() {
    setCifler(baslangicCif()); setKur(VARSAYILAN_KUR); setNakliye(VARSAYILAN_NAKLIYE);
    kuralSec("bugun"); setGunluk(["", "", "", ""]);
  }
  const gunlukOrt = (() => {
    const s = gunluk.map(sayiOku).filter((v) => Number.isFinite(v) && v > 0);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
  })();

  async function kopyala() {
    const metin =
      `${u.ad}: hesaplanan fiyat ${tl(sonuc.pompa)} TL/L (resmi fiyat ${tl(u.resmiPompa)} TL). ` +
      `100 TL'lik yakıtın ${tl(yuzTL("dunya"), 0)} TL'si dünya piyasasına, ${tl(yuzTL("sirket"), 0)} TL'si ithalatçıya, ` +
      `${tl(yuzTL("bayi"), 0)} TL'si istasyona, ${tl(yuzTL("devlet"), 0)} TL'si devlete gidiyor. ` +
      `Varsayımlar: dünya fiyatı ${tl(cif, 0)} $/ton, dolar ${tl(kur)} TL, ${kuralKey === "ozel" ? "özel kurallar" : KURALLAR[kuralKey].ad.toLowerCase()}.`;
    try { await navigator.clipboard.writeText(metin); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }
    catch { window.prompt("Metni kopyala:", metin); }
  }

  return (
    <div className="uyg min-h-screen w-full pb-20 lg:pb-0" style={{ background: T.bg, color: T.ink }}>
      <style>{`
        .uyg { font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; font-variant-numeric: tabular-nums; }
        .uyg :focus-visible { outline: 3px solid ${T.vurgu}; outline-offset: 2px; border-radius: 6px; }
        .uyg input[type=range] { accent-color: ${T.vurgu}; height: 28px; }
        .uyg input[type=checkbox], .uyg input[type=radio] { accent-color: ${T.vurgu}; width: 18px; height: 18px; }
        .uyg details > summary { list-style: none; }
        .uyg details > summary::-webkit-details-marker { display: none; }
        .uyg details[open] .ok { transform: rotate(90deg); }
        .seg { transition: width 350ms ease; }
        @media (prefers-reduced-motion: reduce) { .seg { transition: none; } }
      `}</style>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {/* ---------------- Başlık ---------------- */}
        <header className="max-w-2xl">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl" style={{ letterSpacing: "-0.015em" }}>
            Pompada ödediğin para nereye gidiyor?
          </h1>
          <p className="mt-3 text-base leading-relaxed sm:text-lg" style={{ color: T.mute }}>
            KKTC'de akaryakıt fiyatını devlet her hafta bir formülle belirliyor. Aşağıda o formülün içini görebilir,
            dünya fiyatını, doları ya da devletin aldığı payı değiştirip fiyatın nasıl tepki verdiğini deneyebilirsin.
          </p>
        </header>

        <section aria-label="Son resmî akaryakıt fiyatları" className="mt-6 rounded-2xl border p-5 sm:p-6" style={{ background: T.yuzey, borderColor: T.cizgi }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Son resmî akaryakıt fiyatları</h2>
              <p className="mt-1 text-sm" style={{ color: T.mute }}>{trTarihYil(GUNCEL.tarih)} tarihinden geçerli · TL/litre</p>
            </div>
            <button onClick={veriDurumu.yenile} disabled={veriDurumu.yukleniyor} className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: T.cizgi }}>
              {veriDurumu.yukleniyor ? "Kontrol ediliyor…" : "Yayımlanan fiyatları yenile"}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {Object.entries(URUNLER).map(([key, urun]) => (
              <div key={key} className="rounded-xl p-3 sm:p-4" style={{ background: T.bg }}>
                <div className="text-sm font-medium">{urun.ad}</div>
                <div className="mt-1 text-2xl font-bold sm:text-3xl">{tl(urun.resmiPompa)} <span className="text-sm font-normal">TL</span></div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm" style={{ color: T.mute }}>
            <a className="underline" href={`${GUNCEL.kaynak.url}${GUNCEL.kaynak.sayfa ? `#page=${GUNCEL.kaynak.sayfa}` : ""}`} target="_blank" rel="noreferrer">{GUNCEL.kaynak.ad}{GUNCEL.kaynak.gazeteNo ? `, sayı ${GUNCEL.kaynak.gazeteNo}` : ""}</a>
            {GUNCEL.kontrolZamani && ` · Kaynak kontrolü: ${new Date(GUNCEL.kontrolZamani).toLocaleString("tr-TR", { timeZone: "Asia/Nicosia" })} (KKTC saati)`}
          </p>
          <p className="mt-2 text-sm" role="status" aria-live="polite" style={{ color: veriDurumu.hata ? T.artis : T.mute }}>
            {veriDurumu.hata || veriDurumu.mesaj || "Yayımlanan veriler açılışta ve sayfa açıkken 15 dakikada bir kontrol edilir."}
          </p>
          {(!GUNCEL.kontrolZamani || gunFarki(bugunIso(), kktcBugun(new Date(GUNCEL.kontrolZamani))) > 2) &&
            <p className="mt-3 rounded-lg p-3 text-sm" style={{ background: "#FBF0D5", color: "#6B4A00" }}>Kaynak yakın zamanda otomatik doğrulanmadı. Gösterilen tarihli fiyatları kaynak bağlantısından kontrol edebilirsin.</p>}
        </section>

        {(MODEL_ESKI || bugunIso() > KARAR.harcMuafiyetiSonGun || bugunIso() >= KARAR.paketBitis) &&
          <p className="mt-4 rounded-lg p-4 text-sm" role="status" style={{ background: "#FBF0D5", color: "#6B4A00" }}>
            Pompa fiyatlarının tarihi {trTarihYil(GUNCEL.tarih)}; aşağıdaki hesap modelinin tarihi {trTarihYil(KARAR.resmiFiyatTarihi)}.
            Modelin fiyat veya muafiyet bilgileri yeniden doğrulanmalı. Döküm ve zam radarı bu modelin varsayımlarıyla çalışır.
          </p>}

        {/* ---------------- Zam radarı ---------------- */}
        <ZamRadari nakliye={nakliye} onIncele={(k, c, kr) => {
          setUrunKey(k); setCifler((o) => ({ ...o, [k]: Math.round(c * 10) / 10 })); setKur(+kr.toFixed(2)); kuralSec("bugun");
        }} />

        {/* ---------------- Ürün seçimi ---------------- */}
        <div className="mt-7 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="Yakıt türü">
          {Object.entries(URUNLER).map(([k, v]) => {
            const secili = k === urunKey;
            return (
              <button key={k} role="tab" aria-selected={secili} onClick={() => setUrunKey(k)}
                className="rounded-2xl px-3 py-2 text-left font-medium sm:rounded-full sm:px-5 sm:py-2.5"
                style={secili ? { background: T.ink, color: "#fff" } : { background: T.yuzey, border: `1px solid ${T.cizgi}` }}>
                <span className="block text-base sm:inline">{v.ad}</span>
                <span className="block text-sm sm:ml-2 sm:inline" style={{ color: secili ? "#B9C6CD" : T.mute }}>{tl(v.resmiPompa)} TL</span>
              </button>
            );
          })}
        </div>

        {/* ---------------- Ana alan ---------------- */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Sonuç kartı: mobilde üstte, masaüstünde sağda ve yapışkan */}
          <aside className="order-first lg:order-last lg:col-span-5">
            <div ref={kartRef} className="rounded-2xl p-6 lg:sticky lg:top-6" style={{ background: T.yuzey, border: `1px solid ${T.cizgi}` }} aria-live="polite">
              <div className="text-base" style={{ color: T.mute }}>{u.ad}, bir litre</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-6xl font-bold leading-none" style={{ letterSpacing: "-0.02em" }}>{tl(sonuc.pompa)}</span>
                <span className="text-xl font-medium" style={{ color: T.mute }}>TL</span>
              </div>
              <FarkEtiketi fark={fark} resmi={u.resmiPompa} bugunde={bugunde} />

              <h2 className="mt-7 text-base font-semibold">100 TL'lik yakıt aldığında</h2>
              <YuzTLCubugu sonuc={sonuc} />
              <ul className="mt-4 space-y-3">
                {GRUP_SIRA.map((g) => {
                  const pay = yuzTL(g);
                  const bos = sonuc.gruplar[g] < 0.005;
                  return (
                    <li key={g} className="flex items-start gap-3">
                      <span className="mt-1 h-4 w-4 flex-none rounded" style={{ background: GRUP[g].renk }} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{GRUP[g].ad}</div>
                        <div className="text-sm leading-snug" style={{ color: T.mute }}>{GRUP[g].alt}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{bos ? "0" : tl(pay, pay < 1 ? 1 : 0)} TL</div>
                        <div className="text-sm" style={{ color: T.mute }}>litrede {tl(sonuc.gruplar[g])}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={bugunlereDon} disabled={bugunde && kuralKey === "bugun"}
                  className="rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ border: `1px solid ${T.cizgi}`, background: T.bg, opacity: bugunde && kuralKey === "bugun" ? 0.5 : 1 }}>
                  Model başlangıcına dön
                </button>
                <button onClick={kopyala} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: T.vurgu, color: "#fff" }}>
                  {kopyalandi ? "Kopyalandı" : "Sonucu kopyala"}
                </button>
              </div>
            </div>
          </aside>

          {/* Kontroller */}
          <section className="lg:col-span-7" aria-label="Fiyatı değiştiren etkenler">
            <h2 className="text-2xl font-bold">Ne değişirse fiyat ne olur?</h2>
            <p className="mt-2 leading-relaxed" style={{ color: T.mute }}>
              Fiyatı üç şey belirliyor. İlk ikisi dünya piyasasından geliyor, üçüncüsü devletin kararı.
            </p>

            <Kontrol baslik="Dünya fiyatı"
              aciklama={`Akdeniz'e teslim bir ton ${u.dizel ? "dizelin" : "benzinin"} dolar fiyatı (${u.kotasyon}). KKTC fiyatı bunun haftalık ortalamasına dayanıyor.`}>
              <Kaydirici min={600} max={2000} step={1} deger={cif} onChange={cifAyarla} birim="$/ton" ondalik={0}
                etiket="Dünya fiyatı, dolar/ton"
                isaretler={[
                  { deger: bugunCif, etiket: "Modelin referans seviyesi" },
                ]} />
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <HizliButon onClick={() => cifAyarla(Math.round(bugunCif * 10) / 10)}>Model seviyesi ({tl(bugunCif, 0)})</HizliButon>
                <HizliButon onClick={() => cifAyarla(Math.round(cif + 100))}>+100 $</HizliButon>
                <HizliButon onClick={() => cifAyarla(Math.max(600, Math.round(cif - 100)))}>−100 $</HizliButon>
              </div>
            </Kontrol>

            <Kontrol baslik="Dolar kuru" aciklama="Dünya fiyatı dolarla ödendiği için kur yükselince yakıt da pahalanıyor. KKTC Merkez Bankası satış kuru kullanılıyor.">
              <Kaydirici min={40} max={60} step={0.05} deger={kur} onChange={setKur} birim="TL" ondalik={2}
                etiket="Dolar kuru, TL" isaretler={[{ deger: VARSAYILAN_KUR, etiket: "Fiyatlama haftası" }]} />
            </Kontrol>

            <Kontrol baslik="Devletin aldığı pay" aciklama="Savaş nedeniyle devlet akaryakıttan aldığı vergi ve harçların çoğunu haftalık kararlarla askıya aldı.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Vergi kuralları">
                {Object.entries(KURALLAR).map(([k, kr]) => {
                  const secili = kuralKey === k;
                  const p = hesapla(u, cif, kur, { ...kr.ayar, fifOzel: 0 }, nakliye).pompa;
                  return (
                    <button key={k} role="radio" aria-checked={secili} onClick={() => kuralSec(k)}
                      className="rounded-xl p-4 text-left"
                      style={secili ? { background: "#EAF2F8", border: `2px solid ${T.vurgu}` } : { background: T.yuzey, border: `1px solid ${T.cizgi}` }}>
                      <div className="font-semibold">{kr.ad}</div>
                      <div className="mt-1 text-2xl font-bold">{tl(p)} <span className="text-sm font-medium" style={{ color: T.mute }}>TL</span></div>
                      <div className="mt-2 text-sm leading-snug" style={{ color: T.mute }}>{kr.aciklama}</div>
                    </button>
                  );
                })}
              </div>
              {kuralKey === "ozel" && (
                <p className="mt-3 text-sm" style={{ color: T.mute }}>Kalemleri "Ayrıntılı hesap" bölümünden elle ayarladın.</p>
              )}
            </Kontrol>
          </section>
        </div>

        {/* ---------------- Sürücüler ---------------- */}
        <section className="mt-14" aria-label="Fiyatı en çok ne etkiler">
          <h2 className="text-2xl font-bold">Fiyatı en çok ne etkiler?</h2>
          <p className="mt-2 max-w-2xl leading-relaxed" style={{ color: T.mute }}>
            Haftalık değişimi dünya fiyatı belirliyor: her 100 $/ton'luk hareket pompaya {tl(yuzYansima)} TL yansıyor.
            Aynı etkiyi doların {tl(kurEsdeger)} TL yükselmesi yaratır. Devlet kararları ise tek seferde büyük sıçramalara yol açıyor.
          </p>
          <ul className="mt-6 space-y-4">
            {suruculer.map((s) => {
              const renk = s.tur === "piyasa" ? GRUP.dunya.renk : GRUP.devlet.renk;
              return (
                <li key={s.ad} className="grid grid-cols-12 items-center gap-x-4 gap-y-1">
                  <div className="col-span-12 sm:col-span-5">
                    <span className="font-medium">{s.ad}</span>
                    <span className="ml-2 whitespace-nowrap text-sm" style={{ color: renk }}>
                      {s.tur === "piyasa" ? "piyasa" : "devlet kararı"}
                    </span>
                  </div>
                  <div className="col-span-9 sm:col-span-5">
                    <div className="h-4 w-full rounded-full" style={{ background: "#E3E9EC" }}>
                      <div className="seg h-4 rounded-full" style={{ width: `${(Math.abs(s.d) / maxD) * 100}%`, background: renk }} />
                    </div>
                  </div>
                  <div className="col-span-3 text-right font-semibold sm:col-span-2">{isaretli(s.d)} TL</div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------------- Grafik ---------------- */}
        <section className="mt-14 rounded-2xl p-6" style={{ background: T.yuzey, border: `1px solid ${T.cizgi}` }} aria-label="Dünya fiyatı ile pompa fiyatı">
          <h2 className="text-xl font-bold">Dünya fiyatı ile pompa fiyatı arasındaki bağ</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: T.mute }}>
            Seçili kurallar ve {tl(kur)} TL dolar kuruyla. İlişki doğrusal: dünya fiyatı 600'den 2.000 $/ton'a çıktıkça
            {" "}{u.ad.toLowerCase()} {tl(grafik[0].fiyat)} TL'den {tl(grafik[grafik.length - 1].fiyat)} TL'ye çıkıyor.
            Sarı çizgi bugünkü resmi fiyat.
          </p>
          <div className="mt-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grafik} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={T.cizgi} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="cif" type="number" domain={[600, 2000]} ticks={[600, 1000, 1400, 1800]} tick={{ fontSize: 12, fill: T.mute }} tickFormatter={(v) => `${tl(v, 0)} $`} />
                <YAxis tick={{ fontSize: 12, fill: T.mute }} tickFormatter={(v) => tl(v, 0)} width={40} />
                <Tooltip formatter={(v) => [`${tl(v)} TL`, "Pompa fiyatı"]} labelFormatter={(l) => `Dünya fiyatı: ${tl(l, 0)} $/ton`} />
                <ReferenceLine y={u.resmiPompa} stroke={GRUP.bayi.renk} strokeWidth={2} />
                <ReferenceLine x={Math.min(2000, Math.max(600, cif))} stroke={T.ink} strokeDasharray="4 4" />
                <Line type="linear" dataKey="fiyat" stroke={T.vurgu} strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ---------------- Ayrıntılı hesap ---------------- */}
        <section className="mt-14" aria-label="Ayrıntılı hesap">
          <details className="rounded-2xl" style={{ background: T.yuzey, border: `1px solid ${T.cizgi}` }}>
            <summary className="flex cursor-pointer items-center justify-between p-6">
              <div>
                <h2 className="text-xl font-bold">Ayrıntılı hesap</h2>
                <p className="mt-1 text-sm" style={{ color: T.mute }}>Kalem kalem döküm, günlük kotasyonlar ve tüm ayarlar</p>
              </div>
              <span className="ok text-2xl" style={{ color: T.mute, transition: "transform 200ms" }} aria-hidden="true">›</span>
            </summary>
            <div className="grid grid-cols-1 gap-8 px-6 pb-6 lg:grid-cols-2">
              <div>
                <h3 className="font-semibold">Bir litrenin dökümü</h3>
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {KALEM_SIRA.map((k) => {
                      const v = sonuc.kalemler[k];
                      const bos = v < 0.0005;
                      return (
                        <tr key={k} style={{ borderBottom: `1px solid ${T.cizgi}`, color: bos ? T.mute : T.ink }}>
                          <td className="py-2 pr-2">
                            <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: GRUP[KALEM[k].grup].renk }} />
                            {KALEM[k].ad}
                            {KALEM[k].dogrulanmadi && <Rozet />}
                          </td>
                          <td className="py-2 text-right">{bos ? "alınmıyor" : `${tl(v)} TL`}</td>
                        </tr>
                      );
                    })}
                    <tr><td className="pt-3 font-semibold">Pompa fiyatı</td><td className="pt-3 text-right font-semibold">{tl(sonuc.pompa)} TL</td></tr>
                    <tr><td className="text-sm" style={{ color: T.mute }}>İthalatçı tavan fiyatı</td><td className="text-right text-sm" style={{ color: T.mute }}>{tl(sonuc.iaf, 4)} TL</td></tr>
                  </tbody>
                </table>

                <h3 className="mt-8 font-semibold">Günlük kotasyonlardan ortalama al</h3>
                <p className="mt-1 text-sm" style={{ color: T.mute }}>Fiyat, Cuma'dan Çarşamba'ya kadar olan iş günlerinin ortalamasıyla hesaplanıyor.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {["Cuma", "Pazartesi", "Salı", "Çarşamba"].map((gun, i) => (
                    <label key={gun} className="text-sm">
                      <span style={{ color: T.mute }}>{gun}</span>
                      <input type="text" inputMode="decimal" placeholder="1.500,00" value={gunluk[i]}
                        onChange={(e) => { const y = [...gunluk]; y[i] = e.target.value; setGunluk(y); }}
                        className="mt-1 w-full rounded-lg px-3 py-2 text-right" style={{ border: `1px solid ${T.cizgi}` }} />
                    </label>
                  ))}
                </div>
                <button disabled={gunlukOrt === null} onClick={() => cifAyarla(Math.round(gunlukOrt * 10) / 10)}
                  className="mt-3 rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ background: gunlukOrt === null ? T.cizgi : T.vurgu, color: gunlukOrt === null ? T.mute : "#fff" }}>
                  {gunlukOrt === null ? "Önce en az bir gün gir" : `Ortalamayı uygula (${tl(gunlukOrt)} $/ton)`}
                </button>
              </div>

              <div>
                <h3 className="font-semibold">Kalemleri tek tek ayarla</h3>
                <div className="mt-3 space-y-3 text-sm">
                  {[
                    ["kdv", "%10 KDV"],
                    ["rihtim", "Rıhtım harcı (%2,2)", true],
                    ["belediye", "Belediye kıymet ve tartı ücreti (%1,5)", true],
                    ["turizm", "Turizm fonu"],
                    ["prim", "%1 ithalat primi (yalnız dizel)"],
                    ["tampon", "Fiyat tamponu (%3)"],
                  ].map(([k, et, dg]) => (
                    <label key={k} className="flex items-center gap-3">
                      <input type="checkbox" checked={!!rejim[k]} onChange={(e) => kalemDegistir(k, e.target.checked)} />
                      <span>{et}{dg && <Rozet />}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-3">
                    <span className="flex-1">Gümrük vergisi (%)<Rozet /></span>
                    <input type="number" step="0.1" value={rejim.gumruk} onChange={(e) => kalemDegistir("gumruk", +e.target.value || 0)}
                      className="w-24 rounded-lg px-3 py-2 text-right" style={{ border: `1px solid ${T.cizgi}` }} />
                  </label>
                  <label className="flex items-center gap-3">
                    <span className="flex-1">Nakliye (TL/litre)<Rozet /></span>
                    <input type="number" step="0.001" value={nakliye} onChange={(e) => setNakliye(+e.target.value || 0)}
                      className="w-24 rounded-lg px-3 py-2 text-right" style={{ border: `1px solid ${T.cizgi}` }} />
                  </label>
                  <fieldset className="pt-2">
                    <legend className="font-medium">Fiyat İstikrar Fonu</legend>
                    <div className="mt-2 space-y-2">
                      {[
                        ["resmi", `Resmi değer (${tl(u.resmiFif, 3)} TL)`],
                        ["eski", `Kriz öncesi (${tl(SABIT.eskiFif)} TL)`],
                        ["ozel", "Başka bir değer"],
                      ].map(([m, et]) => (
                        <label key={m} className="flex items-center gap-3">
                          <input type="radio" name="fif" checked={rejim.fifMod === m} onChange={() => kalemDegistir("fifMod", m)} />
                          <span className="flex-1">{et}</span>
                          {m === "ozel" && rejim.fifMod === "ozel" && (
                            <input type="number" step="0.01" value={rejim.fifOzel} onChange={(e) => kalemDegistir("fifOzel", +e.target.value || 0)}
                              className="w-24 rounded-lg px-3 py-2 text-right" style={{ border: `1px solid ${T.cizgi}` }} aria-label="Fon tutarı, TL/litre" />
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
            </div>
          </details>
        </section>

        {/* ---------------- Terimler ---------------- */}
        <section className="mt-14" aria-label="Terimler">
          <h2 className="text-xl font-bold">Terimler</h2>
          <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2">
            {[
              ["Dünya fiyatı (CIF Med)", "İtalya'da Cenova ve Lavera limanlarına teslim edilmiş bir ton yakıtın dolar fiyatı; navlun ve sigorta dahil. Platts adlı fiyat ajansı her gün yayımlıyor."],
              ["Fiyat tamponu", "Tavan fiyat dünya fiyatının %3 üstünden hesaplanıyor. Böylece küçük dalgalanmalarda fiyatın her hafta değişmesi gerekmiyor."],
              ["İthalatçı payı", "Yakıtı ülkeye getiren şirketin fire, masraf ve kârı için ürün bedelinin %4'ü."],
              ["Bayi payı", "İstasyonun payı: ithalatçı fiyatının %18'i."],
              ["Fiyat İstikrar Fonu", `Devletin akaryakıttan aldığı, fiyatları dengelemek için kullanılan fon. Kriz öncesinde litrede 9 TL'nin üzerindeydi, şu an 95 oktanda ${tl(URUNLER.b95.resmiFif * 100, 0)} kuruş.`],
              ["Harç ve fonlar", `Rıhtım harcı, belediye ücreti, gümrük, turizm fonu ve dizelde %1 ithalat primi. Kriz kararlarıyla haftalık olarak askıya alınıyor; son karar ${trTarih(isodanTarih(KARAR.harcMuafiyetiSonGun))} tarihine kadar geçerli.`],
            ].map(([t, a]) => (
              <div key={t}>
                <div className="font-semibold">{t}</div>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: T.mute }}>{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Kaynak ---------------- */}
        <footer className="mt-14 border-t pt-6 text-sm leading-relaxed" style={{ borderColor: T.cizgi, color: T.mute }}>
          <p className="max-w-3xl">
            Hesap, 2001 Petrol Ürünlerinin Fiyatlandırma Esaslarını Düzenleyen Tüzük (madde 2, 4, 8 ve 14) ile {KARAR.kaynakGazete}
            {" "}kararlarına dayanıyor. Bu bir resmi hesap cetveli değil; yayımlanan fiyatlardan
            geriye doğru kurulmuş bir model. Model, {trTarihYil(KARAR.resmiFiyatTarihi)} resmi fiyatlarını yeniden üretecek şekilde ayarlandı; bu bir kalibrasyondur,
            bağımsız doğrulama değildir.
          </p>
          <p className="mt-3 max-w-3xl">
            <Rozet sade /> işaretli değerler resmi kaynakta doğrulanamadı: rıhtım harcı oranı ve belediye ücretinin matrahı eski
            verilerden türetildi, nakliye bedeli güncel olmayabilir, gümrük oranı bilinmediği için sıfır alındı. Kriz öncesi fon
            değeri 95 oktana ait; diğer ürünlerde de aynısı kullanıldı.
          </p>
        </footer>
      </div>

      {/* ---------------- Mobil yapışkan özet ---------------- */}
      {!kartGorunur && <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between px-4 py-3 lg:hidden"
        style={{ background: T.ink, color: "#fff" }} aria-hidden="true">
        <span className="text-sm" style={{ color: "#B9C6CD" }}>{u.ad}</span>
        <span className="text-xl font-bold">{tl(sonuc.pompa)} TL</span>
        <span className="text-sm font-semibold" style={{ color: bugunde ? "#B9C6CD" : fark > 0 ? "#F4A98F" : "#9FD6B2" }}>
          {Math.abs(fark) < 0.005 ? "resmî fiyatla aynı" : `${isaretli(fark)} TL`}
        </span>
      </div>}
    </div>
  );
}

/* ================================================================== */
/*  Alt bileşenler                                                      */
/* ================================================================== */

function FarkEtiketi({ fark, resmi }) {
  if (Math.abs(fark) < 0.005) {
    return <p className="mt-3 text-base" style={{ color: T.mute }}>Bugünkü resmi fiyatla aynı.</p>;
  }
  const yukari = fark > 0;
  return (
    <p className="mt-3 text-base">
      <span className="rounded-md px-2 py-1 font-semibold"
        style={{ background: yukari ? "#F8E4DD" : "#DDF0E4", color: yukari ? T.artis : T.azalis }}>
        {isaretli(fark)} TL ({isaretli((fark / resmi) * 100, 1)}%)
      </span>
      <span className="ml-2" style={{ color: T.mute }}>bugünkü {tl(resmi)} TL'ye göre</span>
    </p>
  );
}

function YuzTLCubugu({ sonuc }) {
  return (
    <div className="mt-3 flex h-12 w-full overflow-hidden rounded-lg" role="img"
      aria-label={GRUP_SIRA.map((g) => `${GRUP[g].ad} ${tl((sonuc.gruplar[g] / sonuc.pompa) * 100, 0)} TL`).join(", ")}>
      {GRUP_SIRA.map((g) => {
        const pay = (sonuc.gruplar[g] / sonuc.pompa) * 100;
        if (pay < 0.05) return null;
        return (
          <div key={g} className="seg flex items-center justify-center text-sm font-semibold"
            style={{ width: `${pay}%`, background: GRUP[g].renk, color: GRUP[g].yazi }} title={`${GRUP[g].ad}: ${tl(pay, 1)} TL`}>
            {pay >= 9 ? tl(pay, 0) : ""}
          </div>
        );
      })}
    </div>
  );
}

function Kontrol({ baslik, aciklama, children }) {
  return (
    <div className="mt-6 rounded-2xl p-5 sm:p-6" style={{ background: T.yuzey, border: `1px solid ${T.cizgi}` }}>
      <h3 className="text-lg font-semibold">{baslik}</h3>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: T.mute }}>{aciklama}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Kaydirici({ min, max, step, deger, onChange, birim, ondalik, etiket, isaretler = [] }) {
  const konum = (v) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <input type="range" min={min} max={max} step={step} value={deger}
            onChange={(e) => onChange(+e.target.value)} className="w-full" aria-label={etiket}
            aria-valuetext={`${tl(deger, ondalik)} ${birim}`} />
          {isaretler.map((m) => (
            <span key={m.etiket} className="pointer-events-none absolute" aria-hidden="true"
              style={{ left: konum(m.deger), top: 26, transform: "translateX(-50%)", width: 2, height: 10, background: T.ink }} />
          ))}
        </div>
        <label className="flex items-baseline gap-1">
          <input type="number" step={step} value={deger} onChange={(e) => onChange(e.target.value === "" ? 0 : +e.target.value)}
            className="w-28 rounded-lg px-3 py-2 text-right text-lg font-semibold" style={{ border: `1px solid ${T.cizgi}` }}
            aria-label={`${etiket}, tam değer`} />
          <span className="text-sm" style={{ color: T.mute }}>{birim}</span>
        </label>
      </div>
      {isaretler.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: T.mute }}>
          {isaretler.map((m) => (
            <span key={m.etiket} className="flex items-center gap-2">
              <span className="inline-block" style={{ width: 2, height: 10, background: T.ink }} aria-hidden="true" />
              {m.etiket}: {tl(m.deger, ondalik)} {birim}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function HizliButon({ onClick, children }) {
  return (
    <button onClick={onClick} className="rounded-full px-3 py-1.5"
      style={{ background: T.bg, border: `1px solid ${T.cizgi}` }}>
      {children}
    </button>
  );
}

function Rozet({ sade }) {
  return (
    <span className={`${sade ? "" : "ml-2"} inline-block rounded px-1.5 py-0.5 align-middle text-xs font-medium`}
      style={{ background: "#FBF0D5", color: "#7A5A0C" }} title="Resmi kaynakta doğrulanamadı">
      doğrulanmadı
    </span>
  );
}


/* ================================================================== */
/*  Zam radarı: piyasa günlüğü, fiyatlama penceresi ve tahmin           */
/* ================================================================== */

const DEPO_ANAHTAR = "akaryakit-yerel-v2"; // yalnız kullanıcının kendi girdiği değerler

const prim98 = () => ortukCif(URUNLER.b98, VARSAYILAN_KUR, KURALLAR.bugun.ayar, VARSAYILAN_NAKLIYE)
  - ortukCif(URUNLER.b95, VARSAYILAN_KUR, KURALLAR.bugun.ayar, VARSAYILAN_NAKLIYE);

const isoGun = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const trTarih = (d) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
const isodanTarih = (s) => { const [y, m, g] = s.split("-").map(Number); return new Date(y, m - 1, g); };
const bugunIso = kktcBugun;
const trTarihYil = (iso) => isodanTarih(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
function gunFarki(a, b) { return Math.round((isodanTarih(a) - isodanTarih(b)) / 86400000); }

// Tüzük geçici maddesi: Cuma'dan sonraki Çarşamba'ya kadar olan iş günlerinin ortalaması
function aktifPencere(simdi = isodanTarih(bugunIso())) {
  const d = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  const cumadanBeri = (d.getDay() - 5 + 7) % 7;
  const bas = new Date(d); bas.setDate(d.getDate() - cumadanBeri);
  const gunler = [0, 3, 4, 5].map((ek) => { const x = new Date(bas); x.setDate(bas.getDate() + ek); return x; });
  const son = gunler[3];
  const aciklama = new Date(son); aciklama.setDate(son.getDate() + 1);
  return { bas, son, aciklama, gunler, isoGunler: gunler.map(isoGun), kapandi: d.getDay() === 4 };
}

// Vekil ile CIF Med arasındaki farkı, ikisinin de girildiği son günlerden hesapla.
// Önce hedef tarihten önceki/aynı günler kullanılır; hiç yoksa elde olan tüm çiftler.



// Doğrudan CIF yoksa sırayla: vekil + kalibre fark (benzinde Eurobob, dizelde gasoil),
// o da yoksa en yakın önceki kayıttan Brent değişimi.


const YONTEM_ET = { eurobob: "Eurobob ve Akdeniz farkından", gasoil: "gasoil ve Akdeniz farkından", brent: "Brent değişiminden", model: "resmî fiyattan geriye hesapla" };
function yontemMetni(yontemler) {
  const say = {};
  for (const y of yontemler) say[y] = (say[y] || 0) + 1;
  return Object.entries(say).map(([y, n]) => `${n} günü ${YONTEM_ET[y]}`).join(", ");
}

// İnternetten gelen her değer tek tek denetlenir
const ETIKET = { b95: "Benzin CIF Med", dz: "Dizel CIF Med", eurobob: "Eurobob vadeli", gasoil: "Gasoil vadeli", hsfo: "HSFO 3,5% vadeli", brent: "Brent", kur: "Dolar" };
const BIRIM = { b95: "$/t", dz: "$/t", eurobob: "$/t", gasoil: "$/t", hsfo: "$/t", brent: "$/varil", kur: "TL" };
const ARALIK = { b95: [300, 3000], dz: [300, 3000], eurobob: [300, 3000], gasoil: [300, 3000], hsfo: [50, 3000], brent: [20, 300], kur: [10, 200] };
const MAKS_YAS = 3;
function degerDenetle(alan, v, bugun) {
  const deger = typeof v?.deger === "number" && Number.isFinite(v.deger) ? v.deger : null;
  const tarih = typeof v?.tarih === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.tarih) ? v.tarih : null;
  const url = typeof v?.kaynak === "string" && /^https?:\/\//.test(v.kaynak) ? v.kaynak : null;
  const temel = { alan, deger, tarih, url };
  if (deger == null) return { ...temel, durum: "yok", neden: "bulunamadı" };
  if (!tarih) return { ...temel, durum: "red", neden: "kaynakta tarih yok" };
  if (tarih > bugun) return { ...temel, durum: "red", neden: "gelecek tarih" };
  const yas = gunFarki(bugun, tarih);
  if (yas > MAKS_YAS) return { ...temel, durum: "red", neden: `${yas} gün eski` };
  const [min, max] = ARALIK[alan];
  if (deger < min || deger > max) return { ...temel, durum: "red", neden: "olağan aralık dışında, birim hatası olabilir" };
  if (!url) return { ...temel, durum: "red", neden: "kaynak bağlantısı yok" };
  return { ...temel, durum: "kabul", neden: "" };
}

const GUVEN = {
  yuksek: { et: "yüksek", aciklama: "Bu haftanın en az 3 gününün doğrudan fiyatı var." },
  orta: { et: "orta", aciklama: "Bu haftanın 1–2 gününün doğrudan fiyatı var." },
  dusuk: { et: "düşük", aciklama: "Bu haftanın doğrudan fiyatı yok; önceki günden ya da Brent değişiminden türetildi." },
};

function durum(fark, guven) {
  if (guven === "dusuk") {
    if (fark >= 0.5) return { et: "Artış olabilir", renk: "#8A5A00", zemin: "#FBF0D5" };
    if (fark <= -0.5) return { et: "İndirim olabilir", renk: T.azalis, zemin: "#E8F5EC" };
    return { et: "Belirgin değişim yok", renk: T.mute, zemin: "#EEF2F4" };
  }
  if (fark >= 2) return { et: "Zam bekleniyor", renk: T.artis, zemin: "#F8E4DD" };
  if (fark >= 0.5) return { et: "Küçük artış olası", renk: "#8A5A00", zemin: "#FBF0D5" };
  if (fark <= -2) return { et: "İndirim bekleniyor", renk: T.azalis, zemin: "#DDF0E4" };
  if (fark <= -0.5) return { et: "Küçük indirim olası", renk: T.azalis, zemin: "#E8F5EC" };
  return { et: "Değişiklik beklenmiyor", renk: T.mute, zemin: "#EEF2F4" };
}

// Aynı güne ait kayıtları tek satırda birleştir: sonra girilen dolu alan öncekinin yerine geçer.



// Depolama tek yerde: Claude içinde window.storage; bağımsız bir PWA'da burası IndexedDB ile değiştirilir.
// Yayındaki sürüm: Claude içinde window.storage, tarayıcıda localStorage kullanılır.
function tarayiciDeposu() {
  try { const k = "__deneme"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return true; } catch { return false; }
}
const depo = {
  claudeIcinde: () => typeof window !== "undefined" && !!window.storage,
  var: () => typeof window !== "undefined" && (!!window.storage || tarayiciDeposu()),
  async oku(anahtar) {
    try {
      if (depo.claudeIcinde()) { const r = await window.storage.get(anahtar, false); return r?.value ?? null; }
      if (tarayiciDeposu()) return window.localStorage.getItem(anahtar);
    } catch { /* yok say */ }
    return null;
  },
  async yaz(anahtar, deger) {
    try {
      if (depo.claudeIcinde()) { await window.storage.set(anahtar, deger, false); return true; }
      if (tarayiciDeposu()) { window.localStorage.setItem(anahtar, deger); return true; }
    } catch (e) { console.error("Kayıt saklanamadı:", e); }
    return false;
  },
};

const BOS_FORM = { tarih: "", b95: "", dz: "", eurobob: "", gasoil: "", hsfo: "", brent: "", kur: "", not: "" };
const ESKI_VERI_GUN = 10;

function ZamRadari({ nakliye, onIncele }) {
  const [yerel, setYerel] = useState([]);
  const kayitlar = useMemo(() => gunlukBirlestir([...TABAN, ...yerel]), [yerel]);
  const yerelTarihler = useMemo(() => new Set(yerel.map((x) => x.tarih)), [yerel]);
  const [yuklendi, setYuklendi] = useState(false);
  const [kalici, setKalici] = useState(true);
  const [form, setForm] = useState(null);
  const [formHata, setFormHata] = useState("");
  const [aranıyor, setAraniyor] = useState(false);
  const [bulunan, setBulunan] = useState(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    (async () => {
      setKalici(depo.var());
      const ham = await depo.oku(DEPO_ANAHTAR);
      if (ham) { try { const v = JSON.parse(ham); if (Array.isArray(v)) setYerel(v); } catch { /* bozuk kayıt: yok say */ } }
      setYuklendi(true);
    })();
  }, []);

  async function yerelKaydet(liste) {
    setYerel(liste);
    const ok = await depo.yaz(DEPO_ANAHTAR, JSON.stringify(liste));
    if (!ok) setKalici(false);
  }

  const bugun = bugunIso();
  const pencere = aktifPencere();
  const turetilmis = useMemo(() => turet(kayitlar), [kayitlar]);
  const gecerli = turetilmis.filter((k) => k.tarih <= bugun); // gelecek tarihli kayıt hesaba girmez
  const penceredeki = gecerli.filter((k) => pencere.isoGunler.includes(k.tarih));
  const girilenGun = penceredeki.filter((k) => (k.b95 != null && !k.tahmini.includes("b95")) || (k.dz != null && !k.tahmini.includes("dz"))).length;

  // O günün kuru; yoksa o güne kadarki son bilinen kur
  function gununKuru(tarih) {
    const k = [...gecerli].reverse().find((x) => x.tarih <= tarih && x.kur != null);
    return k ? k.kur : VARSAYILAN_KUR;
  }

  // Tüzük: her günün CIF'i kendi günkü kurla TL'ye çevrilir, sonra ortalama alınır.
  function tahmin(alan, ekPrim = 0) {
    const icte = penceredeki.filter((k) => k[alan] != null);
    if (icte.length) {
      const kurlar = icte.map((k) => gununKuru(k.tarih));
      const tlOrt = icte.reduce((a, k, i) => a + (k[alan] + ekPrim) * kurlar[i], 0) / icte.length;
      const kurOrt = kurlar.reduce((a, b) => a + b, 0) / kurlar.length;
      const yontemler = icte.filter((k) => k.tahmini.includes(alan)).map((k) => k.yontem[alan]);
      const dogrudan = icte.length - yontemler.length;
      const kalibre = yontemler.filter((y) => y === "eurobob" || y === "gasoil").length;
      const guven = dogrudan >= 3 ? "yuksek" : dogrudan >= 1 || kalibre >= 2 ? "orta" : "dusuk";
      return { cif: tlOrt / kurOrt, kur: kurOrt, gun: icte.length, yontemler, kaynak: "pencere", guven };
    }
    const son = [...gecerli].reverse().find((k) => k[alan] != null);
    if (!son) return null;
    return {
      cif: son[alan] + ekPrim, kur: gununKuru(son.tarih), gun: 0, yontemler: son.tahmini.includes(alan) ? [son.yontem[alan]] : [],
      kaynak: "son", tarih: son.tarih, guven: "dusuk", eski: gunFarki(bugun, son.tarih) > ESKI_VERI_GUN,
    };
  }

  const kartlar = [
    { k: "b95", t: tahmin("b95") },
    { k: "b98", t: tahmin("b95", prim98()) },
    { k: "dz", t: tahmin("dz") },
  ].map((x) => {
    if (!x.t || x.t.eski) return { ...x, yok: true };
    const u = URUNLER[x.k];
    const p = hesapla(u, x.t.cif, x.t.kur, KURALLAR.bugun.ayar, nakliye).pompa;
    const pm = hesapla(u, x.t.cif, x.t.kur, KURALLAR.muafiyetBiter.ayar, nakliye).pompa;
    return { ...x, p, pm, fark: p - u.resmiPompa, farkM: pm - u.resmiPompa };
  });
  const kurGelecek = kartlar.find((x) => x.t && !x.yok)?.t.kur ?? VARSAYILAN_KUR;
  const siraliKayit = useMemo(() => [...kayitlar].sort((a, b) => a.tarih.localeCompare(b.tarih)), [kayitlar]);
  const farkBenzin = farkHesapla(siraliKayit, "b95", "eurobob", bugun);
  const farkDizel = farkHesapla(siraliKayit, "dz", "gasoil", bugun);
  const paketBitti = bugun >= KARAR.paketBitis || bugun > KARAR.harcMuafiyetiSonGun;
  const paketBitiyor = !paketBitti && gunFarki(KARAR.paketBitis, bugun) <= 3;

  async function internettenGetir() {
    setAraniyor(true); setHata(""); setBulunan(null);
    const alanSablonu = '{"deger":number|null,"tarih":"YYYY-MM-DD"|null,"kaynak":"url"|null}';
    const istem = `Today is ${bugun}. Use web search to find the latest values for these seven items:
b95: Mediterranean CIF premium unleaded 10ppm gasoline assessment, USD per metric ton (Platts "Prem Unl 10ppm CIF Med"). Usually paywalled; return null unless a dated public figure exists.
dz: Mediterranean CIF 10ppm ULSD diesel assessment, USD per metric ton (Platts "10ppm ULSD CIF Med").
eurobob: Eurobob (Euro-bob Oxy NWE barges) gasoline front-month futures on ICE or CME, USD per metric ton.
gasoil: ICE Low Sulphur Gasoil front-month futures, USD per metric ton.
hsfo: European 3.5% Fuel Oil Barges FOB Rotterdam (Platts) front-month futures (NYMEX code UV), USD per metric ton. This is high sulphur fuel oil, not gasoil and not VLSFO.
brent: ICE Brent front-month futures, USD per barrel.
kur: USD/TRY exchange rate.
Rules:
- Report only numbers that literally appear in a search result or a page you opened. Never estimate, convert units or calculate.
- For each number give the trading or assessment date the source states for that number. If the source states no date, use null.
- Ignore sources older than 3 days before today. Old reports and archived documents are common for these terms; do not use them.
- Give the exact URL where the number appears.
Respond with ONLY this JSON object, no markdown, no commentary:
{"b95":${alanSablonu},"dz":${alanSablonu},"eurobob":${alanSablonu},"gasoil":${alanSablonu},"hsfo":${alanSablonu},"brent":${alanSablonu},"kur":${alanSablonu},"not":"one short sentence in Turkish on what was and was not found"}`;
    try {
      const yanit = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: istem }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const veri = await yanit.json();
      const metin = (veri.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").replace(/```json|```/g, "");
      const j = JSON.parse(metin.slice(metin.indexOf("{"), metin.lastIndexOf("}") + 1));
      const sonuclar = ALANLAR.map((a) => degerDenetle(a, j[a], bugun));
      if (sonuclar.every((x) => x.durum === "yok")) setHata("Arama hiçbir değer bulamadı. Değerleri elle girebilirsin.");
      else setBulunan({ sonuclar, not: typeof j.not === "string" ? j.not : "" });
    } catch (e) {
      console.error(e);
      setHata("Otomatik veri alınamadı. Bu özellik yalnızca Claude içinde çalışır; değerleri elle girebilirsin.");
    }
    setAraniyor(false);
  }

  // Kabul edilen değerler kendi tarihlerine yazılır (farklı günlere ait olabilirler)
  function bulunaniEkle() {
    const yeni = bulunan.sonuclar.filter((x) => x.durum === "kabul").map((x) => ({
      tarih: x.tarih, [x.alan]: x.deger, kaynak: "otomatik", kaynaklar: [{ ad: ETIKET[x.alan], url: x.url }],
    }));
    if (yeni.length) yerelKaydet([...yerel, ...yeni]);
    setBulunan(null);
  }

  function formuKaydet() {
    if (!tarihGecerli(form.tarih)) return setFormHata("Geçerli bir tarih seç.");
    if (form.tarih > bugun) return setFormHata("Gelecek tarihli değer girilemez.");
    const hatali = ALANLAR.filter((a) => String(form[a]).trim() !== "" && !Number.isFinite(sayiOku(form[a])));
    if (hatali.length) return setFormHata("Sayı olarak okunamayan alan var. Örnek biçim: 1.500,00");
    const s = (x) => { const v = sayiOku(x); return Number.isFinite(v) ? v : null; };
    const k = { tarih: form.tarih, ...Object.fromEntries(ALANLAR.map((a) => [a, s(form[a])])), kaynak: "elle", not: form.not };
    if (ALANLAR.every((a) => k[a] == null)) return setFormHata("En az bir değer gir.");
    if (ALANLAR.some((a) => k[a] != null && (k[a] < ARALIK[a][0] || k[a] > ARALIK[a][1]))) return setFormHata("Değerlerden biri izin verilen aralık dışında. Birimleri kontrol et.");
    setFormHata(""); yerelKaydet([...yerel, k]); setForm(null);
  }

  const giris = { border: `1px solid ${T.cizgi}`, background: "#fff" };

  return (
    <section className="mt-8 rounded-2xl p-5 sm:p-6" style={{ background: T.yuzey, border: `1px solid ${T.cizgi}` }} aria-label="Zam radarı">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-xl font-bold sm:text-2xl">Gelecek hafta zam var mı?</h2>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: T.mute }}>
            {pencere.kapandi
              ? `Fiyatlama haftası (${trTarih(pencere.bas)}–${trTarih(pencere.son)}) kapandı. Yeni fiyat bugün açıklanabilir.`
              : `Yeni fiyat ${trTarih(pencere.bas)}–${trTarih(pencere.son)} arasındaki dünya fiyatlarının ortalamasıyla hesaplanacak ve ${trTarih(pencere.aciklama)} civarında açıklanacak.`}
            {" "}{girilenGun === 0 ? "Bu haftanın 4 iş gününden henüz hiçbirinin doğrudan fiyatı girilmedi." : `Bu haftanın 4 iş gününden ${girilenGun} tanesinin doğrudan fiyatı var.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {depo.claudeIcinde() && <button onClick={internettenGetir} disabled={aranıyor} className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: T.vurgu, color: "#fff", opacity: aranıyor ? 0.7 : 1 }}>
            {aranıyor ? "Güncel fiyatlar aranıyor…" : "Güncel fiyatları internetten getir"}
          </button>}
          <button onClick={() => { setFormHata(""); setForm(form ? null : { ...BOS_FORM, tarih: bugun }); }}
            className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: `1px solid ${T.cizgi}`, background: T.bg }}>
            {form ? "Formu kapat" : "Değer ekle"}
          </button>
        </div>
      </div>

      {(paketBitti || paketBitiyor) && (
        <p className="mt-4 rounded-lg p-3 text-sm leading-relaxed" style={{ background: "#FBF0D5", color: "#6B4A00" }} role="status">
          {paketBitti
            ? `Son geçici kararların süresi doldu (harç muafiyeti ${trTarih(isodanTarih(KARAR.harcMuafiyetiSonGun))}, KDV ve turizm fonu kararı ${trTarih(isodanTarih(KARAR.paketBitis))}). Uygulamadaki kurallar yeni Resmi Gazete kararlarıyla güncellenene kadar tahminler eski varsayımlara dayanıyor.`
            : `Harç muafiyeti ${trTarih(isodanTarih(KARAR.harcMuafiyetiSonGun))}, KDV ve turizm fonu kararı ${trTarih(isodanTarih(KARAR.paketBitis))} tarihinde sona eriyor. Yeni fiyat bu tarihten sonra geçerli olacağı için iki senaryo da aşağıda gösteriliyor.`}
        </p>
      )}

      {/* Tahmin kartları */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kartlar.map((x) => {
          const u = URUNLER[x.k];
          if (x.yok) {
            return (
              <div key={x.k} className="rounded-xl p-4" style={{ background: T.bg, border: `1px solid ${T.cizgi}` }}>
                <div className="font-semibold">{u.ad}</div>
                <p className="mt-2 text-sm" style={{ color: T.mute }}>
                  {x.t?.eski ? `Son değer ${ESKI_VERI_GUN} günden eski olduğu için tahmin gösterilmiyor. Güncel bir değer ekle.` : "Tahmin için veri yok. Bir değer ekle."}
                </p>
              </div>
            );
          }
          const d = durum(x.fark, x.t.guven);
          return (
            <button key={x.k} onClick={() => onIncele(x.k, x.t.cif, x.t.kur)} className="rounded-xl p-4 text-left"
              style={{ background: T.bg, border: `1px solid ${T.cizgi}` }} aria-label={`${u.ad} tahminini aşağıda incele`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{u.ad}</span>
                <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: d.zemin, color: d.renk }}>{d.et}</span>
              </div>
              <div className="mt-3 text-xs" style={{ color: T.mute }}>Muafiyetler uzatılırsa</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{tl(x.p)}</span>
                <span className="text-sm" style={{ color: T.mute }}>TL</span>
                <span className="text-base font-semibold" style={{ color: Math.abs(x.fark) < 0.5 ? T.mute : x.fark > 0 ? T.artis : T.azalis }}>
                  {isaretli(x.fark)}
                </span>
              </div>
              <div className="mt-1 text-sm" style={{ color: T.mute }}>
                Şu an {tl(u.resmiPompa)} TL. 50 litrelik depoda fark {isaretli(x.fark * 50, 0)} TL.
              </div>
              <div className="mt-2 text-sm" style={{ color: T.mute }}>
                Muafiyetler biterse <span className="font-semibold" style={{ color: T.ink }}>{tl(x.pm)} TL</span> ({isaretli(x.farkM)})
              </div>
              <div className="mt-3 text-xs leading-relaxed" style={{ color: T.mute }}>
                <span className="font-semibold" style={{ color: T.ink }}>Güven: {GUVEN[x.t.guven].et}.</span>{" "}
                {x.t.kaynak === "pencere"
                  ? `${x.t.gun} günün ortalaması${x.t.yontemler.length ? `; ${yontemMetni(x.t.yontemler)} türetildi` : ""}.`
                  : `Bu haftanın verisi yok; ${trTarih(isodanTarih(x.t.tarih))} değeri kullanıldı${x.t.yontemler.length ? ` (${YONTEM_ET[x.t.yontemler[0]]} türetildi)` : ""}.`}
                {x.k === "b98" ? " 95'e sabit 98 primi eklendi." : ""}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {[
          ["Benzin", "Eurobob", farkBenzin, "benzin CIF Med ile Eurobob"],
          ["Dizel", "gasoil", farkDizel, "dizel CIF Med ile gasoil"],
        ].map(([ad, vekil, f, cift]) => (
          <div key={ad} className="rounded-lg px-3 py-2" style={{ background: T.bg, border: `1px solid ${T.cizgi}` }}>
            <span className="font-medium">{ad} için Akdeniz farkı: </span>
            {f
              ? <span>{isaretli(f.fark, 0)} $/t <span style={{ color: T.mute }}>(CIF Med − {vekil}, son {f.gun} günün ortalaması)</span></span>
              : <span style={{ color: T.mute }}>henüz hesaplanamadı. Aynı gün için hem {cift} değerini gir.</span>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed" style={{ color: T.mute }}>
        Bu bir koşullu senaryo, resmi karar veya kesin tahmin değil. Her günün fiyatı o günün kuruyla TL'ye çevrilip ortalaması alınıyor
        (ortalama kur {tl(kurGelecek)} TL). Fon neredeyse sıfır olduğu için artışı fondan karşılama payı kalmadı; yine de fiyat, Nisan'da
        olduğu gibi kararla dondurulabilir. Yöntemin geçmiş haftalardaki isabeti henüz ölçülmedi.
      </p>

      {/* İnternetten bulunan */}
      {hata && <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: "#F8E4DD", color: T.artis }}>{hata}</p>}
      {bulunan && (() => {
        const kabul = bulunan.sonuclar.filter((x) => x.durum === "kabul").length;
        return (
          <div className="mt-4 rounded-xl p-4" style={{ background: "#EAF2F8", border: `1px solid ${T.vurgu}` }}>
            <div className="font-semibold">Aramada bulunan değerler</div>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: T.mute }}>
              Tarihi olmayan, {MAKS_YAS} günden eski, kaynağı gösterilmeyen ya da olağan aralığın dışındaki değerler otomatik reddedildi.
              Kabul edilenlere de kaynağından bakıp öyle ekle. {bulunan.not}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {bulunan.sonuclar.map((x) => (
                    <tr key={x.alan} style={{ borderBottom: `1px solid ${T.cizgi}` }}>
                      <td className="py-2 pr-3 font-medium">{ETIKET[x.alan]}</td>
                      <td className="py-2 pr-3 text-right">{x.deger == null ? "–" : `${tl(x.deger)} ${BIRIM[x.alan]}`}</td>
                      <td className="py-2 pr-3 whitespace-nowrap" style={{ color: T.mute }}>{x.tarih ? trTarih(isodanTarih(x.tarih)) : "tarihsiz"}</td>
                      <td className="py-2 pr-3">
                        {x.durum === "kabul"
                          ? <span className="font-semibold" style={{ color: T.azalis }}>kabul</span>
                          : <span style={{ color: x.durum === "red" ? T.artis : T.mute }}>{x.durum === "red" ? `reddedildi: ${x.neden}` : x.neden}</span>}
                      </td>
                      <td className="py-2">
                        {x.url && <a href={x.url} target="_blank" rel="noreferrer" className="underline" style={{ color: T.vurgu }}>kaynak</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={bulunaniEkle} disabled={!kabul} className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: kabul ? T.vurgu : T.cizgi, color: kabul ? "#fff" : T.mute }}>
                {kabul ? `Kabul edilen ${kabul} değeri günlüğe ekle` : "Eklenecek geçerli değer yok"}
              </button>
              <button onClick={() => setBulunan(null)} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: `1px solid ${T.cizgi}`, background: "#fff" }}>Kapat</button>
            </div>
          </div>
        );
      })()}

      {/* Elle ekleme */}
      {form && (
        <div className="mt-4 rounded-xl p-4" style={{ background: T.bg, border: `1px solid ${T.cizgi}` }}>
          <div className="font-semibold">Değer ekle</div>
          <p className="mt-1 text-sm" style={{ color: T.mute }}>
            Bildiğin kadarını gir. Benzin CIF Med yoksa Eurobob'dan, dizel CIF Med yoksa gasoil'den tahmin edilir; bunun için
            en az bir gün hem CIF Med hem vekil değeri girilmiş olmalı. O da yoksa Brent değişimi kullanılır.
          </p>
          <div className="mt-4 rounded-lg border p-3 text-sm leading-relaxed" style={{ background: T.yuzey, borderColor: T.cizgi }}>
            <h3 className="font-semibold">Doğru veriyi nereden bulurum?</h3>
            <p className="mt-1" style={{ color: T.mute }}>
              Her alanın altında kaynak bağlantısı var. Piyasa günü tamamlandıktan sonra kapanış veya uzlaşma değerini kullan;
              gün içindeki son fiyatı günlük kapanış sanma. Fiyatın kendi tarihini seç; farklı tarihlere ait değerleri ayrı kaydet.
            </p>
            <p className="mt-1" style={{ color: T.mute }}>
              İngilizce tabloda <strong>1,250.50</strong> yazıyorsa <strong>1250.50</strong> olarak gir. Vade ayını ve kaynak bağlantısını notuna ekle.
              Kaynakta tarih veya doğru birim yoksa alanı boş bırak. Bağlantılar yeni sekmede açılır.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[["tarih", "Tarih", "date"], ["b95", "Benzin CIF Med ($/t)"], ["dz", "Dizel CIF Med ($/t)"], ["eurobob", "Eurobob vadeli ($/t)"], ["gasoil", "Gasoil vadeli ($/t)"], ["hsfo", "HSFO 3,5% vadeli ($/t)"], ["brent", "Brent ($/varil)"], ["kur", "Dolar (TL)"]].map(([a, et, tip]) => {
              const kaynak = PIYASA_KAYNAKLARI[a];
              return (
                <div key={a} className="min-w-0 text-sm">
                  <label htmlFor={`radar-${a}`}>
                    <span className="font-medium">{et}</span>
                    <input id={`radar-${a}`} type={tip || "text"} inputMode={tip ? undefined : "decimal"} value={form[a]} max={tip ? bugun : undefined}
                      aria-describedby={`radar-${a}-yardim`}
                      onChange={(e) => setForm({ ...form, [a]: e.target.value })}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-right" style={giris} />
                  </label>
                  <p id={`radar-${a}-yardim`} className="mt-2 text-xs leading-relaxed" style={{ color: T.mute }}>
                    {kaynak?.aciklama || "Verinin ait olduğu günü seç. Bu kayıtta doldurduğun tüm alanlar aynı tarihe ait olmalı."}
                  </p>
                  {kaynak && <>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {kaynak.linkler.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="underline underline-offset-2" style={{ color: T.vurgu }}>
                        {link.ad} <span aria-hidden="true">↗</span><span className="sr-only"> (yeni sekme)</span>
                      </a>)}
                    </div>
                    {kaynak.erisim && <p className="mt-2 text-xs leading-relaxed" style={{ color: T.mute }}>{kaynak.erisim}</p>}
                  </>}
                </div>
              );
            })}
          </div>
          <label className="mt-3 block text-sm">
            <span style={{ color: T.mute }}>Kaynak notu</span>
            <input type="text" value={form.not} onChange={(e) => setForm({ ...form, not: e.target.value })}
              placeholder="örn. ICE MHN, Ekim 2026 vadesi, Settlement; kaynak bağlantısı" className="mt-1 w-full rounded-lg px-3 py-2" style={giris} />
          </label>
          {formHata && <p className="mt-3 text-sm" style={{ color: T.artis }} role="alert">{formHata}</p>}
          <p className="mt-3 text-xs" style={{ color: T.mute }}>Aynı güne ikinci kez değer girersen o günün kaydı güncellenir, yeni gün eklenmez.</p>
          <button onClick={formuKaydet} className="mt-3 rounded-lg px-4 py-2 text-sm font-medium" style={{ background: T.vurgu, color: "#fff" }}>Günlüğe ekle</button>
        </div>
      )}

      {/* Günlük */}
      <details className="mt-5">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <span className="ok inline-block" style={{ transition: "transform 200ms" }} aria-hidden="true">›</span>
          Veri günlüğü ({kayitlar.length} kayıt{yuklendi ? "" : ", yükleniyor"})
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: T.mute, borderBottom: `1px solid ${T.cizgi}` }}>
                <th className="py-2 pr-3 text-left font-medium">Tarih</th>
                <th className="py-2 pr-3 text-right font-medium">Benzin $/t</th>
                <th className="py-2 pr-3 text-right font-medium">Dizel $/t</th>
                <th className="py-2 pr-3 text-right font-medium">Eurobob</th>
                <th className="py-2 pr-3 text-right font-medium">Gasoil</th>
                <th className="py-2 pr-3 text-right font-medium">HSFO</th>
                <th className="py-2 pr-3 text-right font-medium">Brent</th>
                <th className="py-2 pr-3 text-right font-medium">Dolar</th>
                <th className="py-2 pr-3 text-left font-medium">Kaynak</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {[...turetilmis].reverse().map((k) => (
                <tr key={k.tarih} style={{ borderBottom: `1px solid ${T.cizgi}`, background: pencere.isoGunler.includes(k.tarih) ? "#EAF2F8" : "transparent" }}>
                  <td className="py-2 pr-3 whitespace-nowrap">{trTarih(isodanTarih(k.tarih))}</td>
                  <td className="py-2 pr-3 text-right" style={{ color: k.tahmini.includes("b95") ? T.mute : T.ink }}>
                    {k.b95 == null ? "–" : `${k.tahmini.includes("b95") ? "≈" : ""}${tl(k.b95, 0)}`}
                  </td>
                  <td className="py-2 pr-3 text-right" style={{ color: k.tahmini.includes("dz") ? T.mute : T.ink }}>
                    {k.dz == null ? "–" : `${k.tahmini.includes("dz") ? "≈" : ""}${tl(k.dz, 0)}`}
                  </td>
                  <td className="py-2 pr-3 text-right">{k.eurobob == null ? "–" : tl(k.eurobob, 0)}</td>
                  <td className="py-2 pr-3 text-right">{k.gasoil == null ? "–" : tl(k.gasoil, 0)}</td>
                  <td className="py-2 pr-3 text-right">{k.hsfo == null ? "–" : tl(k.hsfo, 0)}</td>
                  <td className="py-2 pr-3 text-right">{k.brent == null ? "–" : tl(k.brent)}</td>
                  <td className="py-2 pr-3 text-right">{k.kur == null ? "–" : tl(k.kur)}</td>
                  <td className="py-2 pr-3" style={{ color: T.mute }} title={(k.notlar || []).join(" ")}>
                    {(k.kaynakTurleri || []).join(", ") || "–"}{k.kaynaklar?.[0] && <>, <a href={k.kaynaklar[0].url} target="_blank" rel="noreferrer" className="underline">bağlantı</a></>}
                  </td>
                  <td className="py-2 text-right">
                    {yerelTarihler.has(k.tarih) && (
                      <button onClick={() => yerelKaydet(yerel.filter((x) => x.tarih !== k.tarih))} className="rounded px-2 py-1 text-xs"
                        style={{ color: T.artis }} aria-label={`${trTarih(isodanTarih(k.tarih))} için girdiğin değerleri sil`}>Sil</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs" style={{ color: T.mute }}>
            Mavi satırlar bu haftanın fiyatlama penceresinde. "≈" işaretli değerler Eurobob, gasoil ya da Brent'ten türetildi.
            {kalici ? "Senin girdiğin değerler yalnızca sende saklanıyor; başkaları görmüyor." : "Bu ortamda kalıcı depolama yok; sayfa yenilenince kayıtlar kaybolur."}
            {" "}Her gün için tek satır tutuluyor.
          </p>
          {yerel.length > 0 && (
            <button onClick={() => yerelKaydet([])} className="mt-2 text-xs underline" style={{ color: T.mute }}>Kendi girdiğim değerleri temizle</button>
          )}
        </div>
      </details>
    </section>
  );
}
