import React from "react";
import { createRoot } from "react-dom/client";
import App, { veriUygula } from "./App.jsx";
import "./index.css";

// Haftalık güncellenen veri dosyası; yüklenemezse uygulamadaki yerleşik veriler kullanılır.
async function basla() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/piyasa.json`, { cache: "no-cache" });
    if (r.ok) veriUygula(await r.json());
  } catch (e) {
    console.warn("piyasa.json yüklenemedi; yerleşik veriler kullanılıyor.", e);
  }
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
basla();
