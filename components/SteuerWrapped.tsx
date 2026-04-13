"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

/* ═══════════════════════════════════════════════════════════════════
   INTERFACES
   ═══════════════════════════════════════════════════════════════════ */

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

interface Unterkategorie {
  name: string;
  betrag: number;
  icon: string;
}

interface BudgetKategorie {
  name: string;
  betrag: number;
  prozent: number;
  icon: string;
  farbe: string;
  expandable: boolean;
  unterkategorien?: Unterkategorie[];
}

interface BudgetKategorieMitAnteil extends BudgetKategorie {
  deinAnteil: number;
  unterkategorienMitAnteil?: UnterkategorieMitAnteil[];
}

interface UnterkategorieMitAnteil extends Unterkategorie {
  deinAnteil: number;
}

interface PieDataItem {
  name: string;
  value: number;
  color: string;
}

interface Top3Item {
  name: string;
  icon: string;
  value: number;
}

interface FunFact {
  icon: string;
  value: string;
  label: string;
}

interface SteuerklasseOption {
  value: string;
  label: string;
}

interface BundeslandOption {
  value: string;
  label: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/* ═══════════════════════════════════════════════════════════════════
   TAX CALCULATOR
   ═══════════════════════════════════════════════════════════════════ */

const SOCIAL_INSURANCE = {
  rente: { rate: 0.093, bbg: 96600 },
  kranken: { rate: 0.09, bbg: 66150 },
  pflege: { rate: 0.02025, bbg: 66150, kinderloseZuschlag: 0.006 },
  arbeit: { rate: 0.013, bbg: 96600 },
} as const;

function calculateIncomeTax(zvE: number): number {
  if (zvE <= 0) return 0;
  if (zvE <= 12348) return 0;

  if (zvE <= 17005) {
    const y: number = (zvE - 12348) / 10000;
    return Math.round((922.98 * y + 1400) * y);
  }

  if (zvE <= 66760) {
    const z: number = (zvE - 17005) / 10000;
    const zone2Full: number = (922.98 * 0.4657 + 1400) * 0.4657;
    return Math.round((181.19 * z + 2397) * z + zone2Full);
  }

  if (zvE <= 277825) {
    return Math.round(0.42 * zvE - 10777.26);
  }

  return Math.round(0.45 * zvE - 19112.01);
}

function calculateTax(input: TaxInput): TaxResult {
  const { brutto, steuerklasse, kinder, kirchensteuer, bundesland } = input;

  let zvE: number = brutto;
  if (steuerklasse === "II") zvE -= 4260;

  let est: number;
  if (steuerklasse === "III") {
    est = calculateIncomeTax(zvE / 2) * 2;
  } else if (steuerklasse === "V") {
    est = calculateIncomeTax(zvE + 12348);
  } else {
    est = calculateIncomeTax(zvE);
  }

  const soli: number = est > 18130 ? Math.round(est * 0.055) : 0;

  const kirchenRate: number = kirchensteuer
    ? bundesland === "BY" || bundesland === "BW"
      ? 0.08
      : 0.09
    : 0;
  const kirche: number = Math.round(est * kirchenRate);

  const rentenBasis: number = Math.min(brutto, SOCIAL_INSURANCE.rente.bbg);
  const rentenversicherung: number = Math.round(
    rentenBasis * SOCIAL_INSURANCE.rente.rate
  );

  const krankenBasis: number = Math.min(brutto, SOCIAL_INSURANCE.kranken.bbg);
  const krankenversicherung: number = Math.round(
    krankenBasis * SOCIAL_INSURANCE.kranken.rate
  );

  const pflegeBasis: number = Math.min(brutto, SOCIAL_INSURANCE.pflege.bbg);
  const pflegeRate: number =
    kinder === 0
      ? SOCIAL_INSURANCE.pflege.rate + SOCIAL_INSURANCE.pflege.kinderloseZuschlag
      : SOCIAL_INSURANCE.pflege.rate - Math.min(kinder - 1, 4) * 0.0025;
  const pflegeversicherung: number = Math.round(
    pflegeBasis * Math.max(pflegeRate, 0)
  );

  const arbeitBasis: number = Math.min(brutto, SOCIAL_INSURANCE.arbeit.bbg);
  const arbeitslosenversicherung: number = Math.round(
    arbeitBasis * SOCIAL_INSURANCE.arbeit.rate
  );

  const steuern: number = est + soli + kirche;
  const sozial: number =
    rentenversicherung +
    krankenversicherung +
    pflegeversicherung +
    arbeitslosenversicherung;
  const gesamt: number = steuern + sozial;

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
    abgabenquote: brutto > 0 ? (gesamt / brutto) * 100 : 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   BUDGET DATA (Bundeshaushalt 2026)
   ═══════════════════════════════════════════════════════════════════ */

const BUNDESHAUSHALT_GESAMT: number = 524_540_000_000;

const BUNDESHAUSHALT_KATEGORIEN: BudgetKategorie[] = [
  {
    name: "Arbeit & Soziales",
    betrag: 197_340_000_000,
    prozent: 37.6,
    icon: "👥",
    farbe: "#3b82f6",
    expandable: true,
    unterkategorien: [
      { name: "Zuschuss Rentenversicherung", betrag: 138_000_000_000, icon: "👴" },
      { name: "Bürgergeld / Grundsicherung", betrag: 28_100_000_000, icon: "🏘️" },
      { name: "Arbeitsförderung", betrag: 31_240_000_000, icon: "💼" },
    ],
  },
  {
    name: "Verteidigung",
    betrag: 82_690_000_000,
    prozent: 15.8,
    icon: "🛡️",
    farbe: "#ef4444",
    expandable: true,
    unterkategorien: [
      { name: "Personal Bundeswehr", betrag: 25_000_000_000, icon: "👨‍✈️" },
      { name: "Militärische Beschaffung", betrag: 28_500_000_000, icon: "🚁" },
      { name: "Wehrtechnik & Forschung", betrag: 12_400_000_000, icon: "🔬" },
      { name: "Betrieb & Infrastruktur", betrag: 14_800_000_000, icon: "🏗️" },
      { name: "NATO & Internationale Verpfl.", betrag: 1_990_000_000, icon: "🌍" },
    ],
  },
  {
    name: "Allg. Finanzverwaltung",
    betrag: 52_400_000_000,
    prozent: 10.0,
    icon: "🏛️",
    farbe: "#f59e0b",
    expandable: false,
  },
  {
    name: "Zins & Schulden",
    betrag: 30_180_000_000,
    prozent: 5.8,
    icon: "💰",
    farbe: "#8b5cf6",
    expandable: false,
  },
  {
    name: "Verkehr & Infrastruktur",
    betrag: 27_900_000_000,
    prozent: 5.3,
    icon: "🚆",
    farbe: "#10b981",
    expandable: true,
    unterkategorien: [
      { name: "Schienennetz (Bahn)", betrag: 14_200_000_000, icon: "🚄" },
      { name: "Bundesautobahnen", betrag: 7_800_000_000, icon: "🛣️" },
      { name: "Wasserstraßen & Häfen", betrag: 2_100_000_000, icon: "⚓" },
      { name: "Digitale Infrastruktur", betrag: 3_800_000_000, icon: "📡" },
    ],
  },
  {
    name: "Bildung & Forschung",
    betrag: 22_400_000_000,
    prozent: 4.3,
    icon: "🎓",
    farbe: "#ec4899",
    expandable: true,
    unterkategorien: [
      { name: "Hochschulen & Universitäten", betrag: 8_900_000_000, icon: "🏫" },
      { name: "Forschungsförderung", betrag: 7_200_000_000, icon: "🔬" },
      { name: "BAföG", betrag: 3_100_000_000, icon: "📚" },
      { name: "Digitalpakt Schule", betrag: 2_250_000_000, icon: "💻" },
      { name: "Berufsbildung", betrag: 950_000_000, icon: "🔧" },
    ],
  },
  {
    name: "Gesundheit",
    betrag: 15_700_000_000,
    prozent: 3.0,
    icon: "🏥",
    farbe: "#06b6d4",
    expandable: false,
  },
  {
    name: "Sonstiges",
    betrag: 93_930_000_000,
    prozent: 17.9,
    icon: "📊",
    farbe: "#64748b",
    expandable: false,
  },
];

const TOTAL_EINKOMMENSTEUER_REVENUE: number = 190_000_000_000;

function calculateBudgetShare(
  einkommensteuer: number
): BudgetKategorieMitAnteil[] {
  const anteil: number = einkommensteuer / TOTAL_EINKOMMENSTEUER_REVENUE;

  return BUNDESHAUSHALT_KATEGORIEN.map(
    (k: BudgetKategorie): BudgetKategorieMitAnteil => {
      const deinAnteil: number =
        Math.round(anteil * k.betrag * 100) / 100;

      const unterkategorienMitAnteil: UnterkategorieMitAnteil[] | undefined =
        k.unterkategorien?.map(
          (sub: Unterkategorie): UnterkategorieMitAnteil => ({
            ...sub,
            deinAnteil: Math.round(anteil * sub.betrag * 100) / 100,
          })
        );

      return {
        ...k,
        deinAnteil,
        unterkategorienMitAnteil,
      };
    }
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SHARE UTILS
   ═══════════════════════════════════════════════════════════════════ */

function fmt(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDecimal(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function generateShareText(r: TaxResult): string {
  return `Mein #SteuerWrapped 2026:\n💰 ${fmt(r.gesamtAbgaben)} Abgaben (${r.abgabenquote.toFixed(1)}%)\n🏛️ ${fmt(r.einkommensteuer)} Einkommensteuer\n👴 ${fmt(r.rentenversicherung)} Rente\n🏥 ${fmt(r.krankenversicherung)} Krankenversicherung\n\nBerechne deins: steuerwrapped.de`;
}

function shareOnX(text: string): void {
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    "_blank"
  );
}

function shareOnWhatsApp(text: string): void {
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    "_blank"
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED NUMBER COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

function AnimatedNumber({
  value,
  duration = 1200,
  prefix = "",
  suffix = "",
  className = "",
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState<number>(0);

  useEffect(() => {
    const startTime: number = Date.now();
    let raf: number;

    const tick = (): void => {
      const elapsed: number = Date.now() - startTime;
      const progress: number = Math.min(elapsed / duration, 1);
      const eased: number = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {new Intl.NumberFormat("de-DE").format(display)}
      {suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const STEUERKLASSEN: SteuerklasseOption[] = [
  { value: "I", label: "I – Ledig / Geschieden" },
  { value: "II", label: "II – Alleinerziehend" },
  { value: "III", label: "III – Verheiratet (Höherverdiener)" },
  { value: "IV", label: "IV – Verheiratet (Gleichverdiener)" },
  { value: "V", label: "V – Verheiratet (Geringverdiener)" },
  { value: "VI", label: "VI – Zweitjob" },
];

const BUNDESLAENDER: BundeslandOption[] = [
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

const SLIDE_GRADIENTS: string[] = [
  "linear-gradient(135deg, #0c1445 0%, #1e1b4b 40%, #312e81 100%)",
  "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0e4a6e 100%)",
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #21262d 100%)",
  "linear-gradient(135deg, #0c0c1d 0%, #1b1140 50%, #2d1b69 100%)",
  "linear-gradient(135deg, #0a192f 0%, #112240 50%, #1d3461 100%)",
  "linear-gradient(135deg, #1a0a2e 0%, #2d1854 50%, #4a1942 100%)",
];

const TOTAL_SLIDES: number = 7;

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function SteuerWrapped() {
  const [view, setView] = useState<"input" | "results">("input");
  const [slide, setSlide] = useState<number>(0);
  const [animKey, setAnimKey] = useState<number>(0);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const [form, setForm] = useState<TaxInput>({
    brutto: 50000,
    steuerklasse: "I",
    kinder: 0,
    kirchensteuer: false,
    bundesland: "NW",
  });

  const result: TaxResult = useMemo(
    () => calculateTax(form),
    [form]
  );

  const budgetShare: BudgetKategorieMitAnteil[] = useMemo(
    () => calculateBudgetShare(result.einkommensteuer),
    [result.einkommensteuer]
  );

  const goToSlide = useCallback((dir: number): void => {
    setSlide((s: number) => {
      const next: number = s + dir;
      if (next < 0 || next >= TOTAL_SLIDES) return s;
      return next;
    });
    setAnimKey((k: number) => k + 1);
    setExpandedCategory(null);
  }, []);

  const handleSubmit = (): void => {
    setSlide(0);
    setAnimKey(0);
    setExpandedCategory(null);
    setView("results");
  };

  /* ── PIE DATA ────────────────────────────────────────────────── */

  const pieData: PieDataItem[] = useMemo(() => {
    const items: PieDataItem[] = [
      { name: "Einkommensteuer", value: result.einkommensteuer, color: "#818cf8" },
      { name: "Soli", value: result.soli, color: "#a78bfa" },
      { name: "Kirchensteuer", value: result.kirchensteuer, color: "#c084fc" },
      { name: "Rentenvers.", value: result.rentenversicherung, color: "#38bdf8" },
      { name: "Krankenvers.", value: result.krankenversicherung, color: "#2dd4bf" },
      { name: "Pflegevers.", value: result.pflegeversicherung, color: "#fbbf24" },
      { name: "Arbeitslosenvers.", value: result.arbeitslosenversicherung, color: "#fb923c" },
    ];
    return items.filter((i: PieDataItem) => i.value > 0);
  }, [result]);

  /* ── TOP 3 ───────────────────────────────────────────────────── */

  const top3: Top3Item[] = useMemo(() => {
    const all: Top3Item[] = [
      { name: "Rentenversicherung", icon: "👴", value: result.rentenversicherung },
      { name: "Krankenversicherung", icon: "🏥", value: result.krankenversicherung },
      { name: "Einkommensteuer", icon: "🏛️", value: result.einkommensteuer },
      { name: "Pflegeversicherung", icon: "🤝", value: result.pflegeversicherung },
      { name: "Arbeitslosenvers.", icon: "📋", value: result.arbeitslosenversicherung },
      { name: "Solidaritätszuschlag", icon: "🇩🇪", value: result.soli },
      { name: "Kirchensteuer", icon: "⛪", value: result.kirchensteuer },
    ];
    return all
      .filter((a: Top3Item) => a.value > 0)
      .sort((a: Top3Item, b: Top3Item) => b.value - a.value)
      .slice(0, 3);
  }, [result]);

  /* ── FUN FACTS ───────────────────────────────────────────────── */

  const funFacts: FunFact[] = useMemo(() => {
    const renteProTag: string = (result.rentenversicherung / 365).toFixed(2);
    const nettoProMonat: number = Math.round(result.nettoJahreseinkommen / 12);
    const stunden: number = Math.floor((result.abgabenquote / 100) * 8);
    const minuten: number = Math.round(
      (((result.abgabenquote / 100) * 8) % 1) * 60
    );
    const arbeitsBisUhr: string =
      result.abgabenquote > 0 ? `${stunden}h ${minuten}min` : "0h";
    const tageImJahr: number = Math.round(result.abgabenquote * 3.65);

    return [
      { icon: "👴", value: `${renteProTag} €`, label: "pro Tag für deine Rente" },
      { icon: "⏰", value: arbeitsBisUhr, label: "am Tag arbeitest du für den Staat" },
      { icon: "💵", value: fmt(nettoProMonat), label: "Netto pro Monat" },
      { icon: "📅", value: `${tageImJahr} Tage`, label: "im Jahr für Abgaben" },
    ];
  }, [result]);

  /* ── TOOLTIP ─────────────────────────────────────────────────── */

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length > 0) {
      return (
        <div
          style={{
            background: "rgba(15,23,42,0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            padding: "0.6rem 0.9rem",
            fontFamily: "var(--font-display)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#fff" }}>
            {payload[0].name}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {fmt(payload[0].value)}
          </div>
        </div>
      );
    }
    return null;
  };

  /* ── WAVE DECORATION ─────────────────────────────────────────── */

  const WaveDeco = () => (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: 120,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: 0.15,
      }}
    >
      <svg viewBox="0 0 500 120" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <path
          d="M0,40 C100,80 200,10 300,50 C400,90 450,20 500,60"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        />
        <path
          d="M0,70 C80,30 180,90 280,40 C380,0 440,80 500,30"
          fill="none"
          stroke="white"
          strokeWidth="1"
        />
      </svg>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════
     SLIDES
     ═══════════════════════════════════════════════════════════════ */

  const renderSlide = (): React.ReactNode => {
    const contentStyle: React.CSSProperties = {
      width: "100%",
      maxWidth: 480,
      animation: "slideIn 0.5s cubic-bezier(0.16,1,0.3,1)",
    };

    switch (slide) {
      /* ── SLIDE 0: INTRO ────────────────────────────────────── */
      case 0:
        return (
          <div style={contentStyle} key={animKey}>
            <WaveDeco />
            <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>
              💰
            </div>
            <h2
              style={{
                fontSize: "clamp(1.5rem,5vw,2.2rem)",
                fontWeight: 800,
                textAlign: "center",
                marginBottom: "0.5rem",
                lineHeight: 1.15,
              }}
            >
              Dein Steuer Wrapped 2026
            </h2>
            <p
              style={{
                fontSize: "clamp(0.9rem,2.5vw,1.05rem)",
                textAlign: "center",
                color: "rgba(255,255,255,0.5)",
                marginBottom: "2rem",
              }}
            >
              Dein Brutto-Jahreseinkommen
            </p>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(2.5rem,10vw,4rem)",
                fontWeight: 700,
                textAlign: "center",
                margin: "1rem 0",
                lineHeight: 1,
                background:
                  "linear-gradient(135deg, #c7d2fe, #a78bfa, #7c3aed)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              <AnimatedNumber value={form.brutto} suffix=" €" />
            </div>
            <p
              style={{
                fontSize: "clamp(1rem,3vw,1.3rem)",
                textAlign: "center",
                color: "rgba(255,255,255,0.6)",
                fontWeight: 500,
              }}
            >
              Steuerklasse {form.steuerklasse} · {form.kinder}{" "}
              {form.kinder === 1 ? "Kind" : "Kinder"}
            </p>
          </div>
        );

      /* ── SLIDE 1: OVERVIEW ─────────────────────────────────── */
      case 1:
        return (
          <div style={contentStyle} key={animKey}>
            <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>📊</div>
            <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>
              Deine Abgaben auf einen Blick
            </h2>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>
              So viel geht dieses Jahr an den Staat
            </p>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "clamp(2.5rem,10vw,4rem)",
                fontWeight: 700,
                textAlign: "center",
                margin: "1rem 0",
                lineHeight: 1,
                color: "#f87171",
              }}
            >
              <AnimatedNumber value={result.gesamtAbgaben} suffix=" €" />
            </div>
            <p style={{ fontSize: "clamp(1rem,3vw,1.3rem)", textAlign: "center", color: "rgba(255,255,255,0.6)", fontWeight: 500, marginBottom: "0.5rem" }}>
              Abgabenquote: {result.abgabenquote.toFixed(1)}%
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1.5rem" }}>
              <GlassCard>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", textAlign: "center" }}>🏛️</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.2rem", textAlign: "center", color: "#818cf8" }}>
                  <AnimatedNumber value={result.gesamtSteuern} suffix=" €" />
                </div>
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center" }}>
                  Steuern · {result.gesamtAbgaben > 0 ? ((result.gesamtSteuern / result.gesamtAbgaben) * 100).toFixed(0) : 0}%
                </div>
              </GlassCard>
              <GlassCard>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", textAlign: "center" }}>🛡️</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.2rem", textAlign: "center", color: "#38bdf8" }}>
                  <AnimatedNumber value={result.gesamtSozial} suffix=" €" />
                </div>
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center" }}>
                  Sozialabgaben · {result.gesamtAbgaben > 0 ? ((result.gesamtSozial / result.gesamtAbgaben) * 100).toFixed(0) : 0}%
                </div>
              </GlassCard>
            </div>
          </div>
        );

      /* ── SLIDE 2: TOP 3 ────────────────────────────────────── */
      case 2:
        return (
          <div style={contentStyle} key={animKey}>
            <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🏆</div>
            <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>
              Deine Top 3 Abgaben
            </h2>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>
              Hier fließt am meisten hin
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1.5rem" }}>
              {top3.map((item: Top3Item, i: number) => {
                const colors: string[] = ["#fbbf24", "#94a3b8", "#cd7f32"];
                return (
                  <div
                    key={item.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 16,
                      padding: "1rem 1.25rem",
                      animation: `podiumIn 0.5s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.15}s both`,
                    }}
                  >
                    <div style={{ fontSize: "1.6rem", fontWeight: 900, width: "2.5rem", textAlign: "center", color: colors[i] }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: "1.8rem" }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                        {item.name}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.15rem", fontWeight: 700, color: colors[i] }}>
                        {fmt(item.value)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      /* ── SLIDE 3: PIE CHART ────────────────────────────────── */
      case 3:
        return (
          <div style={contentStyle} key={animKey}>
            <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🍰</div>
            <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>
              Dein Abgaben-Mix
            </h2>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>
              Alle Abgaben im Überblick
            </p>
            <div style={{ width: "100%", height: 260, margin: "1rem 0" }}>
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
                    {pieData.map((entry: PieDataItem, i: number) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", justifyContent: "center" }}>
              {pieData.map((entry: PieDataItem) => (
                <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
                  {entry.name}
                </div>
              ))}
            </div>
          </div>
        );

      /* ── SLIDE 4: BUNDESHAUSHALT (EXPANDABLE) ──────────────── */
      case 4:
        return (
          <div style={contentStyle} key={animKey}>
            <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🇩🇪</div>
            <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>
              Wohin fließt dein Steuergeld?
            </h2>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "1.25rem" }}>
              Tippe auf ▼ für Details
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {budgetShare.map((kat: BudgetKategorieMitAnteil) => {
                const isExpanded: boolean = expandedCategory === kat.name;
                return (
                  <div key={kat.name}>
                    {/* Main category row */}
                    <div
                      onClick={() => {
                        if (kat.expandable) {
                          setExpandedCategory(isExpanded ? null : kat.name);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        background: isExpanded
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(255,255,255,0.05)",
                        border: `1px solid ${isExpanded ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: isExpanded ? "14px 14px 0 0" : 14,
                        padding: "0.75rem 0.85rem",
                        cursor: kat.expandable ? "pointer" : "default",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontSize: "1.15rem", flexShrink: 0 }}>{kat.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {kat.name}
                          </span>
                          <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 500, flexShrink: 0, marginLeft: "0.5rem" }}>
                            {kat.prozent}%
                          </span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 3,
                              width: `${(kat.prozent / 40) * 100}%`,
                              background: kat.farbe,
                              transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                            }}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: kat.farbe,
                          flexShrink: 0,
                          width: "5rem",
                          textAlign: "right",
                        }}
                      >
                        {kat.deinAnteil >= 1
                          ? fmt(Math.round(kat.deinAnteil))
                          : fmtDecimal(kat.deinAnteil)}
                      </div>
                      {kat.expandable && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "rgba(255,255,255,0.4)",
                            flexShrink: 0,
                            transition: "transform 0.25s",
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                        >
                          ▼
                        </div>
                      )}
                    </div>

                    {/* Expandable subcategories */}
                    {kat.expandable && (
                      <div
                        style={{
                          overflow: "hidden",
                          maxHeight: isExpanded ? 600 : 0,
                          opacity: isExpanded ? 1 : 0,
                          transition: "max-height 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease",
                          background: "rgba(255,255,255,0.03)",
                          border: isExpanded ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                          borderTop: "none",
                          borderRadius: "0 0 14px 14px",
                        }}
                      >
                        {kat.unterkategorienMitAnteil?.map(
                          (sub: UnterkategorieMitAnteil, idx: number) => (
                            <div
                              key={sub.name}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.55rem 0.85rem 0.55rem 2.5rem",
                                borderTop:
                                  idx > 0
                                    ? "1px solid rgba(255,255,255,0.05)"
                                    : "none",
                              }}
                            >
                              <div style={{ fontSize: "0.9rem", flexShrink: 0 }}>
                                {sub.icon}
                              </div>
                              <div
                                style={{
                                  flex: 1,
                                  fontSize: "0.72rem",
                                  fontWeight: 500,
                                  color: "rgba(255,255,255,0.65)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {sub.name}
                              </div>
                              <div
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: "0.72rem",
                                  fontWeight: 600,
                                  color: kat.farbe,
                                  flexShrink: 0,
                                  opacity: 0.8,
                                }}
                              >
                                {sub.deinAnteil >= 1
                                  ? fmt(Math.round(sub.deinAnteil))
                                  : fmtDecimal(sub.deinAnteil)}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );

      /* ── SLIDE 5: FUN FACTS ────────────────────────────────── */
      case 5:
        return (
          <div style={contentStyle} key={animKey}>
            <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🤯</div>
            <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>
              Fun Facts
            </h2>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>
              Deine Abgaben mal anders betrachtet
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1.5rem" }}>
              {funFacts.map((f: FunFact, i: number) => (
                <GlassCard key={i}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", textAlign: "center" }}>{f.icon}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.3rem", textAlign: "center" }}>
                    {f.value}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.45)", fontWeight: 500, lineHeight: 1.3, textAlign: "center" }}>
                    {f.label}
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        );

      /* ── SLIDE 6: SHARE ────────────────────────────────────── */
      case 6:
        return (
          <div style={contentStyle} key={animKey}>
            <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🎉</div>
            <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>
              Teile dein Wrapped!
            </h2>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>
              Zeig deinen Freunden, was der Staat von dir bekommt
            </p>
            <GlassCard>
              <pre
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.78rem",
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {generateShareText(result)}
              </pre>
            </GlassCard>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "2rem", width: "100%" }}>
              <ShareButton
                label="𝕏  Auf X teilen"
                bg="#fff"
                color="#000"
                onClick={() => shareOnX(generateShareText(result))}
              />
              <ShareButton
                label="💬  Auf WhatsApp teilen"
                bg="#25D366"
                color="#fff"
                onClick={() => shareOnWhatsApp(generateShareText(result))}
              />
              <ShareButton
                label="🔄  Neu berechnen"
                bg="rgba(255,255,255,0.08)"
                color="rgba(255,255,255,0.7)"
                border="1px solid rgba(255,255,255,0.15)"
                onClick={() => {
                  setView("input");
                  setSlide(0);
                }}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div style={{ fontFamily: "var(--font-display)", minHeight: "100vh", color: "#fff" }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes podiumIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes drift {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(2%, -1%) rotate(1deg); }
          66% { transform: translate(-1%, 2%) rotate(-1deg); }
        }
      `}</style>

      {view === "input" ? (
        /* ── INPUT PAGE ──────────────────────────────────────── */
        <div
          style={{
            minHeight: "100vh",
            background:
              "linear-gradient(135deg, #0c1445 0%, #1e1b4b 30%, #312e81 60%, #4c1d95 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "2rem 1rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow */}
          <div
            style={{
              position: "absolute",
              top: "-50%",
              left: "-50%",
              width: "200%",
              height: "200%",
              background:
                "radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(168,85,247,0.1) 0%, transparent 50%)",
              animation: "drift 20s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />

          {/* Badge */}
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 100,
              padding: "0.4rem 1.2rem",
              fontSize: "0.8rem",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              color: "rgba(255,255,255,0.7)",
              marginBottom: "1.5rem",
              position: "relative" as const,
              zIndex: 1,
            }}
          >
            Kostenlos · Anonym · Lokal
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: "clamp(2.5rem,8vw,4.5rem)",
              fontWeight: 900,
              textAlign: "center",
              lineHeight: 1.05,
              marginBottom: "0.75rem",
              position: "relative" as const,
              zIndex: 1,
              background:
                "linear-gradient(135deg, #fff 0%, #c7d2fe 50%, #a78bfa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Steuer
            <br />
            Wrapped 2026
          </h1>

          <p
            style={{
              fontSize: "clamp(0.95rem,2.5vw,1.2rem)",
              fontWeight: 400,
              textAlign: "center",
              color: "rgba(255,255,255,0.55)",
              marginBottom: "2.5rem",
              position: "relative" as const,
              zIndex: 1,
              maxWidth: 400,
            }}
          >
            Dein Jahr in Steuern & Abgaben – Spotify-Style
          </p>

          {/* Form */}
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 24,
              padding: "2rem",
              width: "100%",
              maxWidth: 440,
              position: "relative" as const,
              zIndex: 1,
            }}
          >
            <FormGroup label="Brutto-Jahreseinkommen">
              <input
                type="number"
                min={0}
                step={1000}
                value={form.brutto}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, brutto: Math.max(0, Number(e.target.value)) })
                }
                placeholder="z.B. 50.000"
                style={inputStyle}
              />
            </FormGroup>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <FormGroup label="Steuerklasse">
                <select
                  value={form.steuerklasse}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setForm({ ...form, steuerklasse: e.target.value })
                  }
                  style={inputStyle}
                >
                  {STEUERKLASSEN.map((sk: SteuerklasseOption) => (
                    <option key={sk.value} value={sk.value} style={{ background: "#1e1b4b", color: "#fff" }}>
                      {sk.label}
                    </option>
                  ))}
                </select>
              </FormGroup>

              <FormGroup label="Kinder">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={form.kinder}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({
                      ...form,
                      kinder: Math.max(0, Math.min(10, Number(e.target.value))),
                    })
                  }
                  style={inputStyle}
                />
              </FormGroup>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  cursor: "pointer",
                }}
                onClick={() => setForm({ ...form, kirchensteuer: !form.kirchensteuer })}
              >
                <button
                  type="button"
                  aria-label="Kirchensteuer"
                  style={{
                    width: 44,
                    height: 24,
                    background: form.kirchensteuer
                      ? "#8b5cf6"
                      : "rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    position: "relative" as const,
                    cursor: "pointer",
                    transition: "background 0.2s",
                    flexShrink: 0,
                    border: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 2,
                      width: 20,
                      height: 20,
                      background: "#fff",
                      borderRadius: "50%",
                      transition: "transform 0.2s",
                      transform: form.kirchensteuer
                        ? "translateX(20px)"
                        : "translateX(0)",
                      display: "block",
                    }}
                  />
                </button>
                <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
                  Kirchensteuer zahlen
                </span>
              </div>
            </div>

            {form.kirchensteuer && (
              <FormGroup label="Bundesland">
                <select
                  value={form.bundesland}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setForm({ ...form, bundesland: e.target.value })
                  }
                  style={inputStyle}
                >
                  {BUNDESLAENDER.map((bl: BundeslandOption) => (
                    <option key={bl.value} value={bl.value} style={{ background: "#1e1b4b", color: "#fff" }}>
                      {bl.label}
                    </option>
                  ))}
                </select>
              </FormGroup>
            )}

            <button
              onClick={handleSubmit}
              style={{
                width: "100%",
                padding: "1rem",
                background:
                  "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%)",
                border: "none",
                borderRadius: 14,
                color: "#fff",
                fontFamily: "var(--font-display)",
                fontSize: "1.1rem",
                fontWeight: 700,
                cursor: "pointer",
                marginTop: "0.5rem",
              }}
            >
              Mein Wrapped anzeigen 🎉
            </button>
          </div>

          <p
            style={{
              textAlign: "center",
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.3)",
              marginTop: "1.5rem",
              position: "relative" as const,
              zIndex: 1,
              maxWidth: 400,
            }}
          >
            Alle Berechnungen erfolgen lokal in deinem Browser. Es werden keine
            Daten gespeichert oder übertragen. Die Ergebnisse sind
            Näherungswerte und ersetzen keine Steuerberatung.
          </p>
        </div>
      ) : (
        /* ── RESULTS PAGE ────────────────────────────────────── */
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            transition: "background 0.6s ease",
            background: SLIDE_GRADIENTS[slide] || SLIDE_GRADIENTS[0],
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem 1.5rem",
              minHeight: "calc(100vh - 80px)",
              position: "relative",
            }}
          >
            {renderSlide()}
          </div>

          {/* Navigation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem 1.5rem",
              position: "relative",
              zIndex: 10,
            }}
          >
            <NavButton
              direction="prev"
              disabled={slide === 0}
              onClick={() => goToSlide(-1)}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: TOTAL_SLIDES }).map((_: unknown, i: number) => (
                <div
                  key={i}
                  style={{
                    width: i === slide ? 24 : 8,
                    height: 8,
                    borderRadius: i === slide ? 4 : "50%",
                    background:
                      i === slide
                        ? "#fff"
                        : "rgba(255,255,255,0.2)",
                    transition: "all 0.3s",
                  }}
                />
              ))}
            </div>
            <NavButton
              direction="next"
              disabled={slide === TOTAL_SLIDES - 1}
              onClick={() => goToSlide(1)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.85rem 1rem",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "#fff",
  fontFamily: "var(--font-display)",
  fontSize: "1rem",
  fontWeight: 500,
  outline: "none",
  WebkitAppearance: "none" as const,
};

function FormGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.8rem",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase" as const,
          color: "rgba(255,255,255,0.5)",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        padding: "1.25rem",
      }}
    >
      {children}
    </div>
  );
}

function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "prev" ? "Zurück" : "Weiter"}
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)",
        color: "#fff",
        fontSize: "1.2rem",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        opacity: disabled ? 0.2 : 1,
        transition: "all 0.2s",
      }}
    >
      {direction === "prev" ? "←" : "→"}
    </button>
  );
}

function ShareButton({
  label,
  bg,
  color,
  border,
  onClick,
}: {
  label: string;
  bg: string;
  color: string;
  border?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "0.9rem",
        border: border || "none",
        borderRadius: 14,
        fontFamily: "var(--font-display)",
        fontSize: "1rem",
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        background: bg,
        color,
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );
}
