"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// ─── TYPE DEFINITIONS ─────────────────────────────────────────────
interface TaxInput {
  brutto: number;
  steuerklasse: string;
  kinder: number;
  kirchensteuer: boolean;
  bundesland: string;
}

interface TaxResult {
  einkommensteuer: number;
  soli: number;
  kirchensteuer: number;
  rentenversicherung: number;
  krankenversicherung: number;
  pflegeversicherung: number;
  arbeitslosenversicherung: number;
  gesamtSteuern: number;
  gesamtSozial: number;
  gesamtAbgaben: number;
  nettoJahreseinkommen: number;
  abgabenquote: number;
}

interface BudgetKategorie {
  name: string;
  betrag: number;
  prozent: number;
  icon: string;
  farbe: string;
  deinAnteil?: number;
}

// ─── TAX CALCULATOR ───────────────────────────────────────────────
const SOCIAL_INSURANCE = {
  rente: { rate: 0.093, bbg: 96600 },
  kranken: { rate: 0.09, bbg: 66150 },
  pflege: { rate: 0.02025, bbg: 66150, kinderloseZuschlag: 0.006 },
  arbeit: { rate: 0.013, bbg: 96600 },
};

function calculateIncomeTax(zvE: number): number {
  if (zvE <= 0) return 0;
  if (zvE <= 12348) return 0;
  if (zvE <= 17005) {
    const y = (zvE - 12348) / 10000;
    return Math.round((922.98 * y + 1400) * y);
  }
  if (zvE <= 66760) {
    const z = (zvE - 17005) / 10000;
    const zone2Full = (922.98 * 0.4657 + 1400) * 0.4657;
    return Math.round((181.19 * z + 2397) * z + zone2Full);
  }
  if (zvE <= 277825) {
    return Math.round(0.42 * zvE - 10777.26);
  }
  return Math.round(0.45 * zvE - 19112.01);
}

function calculateTax(input: TaxInput): TaxResult {
  const { brutto, steuerklasse, kinder, kirchensteuer, bundesland } = input;
  let zvE = brutto;
  if (steuerklasse === "II") zvE -= 4260;
  if (steuerklasse === "III" || steuerklasse === "V") {
    // Simplified: III gets double Grundfreibetrag via splitting, V gets none
  }
  let est;
  if (steuerklasse === "III") {
    est = calculateIncomeTax(zvE / 2) * 2;
  } else if (steuerklasse === "V") {
    est = calculateIncomeTax(zvE + 12348); // No Grundfreibetrag
  } else {
    est = calculateIncomeTax(zvE);
  }

  const soli = est > 18130 ? Math.round(est * 0.055) : 0;

  const kirchenRate =
    kirchensteuer
      ? bundesland === "BY" || bundesland === "BW"
        ? 0.08
        : 0.09
      : 0;
  const kirche = Math.round(est * kirchenRate);

  const rentenBasis = Math.min(brutto, SOCIAL_INSURANCE.rente.bbg);
  const rentenversicherung = Math.round(rentenBasis * SOCIAL_INSURANCE.rente.rate);

  const krankenBasis = Math.min(brutto, SOCIAL_INSURANCE.kranken.bbg);
  const krankenversicherung = Math.round(krankenBasis * SOCIAL_INSURANCE.kranken.rate);

  const pflegeBasis = Math.min(brutto, SOCIAL_INSURANCE.pflege.bbg);
  const pflegeRate =
    kinder === 0
      ? SOCIAL_INSURANCE.pflege.rate + SOCIAL_INSURANCE.pflege.kinderloseZuschlag
      : SOCIAL_INSURANCE.pflege.rate - Math.min(kinder - 1, 4) * 0.0025;
  const pflegeversicherung = Math.round(pflegeBasis * Math.max(pflegeRate, 0));

  const arbeitBasis = Math.min(brutto, SOCIAL_INSURANCE.arbeit.bbg);
  const arbeitslosenversicherung = Math.round(arbeitBasis * SOCIAL_INSURANCE.arbeit.rate);

  const steuern = est + soli + kirche;
  const sozial = rentenversicherung + krankenversicherung + pflegeversicherung + arbeitslosenversicherung;
  const gesamt = steuern + sozial;

  return {
    einkommensteuer: est,
    soli,
    kirchensteuer: kirche,
    rentenversicherung,
    krankenversicherung,
    pflegeversicherung,
    arbeitslosenversicherung,
    gesamtSteuern: steuern,
    gesamtSozial: sozial,
    gesamtAbgaben: gesamt,
    nettoJahreseinkommen: brutto - gesamt,
    abgabenquote: brutto > 0 ? ((gesamt / brutto) * 100) : 0,
  };
}

// ─── BUDGET DATA ──────────────────────────────────────────────────
const BUNDESHAUSHALT = {
  gesamt: 524_540_000_000,
  kategorien: [
    { name: "Arbeit & Soziales", betrag: 197_340_000_000, prozent: 37.6, icon: "👥", farbe: "#3b82f6" },
    { name: "Verteidigung", betrag: 82_690_000_000, prozent: 15.8, icon: "🛡️", farbe: "#ef4444" },
    { name: "Allg. Finanzverwaltung", betrag: 52_400_000_000, prozent: 10.0, icon: "🏛️", farbe: "#f59e0b" },
    { name: "Zins & Schulden", betrag: 30_180_000_000, prozent: 5.8, icon: "💰", farbe: "#8b5cf6" },
    { name: "Verkehr & Infrastruktur", betrag: 27_900_000_000, prozent: 5.3, icon: "🚆", farbe: "#10b981" },
    { name: "Bildung & Forschung", betrag: 22_400_000_000, prozent: 4.3, icon: "🎓", farbe: "#ec4899" },
    { name: "Gesundheit", betrag: 15_700_000_000, prozent: 3.0, icon: "🏥", farbe: "#06b6d4" },
    { name: "Sonstiges", betrag: 93_930_000_000, prozent: 17.9, icon: "📊", farbe: "#64748b" },
  ],
};

function calculateBudgetShare(einkommensteuer: number): BudgetKategorie[] {
  const totalEinkommensteuerRevenue = 190_000_000_000;
  const anteil = einkommensteuer / totalEinkommensteuerRevenue;
  return BUNDESHAUSHALT.kategorien.map((k) => ({
    ...k,
    deinAnteil: Math.round(anteil * k.betrag * 100) / 100,
  }));
}

// ─── SHARE UTILS ──────────────────────────────────────────────────
function generateShareText(r: TaxResult): string {
  return `Mein #SteuerWrapped 2026:\n💰 ${fmt(r.gesamtAbgaben)} Abgaben (${r.abgabenquote.toFixed(1)}%)\n🏛️ ${fmt(r.einkommensteuer)} Einkommensteuer\n👴 ${fmt(r.rentenversicherung)} Rente\n🏥 ${fmt(r.krankenversicherung)} Krankenversicherung\n\nBerechne deins: steuerwrapped.de`;
}

function shareOnX(text: string): void {
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

function shareOnWhatsApp(text: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

// ─── HELPERS ──────────────────────────────────────────────────────
function fmt(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Mrd. €`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} Mio. €`;
  return fmt(n);
}

// ─── ANIMATED NUMBER ──────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200, prefix = "", suffix = "", className = "" }: { value: number; duration?: number; prefix?: string; suffix?: string; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return (
    <span className={className}>
      {prefix}
      {new Intl.NumberFormat("de-DE").format(display)}
      {suffix}
    </span>
  );
}

// ─── STEUERKLASSE INFO ────────────────────────────────────────────
const STEUERKLASSEN = [
  { value: "I", label: "I – Ledig / Geschieden" },
  { value: "II", label: "II – Alleinerziehend" },
  { value: "III", label: "III – Verheiratet (Höherverdiener)" },
  { value: "IV", label: "IV – Verheiratet (Gleichverdiener)" },
  { value: "V", label: "V – Verheiratet (Geringverdiener)" },
  { value: "VI", label: "VI – Zweitjob" },
];

const BUNDESLAENDER = [
  { value: "BW", label: "Baden-Württemberg" },
  { value: "BY", label: "Bayern" },
  { value: "BE", label: "Berlin" },
  { value: "BB", label: "Brandenburg" },
  { value: "HB", label: "Bremen" },
  { value: "HH", label: "Hamburg" },
  { value: "HE", label: "Hessen" },
  { value: "MV", label: "Mecklenburg-Vorpommern" },
  { value: "NI", label: "Niedersachsen" },
  { value: "NW", label: "Nordrhein-Westfalen" },
  { value: "RP", label: "Rheinland-Pfalz" },
  { value: "SL", label: "Saarland" },
  { value: "SN", label: "Sachsen" },
  { value: "ST", label: "Sachsen-Anhalt" },
  { value: "SH", label: "Schleswig-Holstein" },
  { value: "TH", label: "Thüringen" },
];

// ─── SLIDE BACKGROUNDS ───────────────────────────────────────────
const SLIDE_GRADIENTS = [
  "linear-gradient(135deg, #0c1445 0%, #1e1b4b 40%, #312e81 100%)",
  "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0e4a6e 100%)",
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #21262d 100%)",
  "linear-gradient(135deg, #0c0c1d 0%, #1b1140 50%, #2d1b69 100%)",
  "linear-gradient(135deg, #0a192f 0%, #112240 50%, #1d3461 100%)",
  "linear-gradient(135deg, #1a0a2e 0%, #2d1854 50%, #4a1942 100%)",
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────
export default function SteuerWrapped() {
  const [view, setView] = useState("input");
  const [slide, setSlide] = useState(0);
  const [slideDir, setSlideDir] = useState(1);
  const [animKey, setAnimKey] = useState(0);
  const [form, setForm] = useState({
    brutto: 50000,
    steuerklasse: "I",
    kinder: 0,
    kirchensteuer: false,
    bundesland: "NW",
  });

  const result = useMemo(() => calculateTax(form), [form]);
  const budgetShare = useMemo(() => calculateBudgetShare(result.einkommensteuer), [result.einkommensteuer]);

  const TOTAL_SLIDES = 7;

  const goToSlide = useCallback(
    (dir) => {
      setSlideDir(dir);
      setSlide((s) => {
        const next = s + dir;
        if (next < 0 || next >= TOTAL_SLIDES) return s;
        return next;
      });
      setAnimKey((k) => k + 1);
    },
    []
  );

  const handleSubmit = () => {
    setSlide(0);
    setAnimKey(0);
    setView("results");
  };

  // ─── CSS ──────────────────────────────────────────────────────
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --font-display: 'Outfit', system-ui, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    body { font-family: var(--font-display); }

    .sw-root {
      font-family: var(--font-display);
      min-height: 100vh;
      overflow-x: hidden;
      color: #fff;
    }

    /* INPUT PAGE */
    .input-page {
      min-height: 100vh;
      background: linear-gradient(135deg, #0c1445 0%, #1e1b4b 30%, #312e81 60%, #4c1d95 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
      position: relative;
      overflow: hidden;
    }

    .input-page::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(ellipse at 30% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                  radial-gradient(ellipse at 70% 80%, rgba(168, 85, 247, 0.1) 0%, transparent 50%);
      animation: drift 20s ease-in-out infinite;
      pointer-events: none;
    }

    @keyframes drift {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      33% { transform: translate(2%, -1%) rotate(1deg); }
      66% { transform: translate(-1%, 2%) rotate(-1deg); }
    }

    .hero-badge {
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 100px;
      padding: 0.4rem 1.2rem;
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.7);
      margin-bottom: 1.5rem;
      position: relative;
      z-index: 1;
    }

    .hero-title {
      font-size: clamp(2.5rem, 8vw, 4.5rem);
      font-weight: 900;
      text-align: center;
      line-height: 1.05;
      margin-bottom: 0.75rem;
      position: relative;
      z-index: 1;
      background: linear-gradient(135deg, #fff 0%, #c7d2fe 50%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-sub {
      font-size: clamp(0.95rem, 2.5vw, 1.2rem);
      font-weight: 400;
      text-align: center;
      color: rgba(255,255,255,0.55);
      margin-bottom: 2.5rem;
      position: relative;
      z-index: 1;
      max-width: 400px;
    }

    .form-card {
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      padding: 2rem;
      width: 100%;
      max-width: 440px;
      position: relative;
      z-index: 1;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.5);
      margin-bottom: 0.5rem;
    }

    .form-input, .form-select {
      width: 100%;
      padding: 0.85rem 1rem;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      color: #fff;
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 500;
      outline: none;
      transition: all 0.2s;
      -webkit-appearance: none;
    }

    .form-input:focus, .form-select:focus {
      border-color: rgba(139, 92, 246, 0.6);
      background: rgba(255,255,255,0.1);
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
    }

    .form-input::placeholder { color: rgba(255,255,255,0.25); }

    .form-select option {
      background: #1e1b4b;
      color: #fff;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
    }

    .checkbox-toggle {
      width: 44px;
      height: 24px;
      background: rgba(255,255,255,0.12);
      border-radius: 12px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
      border: none;
    }

    .checkbox-toggle.active {
      background: #8b5cf6;
    }

    .checkbox-toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }

    .checkbox-toggle.active::after {
      transform: translateX(20px);
    }

    .checkbox-label {
      font-size: 0.95rem;
      font-weight: 500;
      color: rgba(255,255,255,0.8);
    }

    .submit-btn {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%);
      border: none;
      border-radius: 14px;
      color: #fff;
      font-family: var(--font-display);
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.25s;
      margin-top: 0.5rem;
      position: relative;
      overflow: hidden;
    }

    .submit-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(139, 92, 246, 0.4);
    }

    .submit-btn:active { transform: translateY(0); }

    .disclaimer {
      text-align: center;
      font-size: 0.75rem;
      color: rgba(255,255,255,0.3);
      margin-top: 1.5rem;
      position: relative;
      z-index: 1;
      max-width: 400px;
    }

    /* RESULTS SLIDES */
    .results-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      transition: background 0.6s ease;
    }

    .slide-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.5rem;
      min-height: calc(100vh - 80px);
      position: relative;
    }

    .slide-content {
      width: 100%;
      max-width: 480px;
      animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(30px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .slide-emoji {
      font-size: 3.5rem;
      text-align: center;
      margin-bottom: 1rem;
      animation: bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
    }

    @keyframes bounce {
      from { opacity: 0; transform: scale(0.3); }
      to { opacity: 1; transform: scale(1); }
    }

    .slide-title {
      font-size: clamp(1.5rem, 5vw, 2.2rem);
      font-weight: 800;
      text-align: center;
      margin-bottom: 0.5rem;
      line-height: 1.15;
    }

    .slide-subtitle {
      font-size: clamp(0.9rem, 2.5vw, 1.05rem);
      text-align: center;
      color: rgba(255,255,255,0.5);
      margin-bottom: 2rem;
      font-weight: 400;
    }

    .big-number {
      font-family: var(--font-mono);
      font-size: clamp(2.5rem, 10vw, 4rem);
      font-weight: 700;
      text-align: center;
      margin: 1rem 0;
      line-height: 1;
    }

    .big-number-label {
      font-size: clamp(1rem, 3vw, 1.3rem);
      text-align: center;
      color: rgba(255,255,255,0.6);
      font-weight: 500;
    }

    /* GLASS CARDS */
    .glass-card {
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 1.25rem;
      margin-bottom: 0.75rem;
    }

    .glass-card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .glass-card-label {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.5);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .glass-card-value {
      font-family: var(--font-mono);
      font-size: 1.4rem;
      font-weight: 700;
    }

    .glass-card-sub {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.4);
      margin-top: 0.25rem;
    }

    /* SPLIT CARDS */
    .split-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .split-card {
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 1.2rem;
      text-align: center;
    }

    .split-card-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .split-card-value {
      font-family: var(--font-mono);
      font-size: 1.3rem;
      font-weight: 700;
      margin-bottom: 0.2rem;
    }
    .split-card-label {
      font-size: 0.75rem;
      color: rgba(255,255,255,0.45);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    /* PODIUM */
    .podium {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .podium-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 1rem 1.25rem;
      animation: podiumIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .podium-item:nth-child(1) { animation-delay: 0.1s; }
    .podium-item:nth-child(2) { animation-delay: 0.25s; }
    .podium-item:nth-child(3) { animation-delay: 0.4s; }

    @keyframes podiumIn {
      from { opacity: 0; transform: translateX(-20px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .podium-rank {
      font-size: 1.6rem;
      font-weight: 900;
      width: 2.5rem;
      text-align: center;
      flex-shrink: 0;
    }

    .podium-icon { font-size: 1.8rem; flex-shrink: 0; }
    .podium-info { flex: 1; }
    .podium-name { font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.8); }
    .podium-amount {
      font-family: var(--font-mono);
      font-size: 1.15rem;
      font-weight: 700;
    }

    /* BUDGET LIST */
    .budget-list {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      margin-top: 1.25rem;
    }

    .budget-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 0.85rem 1rem;
      animation: budgetIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .budget-item:nth-child(1) { animation-delay: 0.05s; }
    .budget-item:nth-child(2) { animation-delay: 0.1s; }
    .budget-item:nth-child(3) { animation-delay: 0.15s; }
    .budget-item:nth-child(4) { animation-delay: 0.2s; }
    .budget-item:nth-child(5) { animation-delay: 0.25s; }
    .budget-item:nth-child(6) { animation-delay: 0.3s; }
    .budget-item:nth-child(7) { animation-delay: 0.35s; }
    .budget-item:nth-child(8) { animation-delay: 0.4s; }

    @keyframes budgetIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .budget-icon { font-size: 1.3rem; flex-shrink: 0; }

    .budget-bar-container {
      flex: 1;
      min-width: 0;
    }

    .budget-name-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.3rem;
    }

    .budget-name {
      font-size: 0.8rem;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .budget-pct {
      font-size: 0.7rem;
      color: rgba(255,255,255,0.4);
      font-weight: 500;
      flex-shrink: 0;
      margin-left: 0.5rem;
    }

    .budget-bar {
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
    }

    .budget-bar-fill {
      height: 100%;
      border-radius: 3px;
      animation: barGrow 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    @keyframes barGrow {
      from { width: 0; }
    }

    .budget-amount {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      font-weight: 600;
      color: rgba(255,255,255,0.7);
      flex-shrink: 0;
      width: 5.5rem;
      text-align: right;
    }

    /* PIE CHART */
    .pie-container {
      width: 100%;
      height: 260px;
      margin: 1rem 0;
    }

    .custom-tooltip {
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 0.6rem 0.9rem;
      font-family: var(--font-display);
    }

    .tooltip-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
    }

    .tooltip-value {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      font-weight: 600;
      color: rgba(255,255,255,0.7);
    }

    /* FUN FACT */
    .fun-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .fun-card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 1.2rem 1rem;
      text-align: center;
      animation: funIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .fun-card:nth-child(1) { animation-delay: 0.1s; }
    .fun-card:nth-child(2) { animation-delay: 0.2s; }
    .fun-card:nth-child(3) { animation-delay: 0.3s; }
    .fun-card:nth-child(4) { animation-delay: 0.4s; }

    .fun-card-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .fun-card-value {
      font-family: var(--font-mono);
      font-size: 1.3rem;
      font-weight: 700;
      margin-bottom: 0.3rem;
    }
    .fun-card-label {
      font-size: 0.72rem;
      color: rgba(255,255,255,0.45);
      font-weight: 500;
      line-height: 1.3;
    }

    /* SHARE */
    .share-btns {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 2rem;
      width: 100%;
    }

    .share-btn {
      width: 100%;
      padding: 0.9rem;
      border: none;
      border-radius: 14px;
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .share-btn:hover { transform: translateY(-2px); }
    .share-btn:active { transform: translateY(0); }

    .share-btn-x {
      background: #fff;
      color: #000;
    }

    .share-btn-wa {
      background: #25D366;
      color: #fff;
    }

    .share-btn-reset {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7);
    }

    /* NAV */
    .nav-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      position: relative;
      z-index: 10;
    }

    .nav-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.06);
      color: #fff;
      font-size: 1.2rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      font-family: var(--font-display);
    }

    .nav-btn:hover { background: rgba(255,255,255,0.12); }
    .nav-btn:disabled { opacity: 0.2; cursor: default; }
    .nav-btn:disabled:hover { background: rgba(255,255,255,0.06); }

    .dots {
      display: flex;
      gap: 6px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      transition: all 0.3s;
    }

    .dot.active {
      background: #fff;
      width: 24px;
      border-radius: 4px;
    }

    /* WAVE DECO */
    .wave-deco {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 120px;
      overflow: hidden;
      pointer-events: none;
      opacity: 0.15;
    }

    .wave-deco svg {
      width: 100%;
      height: 100%;
    }

    /* RESPONSIVE */
    @media (max-width: 400px) {
      .form-row { grid-template-columns: 1fr; }
      .split-row { grid-template-columns: 1fr; }
      .fun-grid { grid-template-columns: 1fr; }
    }
  `;

  // ─── PIE CHART DATA ────────────────────────────────────────────
  const pieData = useMemo(() => {
    const items = [
      { name: "Einkommensteuer", value: result.einkommensteuer, color: "#818cf8" },
      { name: "Soli", value: result.soli, color: "#a78bfa" },
      { name: "Kirchensteuer", value: result.kirchensteuer, color: "#c084fc" },
      { name: "Rentenvers.", value: result.rentenversicherung, color: "#38bdf8" },
      { name: "Krankenvers.", value: result.krankenversicherung, color: "#2dd4bf" },
      { name: "Pflegevers.", value: result.pflegeversicherung, color: "#fbbf24" },
      { name: "Arbeitslosenvers.", value: result.arbeitslosenversicherung, color: "#fb923c" },
    ];
    return items.filter((i) => i.value > 0);
  }, [result]);

  // ─── TOP 3 ABGABEN ─────────────────────────────────────────────
  const top3 = useMemo(() => {
    const all = [
      { name: "Rentenversicherung", icon: "👴", value: result.rentenversicherung },
      { name: "Krankenversicherung", icon: "🏥", value: result.krankenversicherung },
      { name: "Einkommensteuer", icon: "🏛️", value: result.einkommensteuer },
      { name: "Pflegeversicherung", icon: "🤝", value: result.pflegeversicherung },
      { name: "Arbeitslosenvers.", icon: "📋", value: result.arbeitslosenversicherung },
      { name: "Solidaritätszuschlag", icon: "🇩🇪", value: result.soli },
      { name: "Kirchensteuer", icon: "⛪", value: result.kirchensteuer },
    ];
    return all.filter((a) => a.value > 0).sort((a, b) => b.value - a.value).slice(0, 3);
  }, [result]);

  // ─── FUN FACTS ──────────────────────────────────────────────────
  const funFacts = useMemo(() => {
    const renteProTag = (result.rentenversicherung / 365).toFixed(2);
    const bundeswehrTage = result.einkommensteuer > 0
      ? Math.round((result.einkommensteuer / BUNDESHAUSHALT.gesamt) * BUNDESHAUSHALT.kategorien[1].betrag / (BUNDESHAUSHALT.kategorien[1].betrag / 365))
      : 0;
    const nettoProMonat = Math.round(result.nettoJahreseinkommen / 12);
    const arbeitsBisUhr = result.abgabenquote > 0
      ? `${Math.floor((result.abgabenquote / 100) * 8)}h ${Math.round(((result.abgabenquote / 100) * 8 % 1) * 60)}min`
      : "0h";
    return [
      { icon: "👴", value: `${renteProTag} €`, label: "pro Tag für deine Rente" },
      { icon: "⏰", value: arbeitsBisUhr, label: "am Tag arbeitest du für den Staat" },
      { icon: "💵", value: fmt(nettoProMonat), label: "Netto pro Monat" },
      { icon: "📅", value: `${Math.round(result.abgabenquote * 3.65)} Tage`, label: "im Jahr arbeitest du für Abgaben" },
    ];
  }, [result]);

  // ─── CUSTOM TOOLTIP ────────────────────────────────────────────
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <div className="tooltip-label">{payload[0].name}</div>
          <div className="tooltip-value">{fmt(payload[0].value)}</div>
        </div>
      );
    }
    return null;
  };

  // ─── WAVE SVG ──────────────────────────────────────────────────
  const WaveDeco = () => (
    <div className="wave-deco">
      <svg viewBox="0 0 500 120" preserveAspectRatio="none">
        <path d="M0,40 C100,80 200,10 300,50 C400,90 450,20 500,60" fill="none" stroke="white" strokeWidth="1.5" />
        <path d="M0,70 C80,30 180,90 280,40 C380,0 440,80 500,30" fill="none" stroke="white" strokeWidth="1" />
      </svg>
    </div>
  );

  // ─── RENDER SLIDES ─────────────────────────────────────────────
  const renderSlide = () => {
    switch (slide) {
      case 0: // INTRO
        return (
          <div className="slide-content" key={animKey}>
            <WaveDeco />
            <div className="slide-emoji">💰</div>
            <div className="slide-title">Dein Steuer Wrapped 2026</div>
            <div className="slide-subtitle">Dein Brutto-Jahreseinkommen</div>
            <div className="big-number" style={{ background: "linear-gradient(135deg, #c7d2fe, #a78bfa, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              <AnimatedNumber value={form.brutto} prefix="" suffix=" €" />
            </div>
            <div className="big-number-label">Steuerklasse {form.steuerklasse} · {form.kinder} {form.kinder === 1 ? "Kind" : "Kinder"}</div>
          </div>
        );

      case 1: // GESAMTÜBERSICHT
        return (
          <div className="slide-content" key={animKey}>
            <div className="slide-emoji">📊</div>
            <div className="slide-title">Deine Abgaben auf einen Blick</div>
            <div className="slide-subtitle">So viel geht dieses Jahr an den Staat</div>
            <div className="big-number" style={{ color: "#f87171" }}>
              <AnimatedNumber value={result.gesamtAbgaben} prefix="" suffix=" €" />
            </div>
            <div className="big-number-label" style={{ marginBottom: "0.5rem" }}>
              Abgabenquote: {result.abgabenquote.toFixed(1)}%
            </div>
            <div className="split-row">
              <div className="split-card">
                <div className="split-card-icon">🏛️</div>
                <div className="split-card-value" style={{ color: "#818cf8" }}>
                  <AnimatedNumber value={result.gesamtSteuern} suffix=" €" />
                </div>
                <div className="split-card-label">Steuern</div>
                <div className="split-card-label" style={{ marginTop: "2px" }}>
                  {((result.gesamtSteuern / result.gesamtAbgaben) * 100).toFixed(0)}%
                </div>
              </div>
              <div className="split-card">
                <div className="split-card-icon">🛡️</div>
                <div className="split-card-value" style={{ color: "#38bdf8" }}>
                  <AnimatedNumber value={result.gesamtSozial} suffix=" €" />
                </div>
                <div className="split-card-label">Sozialabgaben</div>
                <div className="split-card-label" style={{ marginTop: "2px" }}>
                  {((result.gesamtSozial / result.gesamtAbgaben) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        );

      case 2: // TOP 3
        return (
          <div className="slide-content" key={animKey}>
            <div className="slide-emoji">🏆</div>
            <div className="slide-title">Deine Top 3 Abgaben</div>
            <div className="slide-subtitle">Hier fließt am meisten hin</div>
            <div className="podium">
              {top3.map((item, i) => (
                <div className="podium-item" key={item.name}>
                  <div className="podium-rank" style={{ color: ["#fbbf24", "#94a3b8", "#cd7f32"][i] }}>
                    {i + 1}
                  </div>
                  <div className="podium-icon">{item.icon}</div>
                  <div className="podium-info">
                    <div className="podium-name">{item.name}</div>
                    <div className="podium-amount" style={{ color: ["#fbbf24", "#e2e8f0", "#cd7f32"][i] }}>
                      {fmt(item.value)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 3: // PIE CHART
        return (
          <div className="slide-content" key={animKey}>
            <div className="slide-emoji">🍰</div>
            <div className="slide-title">Dein Abgaben-Mix</div>
            <div className="slide-subtitle">Alle Abgaben im Überblick</div>
            <div className="pie-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={105}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    animationBegin={100}
                    animationDuration={800}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", justifyContent: "center" }}>
              {pieData.map((entry) => (
                <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
                  {entry.name}
                </div>
              ))}
            </div>
          </div>
        );

      case 4: // BUNDESHAUSHALT
        return (
          <div className="slide-content" key={animKey}>
            <div className="slide-emoji">🇩🇪</div>
            <div className="slide-title">Wohin fließt dein Steuergeld?</div>
            <div className="slide-subtitle">Dein Anteil am Bundeshaushalt 2026</div>
            <div className="budget-list">
              {budgetShare.map((k) => (
                <div className="budget-item" key={k.name}>
                  <div className="budget-icon">{k.icon}</div>
                  <div className="budget-bar-container">
                    <div className="budget-name-row">
                      <span className="budget-name">{k.name}</span>
                      <span className="budget-pct">{k.prozent}%</span>
                    </div>
                    <div className="budget-bar">
                      <div
                        className="budget-bar-fill"
                        style={{
                          width: `${(k.prozent / 40) * 100}%`,
                          background: k.farbe,
                          animationDelay: "0.3s",
                        }}
                      />
                    </div>
                  </div>
                  <div className="budget-amount" style={{ color: k.farbe }}>
                    {k.deinAnteil >= 1 ? fmt(Math.round(k.deinAnteil)) : `${k.deinAnteil.toFixed(2)} €`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 5: // FUN FACTS
        return (
          <div className="slide-content" key={animKey}>
            <div className="slide-emoji">🤯</div>
            <div className="slide-title">Fun Facts</div>
            <div className="slide-subtitle">Deine Abgaben mal anders betrachtet</div>
            <div className="fun-grid">
              {funFacts.map((f, i) => (
                <div className="fun-card" key={i}>
                  <div className="fun-card-icon">{f.icon}</div>
                  <div className="fun-card-value">{f.value}</div>
                  <div className="fun-card-label">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 6: // SHARE
        return (
          <div className="slide-content" key={animKey}>
            <div className="slide-emoji">🎉</div>
            <div className="slide-title">Teile dein Wrapped!</div>
            <div className="slide-subtitle">Zeig deinen Freunden, was der Staat von dir bekommt</div>
            <div className="glass-card" style={{ marginTop: "1rem" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                {generateShareText(result)}
              </div>
            </div>
            <div className="share-btns">
              <button className="share-btn share-btn-x" onClick={() => shareOnX(generateShareText(result))}>
                𝕏 Auf X teilen
              </button>
              <button className="share-btn share-btn-wa" onClick={() => shareOnWhatsApp(generateShareText(result))}>
                💬 Auf WhatsApp teilen
              </button>
              <button
                className="share-btn share-btn-reset"
                onClick={() => { setView("input"); setSlide(0); }}
              >
                🔄 Neu berechnen
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ─── MAIN RENDER ────────────────────────────────────────────────
  return (
    <div className="sw-root">
      <style>{styles}</style>

      {view === "input" ? (
        <div className="input-page">
          <div className="hero-badge">Kostenlos · Anonym · Lokal</div>
          <h1 className="hero-title">
            Steuer<br />Wrapped 2026
          </h1>
          <p className="hero-sub">Dein Jahr in Steuern & Abgaben – Spotify-Style</p>

          <div className="form-card">
            <div className="form-group">
              <label className="form-label">Brutto-Jahreseinkommen</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="1000"
                value={form.brutto}
                onChange={(e) => setForm({ ...form, brutto: Math.max(0, Number(e.target.value)) })}
                placeholder="z.B. 50.000"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Steuerklasse</label>
                <select
                  className="form-select"
                  value={form.steuerklasse}
                  onChange={(e) => setForm({ ...form, steuerklasse: e.target.value })}
                >
                  {STEUERKLASSEN.map((sk) => (
                    <option key={sk.value} value={sk.value}>{sk.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Kinder</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="10"
                  value={form.kinder}
                  onChange={(e) => setForm({ ...form, kinder: Math.max(0, Math.min(10, Number(e.target.value))) })}
                />
              </div>
            </div>

            <div className="form-group">
              <div className="checkbox-row" onClick={() => setForm({ ...form, kirchensteuer: !form.kirchensteuer })}>
                <button
                  type="button"
                  className={`checkbox-toggle ${form.kirchensteuer ? "active" : ""}`}
                  aria-label="Kirchensteuer"
                />
                <span className="checkbox-label">Kirchensteuer zahlen</span>
              </div>
            </div>

            {form.kirchensteuer && (
              <div className="form-group">
                <label className="form-label">Bundesland</label>
                <select
                  className="form-select"
                  value={form.bundesland}
                  onChange={(e) => setForm({ ...form, bundesland: e.target.value })}
                >
                  {BUNDESLAENDER.map((bl) => (
                    <option key={bl.value} value={bl.value}>{bl.label}</option>
                  ))}
                </select>
              </div>
            )}

            <button className="submit-btn" onClick={handleSubmit}>
              Mein Wrapped anzeigen 🎉
            </button>
          </div>

          <p className="disclaimer">
            Alle Berechnungen erfolgen lokal in deinem Browser. Es werden keine Daten gespeichert oder übertragen. Die Ergebnisse sind Näherungswerte und ersetzen keine Steuerberatung.
          </p>
        </div>
      ) : (
        <div className="results-page" style={{ background: SLIDE_GRADIENTS[slide] }}>
          <div className="slide-container">
            {renderSlide()}
          </div>
          <div className="nav-bar">
            <button
              className="nav-btn"
              disabled={slide === 0}
              onClick={() => goToSlide(-1)}
              aria-label="Zurück"
            >
              ←
            </button>
            <div className="dots">
              {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
                <div key={i} className={`dot ${i === slide ? "active" : ""}`} />
              ))}
            </div>
            <button
              className="nav-btn"
              disabled={slide === TOTAL_SLIDES - 1}
              onClick={() => goToSlide(1)}
              aria-label="Weiter"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
