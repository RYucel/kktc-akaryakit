import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import App, { veriUygula } from "./App.jsx";
import yerlesikVeri from "../public/data/piyasa.json";
import { piyasaYukle, veriKimligi } from "./veriYukle.js";
import "./index.css";

function PiyasaUygulamasi() {
  const veriRef = useRef(yerlesikVeri);
  const istekRef = useRef(false);
  const [kimlik, setKimlik] = useState(() => veriKimligi(yerlesikVeri));
  const [durum, setDurum] = useState({ yukleniyor: true, mesaj: "Yayımlanan veriler kontrol ediliyor…" });

  const yenile = useCallback(async () => {
    if (istekRef.current) return;
    istekRef.current = true;
    setDurum({ yukleniyor: true });
    try {
      const data = await piyasaYukle(`${import.meta.env.BASE_URL}data/piyasa.json`, veriRef.current);
      const degisti = veriKimligi(data) !== veriKimligi(veriRef.current);
      veriUygula(data);
      veriRef.current = data;
      setKimlik(veriKimligi(data));
      setDurum({ yukleniyor: false, mesaj: degisti ? "Yeni yayımlanan veriler uygulandı; hesap başlangıç değerlerine döndü." : "Yayımlanan verilerle eşitlendi. Yeni fiyat kararı varsa site güncellemesinden sonra burada görünür." });
    } catch (error) {
      console.warn("Piyasa verisi yenilenemedi:", error);
      setDurum({ yukleniyor: false, hata: "Güncelleme alınamadı veya veri doğrulanamadı. Son geçerli veriler gösteriliyor; tarih ve kaynak kontrolünü dikkate al." });
    } finally {
      istekRef.current = false;
    }
  }, []);

  useEffect(() => {
    yenile();
    const timer = setInterval(() => { if (!document.hidden) yenile(); }, 15 * 60 * 1000);
    const gorunur = () => { if (!document.hidden) yenile(); };
    document.addEventListener("visibilitychange", gorunur);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", gorunur); };
  }, [yenile]);

  return <App key={kimlik} veriDurumu={{ ...durum, yenile }} />;
}

const root = createRoot(document.getElementById("root"));
root.render(<React.StrictMode><PiyasaUygulamasi /></React.StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
