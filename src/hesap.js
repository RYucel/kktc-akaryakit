export const SABIT = {
  tampon: 0.03,     // Tüzük md. 2: tavan = parite × 1,03 + ...
  ithalatci: 0.04,  // md. 14(a)
  bayi: 0.18,       // md. 14(b)
  rihtim: 0.022,    // doğrulanmadı: MAGO verisinden türetildi
  belediye: 0.015,  // Belediyeler Yasası md. 94(8); matrah doğrulanmadı
  prim: 0.01,       // yalnız mazot, CIF üzerinden
  kdv: 0.1,         // KDV açıldığında uygulanacak oran
  eskiFif: 9.1179,  // kriz öncesi 95 FİF'i (MAGO)
};

function fifDegeri(u, r) {
  if (r.fifMod === "resmi") return u.resmiFif;
  if (r.fifMod === "eski") return SABIT.eskiFif;
  return Number(r.fifOzel) || 0;
}

export function hesapla(u, cif, kur, r, nakliye) {
  const P = ((cif * u.yogunluk) / 1000) * kur;
  const tampon = r.tampon ? P * SABIT.tampon : 0;
  const ithalatci = P * SABIT.ithalatci;
  const rihtim = r.rihtim ? P * SABIT.rihtim : 0;
  const gumruk = P * ((Number(r.gumruk) || 0) / 100);
  const prim = r.prim && u.dizel ? P * SABIT.prim : 0;
  const turizm = r.turizm ? u.turizmUsd * kur : 0;
  const fif = fifDegeri(u, r);
  const ara = P + tampon + ithalatci + rihtim + gumruk + prim + turizm + nakliye + fif;
  const belediye = r.belediye ? (ara * SABIT.belediye) / (1 - SABIT.belediye) : 0;
  const iaf = ara + belediye;
  const bayi = iaf * SABIT.bayi;
  const kdv = r.kdv ? (iaf + bayi) * SABIT.kdv : 0;
  const pompa = iaf + bayi + kdv;
  const k = { urun: P, tampon, ithalatci, nakliye, bayi, fif, harc: rihtim + gumruk + prim + turizm + belediye, kdv };
  const g = {
    dunya: k.urun,
    sirket: k.tampon + k.ithalatci + k.nakliye,
    bayi: k.bayi,
    devlet: k.fif + k.harc + k.kdv,
  };
  return { pompa, iaf, kalemler: k, gruplar: g };
}

export function ortukCif(u, kur, r, nakliye) {
  const b = r.belediye ? SABIT.belediye : 0;
  const A = 1 + (r.tampon ? SABIT.tampon : 0) + SABIT.ithalatci + (r.rihtim ? SABIT.rihtim : 0)
    + (Number(r.gumruk) || 0) / 100 + (r.prim && u.dizel ? SABIT.prim : 0);
  const sabitler = nakliye + (r.turizm ? u.turizmUsd * kur : 0) + fifDegeri(u, r);
  const P = (u.resmiIAF * (1 - b) - sabitler) / A;
  return P / ((u.yogunluk / 1000) * kur);
}
