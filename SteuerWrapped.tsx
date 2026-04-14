"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  beschreibung: string;
}

interface BudgetKategorie {
  name: string;
  betrag: number;
  prozent: number;
  icon: string;
  farbe: string;
  unterkategorien: Unterkategorie[];
}

interface BudgetKategorieMitAnteil extends BudgetKategorie {
  deinAnteil: number;
  unterkategorienMitAnteil: UnterkategorieMitAnteil[];
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
}

interface DescriptionModalData {
  name: string;
  icon: string;
  beschreibung: string;
  betrag: string;
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
    ? bundesland === "BY" || bundesland === "BW" ? 0.08 : 0.09
    : 0;
  const kirche: number = Math.round(est * kirchenRate);

  const rv: number = Math.round(Math.min(brutto, SOCIAL_INSURANCE.rente.bbg) * SOCIAL_INSURANCE.rente.rate);
  const kv: number = Math.round(Math.min(brutto, SOCIAL_INSURANCE.kranken.bbg) * SOCIAL_INSURANCE.kranken.rate);
  const pflegeRate: number = kinder === 0
    ? SOCIAL_INSURANCE.pflege.rate + SOCIAL_INSURANCE.pflege.kinderloseZuschlag
    : SOCIAL_INSURANCE.pflege.rate - Math.min(kinder - 1, 4) * 0.0025;
  const pv: number = Math.round(Math.min(brutto, SOCIAL_INSURANCE.pflege.bbg) * Math.max(pflegeRate, 0));
  const av: number = Math.round(Math.min(brutto, SOCIAL_INSURANCE.arbeit.bbg) * SOCIAL_INSURANCE.arbeit.rate);

  const steuern: number = est + soli + kirche;
  const sozial: number = rv + kv + pv + av;
  const gesamt: number = steuern + sozial;

  return {
    einkommensteuer: est, soli, kirchensteuer: kirche,
    rentenversicherung: rv, krankenversicherung: kv,
    pflegeversicherung: pv, arbeitslosenversicherung: av,
    gesamtSteuern: steuern, gesamtSozial: sozial,
    gesamtAbgaben: gesamt,
    nettoJahreseinkommen: brutto - gesamt,
    abgabenquote: brutto > 0 ? (gesamt / brutto) * 100 : 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   BUDGET DATA – Bundeshaushalt 2026 mit Unterkategorien
   Hinweis: Unterkategorien sind teilweise geschätzt auf Basis
   der Einzelpläne und öffentlich verfügbarer Haushaltsdaten.
   ═══════════════════════════════════════════════════════════════════ */

const BUNDESHAUSHALT_GESAMT: number = 524_540_000_000;
const TOTAL_EINKOMMENSTEUER_REVENUE: number = 190_000_000_000;

const BUNDESHAUSHALT_KATEGORIEN: BudgetKategorie[] = [
  {
    name: "Arbeit & Soziales",
    betrag: 197_340_000_000,
    prozent: 37.6,
    icon: "👥",
    farbe: "#3b82f6",
    unterkategorien: [
      {
        name: "Zuschuss Rentenversicherung",
        betrag: 113_000_000_000,
        icon: "👴",
        beschreibung: "Der Bundeszuschuss zur gesetzlichen Rentenversicherung gleicht die Lücke zwischen Beitragseinnahmen und Rentenausgaben aus. Ohne diesen Zuschuss wären die Renten nicht finanzierbar – er macht über die Hälfte des gesamten Sozialhaushalts aus.",
      },
      {
        name: "Bürgergeld & Grundsicherung",
        betrag: 28_100_000_000,
        icon: "🏘️",
        beschreibung: "Das Bürgergeld (ehem. Hartz IV) sichert das Existenzminimum für Arbeitsuchende und ihre Familien. Umfasst Regelsätze, Kosten für Unterkunft und Heizung sowie Eingliederungshilfen für den Wiedereinstieg in den Arbeitsmarkt.",
      },
      {
        name: "Kindergeld & Familienleistungen",
        betrag: 29_400_000_000,
        icon: "👶",
        beschreibung: "Kindergeld, Elterngeld und weitere Familienleistungen des Bundes. Kindergeld beträgt aktuell 250 € pro Kind und Monat und wird an alle Eltern mit Wohnsitz in Deutschland ausgezahlt.",
      },
      {
        name: "Arbeitsförderung",
        betrag: 18_600_000_000,
        icon: "💼",
        beschreibung: "Förderprogramme der Bundesagentur für Arbeit: Weiterbildungen, Umschulungen, Eingliederungszuschüsse für Arbeitgeber und Maßnahmen zur Vermittlung von Langzeitarbeitslosen.",
      },
      {
        name: "Wohngeld & Sozialer Wohnbau",
        betrag: 8_240_000_000,
        icon: "🏠",
        beschreibung: "Zuschüsse zu Miet- und Heizkosten für Haushalte mit geringem Einkommen sowie Fördermittel für den Bau neuer Sozialwohnungen. Seit der Wohngeldreform 2023 haben deutlich mehr Haushalte Anspruch.",
      },
    ],
  },
  {
    name: "Verteidigung",
    betrag: 82_690_000_000,
    prozent: 15.8,
    icon: "🛡️",
    farbe: "#ef4444",
    unterkategorien: [
      {
        name: "Militärische Beschaffung",
        betrag: 28_500_000_000,
        icon: "🚁",
        beschreibung: "Anschaffung neuer Waffensysteme, Fahrzeuge, Flugzeuge und Schiffe. Große laufende Projekte umfassen den F-35 Kampfjet, den Schützenpanzer Puma und die Fregatte F126. Ein Großteil fließt aus dem Sondervermögen Bundeswehr.",
      },
      {
        name: "Personal Bundeswehr",
        betrag: 21_500_000_000,
        icon: "👨‍✈️",
        beschreibung: "Gehälter, Sold und Versorgungsbezüge für rund 182.000 aktive Soldatinnen und Soldaten sowie ca. 80.000 zivile Beschäftigte der Bundeswehr. Einschließlich Zulagen für Auslandseinsätze.",
      },
      {
        name: "Betrieb & Liegenschaften",
        betrag: 14_800_000_000,
        icon: "🏗️",
        beschreibung: "Unterhalt und Betrieb von über 1.500 militärischen Liegenschaften. Umfasst Kasernen, Übungsplätze, Munitionslager, Treibstoff, Verpflegung und den laufenden Betrieb aller Standorte.",
      },
      {
        name: "Wehrtechnik & Forschung",
        betrag: 9_200_000_000,
        icon: "🔬",
        beschreibung: "Forschung und Entwicklung neuer Verteidigungstechnologien – von Drohnensystemen über Cyberabwehr bis zu Satellitenkommunikation. Wird teilweise an Fraunhofer-Institute und private Rüstungsunternehmen vergeben.",
      },
      {
        name: "NATO & Internationale Einsätze",
        betrag: 5_700_000_000,
        icon: "🌍",
        beschreibung: "Deutschlands Beiträge zum NATO-Haushalt, Kosten für Auslandseinsätze (z. B. Litauen, Niger) und internationale Verteidigungskooperationen. Deutschland strebt an, dauerhaft 2 % des BIP für Verteidigung auszugeben.",
      },
      {
        name: "Nachrichtendienste (BND/MAD)",
        betrag: 2_990_000_000,
        icon: "🕵️",
        beschreibung: "Budget des Bundesnachrichtendienstes (BND) für Auslandsaufklärung und des Militärischen Abschirmdienstes (MAD) für Spionageabwehr innerhalb der Bundeswehr. Die genauen Zahlen unterliegen teilweise der Geheimhaltung.",
      },
    ],
  },
  {
    name: "Allg. Finanzverwaltung",
    betrag: 52_400_000_000,
    prozent: 10.0,
    icon: "🏛️",
    farbe: "#f59e0b",
    unterkategorien: [
      {
        name: "EU-Eigenmittel & Beiträge",
        betrag: 33_200_000_000,
        icon: "🇪🇺",
        beschreibung: "Deutschlands Beitrag zum EU-Haushalt als größter Nettozahler der Union. Finanziert EU-Förderprogramme, Agrarpolitik, Strukturfonds und die EU-Verwaltung. Deutschland zahlt deutlich mehr ein als es zurückbekommt.",
      },
      {
        name: "Steuerverwaltung & Zoll",
        betrag: 8_400_000_000,
        icon: "📋",
        beschreibung: "Kosten für die Erhebung und Verwaltung von Bundessteuern. Umfasst den Zoll, das Bundeszentralamt für Steuern und IT-Systeme zur Steuererhebung. Für jeden investierten Euro werden ein Vielfaches an Steuern eingenommen.",
      },
      {
        name: "Länderfinanzausgleich",
        betrag: 7_300_000_000,
        icon: "⚖️",
        beschreibung: "Bundesmittel für den Finanzausgleich zwischen den Bundesländern. Strukturschwache Länder erhalten Ergänzungszuweisungen, um einheitliche Lebensverhältnisse in ganz Deutschland zu gewährleisten.",
      },
      {
        name: "Versorgung & Beihilfe",
        betrag: 3_500_000_000,
        icon: "📎",
        beschreibung: "Pensionen und Beihilfeleistungen für ehemalige Bundesbeamte. Die Versorgungsausgaben steigen demografiebedingt kontinuierlich, da immer mehr Beamte in den Ruhestand eintreten.",
      },
    ],
  },
  {
    name: "Zins & Schulden",
    betrag: 30_180_000_000,
    prozent: 5.8,
    icon: "💰",
    farbe: "#8b5cf6",
    unterkategorien: [
      {
        name: "Zinsen Bundesanleihen",
        betrag: 22_100_000_000,
        icon: "📈",
        beschreibung: "Zinszahlungen auf langfristige Bundesanleihen und Bundesobligationen. Nach der Zinswende der EZB 2022 sind die Zinskosten des Bundes stark gestiegen. Deutschland gilt weiterhin als sicherer Hafen an den Kapitalmärkten.",
      },
      {
        name: "Kurzfristige Schuldtitel",
        betrag: 5_300_000_000,
        icon: "📄",
        beschreibung: "Zinsen auf kurzfristige Finanzierungsinstrumente wie Bundesschatzanweisungen und unverzinsliche Schatzanweisungen (Bubills). Dienen der kurzfristigen Liquiditätssteuerung des Bundes.",
      },
      {
        name: "Schuldenmanagement",
        betrag: 2_780_000_000,
        icon: "🏦",
        beschreibung: "Kosten der Bundesrepublik Deutschland Finanzagentur für die Verwaltung der Bundesschuld. Umfasst Emissionskosten, Swap-Geschäfte und den operativen Betrieb des Schuldenmanagements.",
      },
    ],
  },
  {
    name: "Verkehr & Infrastruktur",
    betrag: 27_900_000_000,
    prozent: 5.3,
    icon: "🚆",
    farbe: "#10b981",
    unterkategorien: [
      {
        name: "Schienennetz (Deutsche Bahn)",
        betrag: 14_200_000_000,
        icon: "🚄",
        beschreibung: "Investitionen in das deutsche Schienennetz – Sanierung maroder Brücken, Modernisierung von Stellwerken und Ausbau von Hochgeschwindigkeitsstrecken. Deutschland investiert derzeit in die größte Schienensanierung seiner Geschichte.",
      },
      {
        name: "Bundesautobahnen & Straßen",
        betrag: 7_800_000_000,
        icon: "🛣️",
        beschreibung: "Neubau, Ausbau und Erhalt des Bundesfernstraßennetzes mit über 13.000 km Autobahn und 37.000 km Bundesstraße. Verwaltet durch die Autobahn GmbH des Bundes.",
      },
      {
        name: "Digitale Infrastruktur",
        betrag: 3_800_000_000,
        icon: "📡",
        beschreibung: "Förderprogramme für den Glasfaserausbau und die Schließung von Mobilfunklücken, insbesondere in ländlichen Regionen. Ziel ist eine flächendeckende Gigabit-Versorgung bis 2030.",
      },
      {
        name: "Wasserstraßen & Häfen",
        betrag: 2_100_000_000,
        icon: "⚓",
        beschreibung: "Unterhalt und Modernisierung der Bundeswasserstraßen – über 7.300 km Flüsse und Kanäle sowie Schleusen, Wehre und Brücken. Die Wasserstraßeninfrastruktur ist für den Güterverkehr unverzichtbar.",
      },
    ],
  },
  {
    name: "Bildung & Forschung",
    betrag: 22_400_000_000,
    prozent: 4.3,
    icon: "🎓",
    farbe: "#ec4899",
    unterkategorien: [
      {
        name: "Hochschulen & Universitäten",
        betrag: 8_900_000_000,
        icon: "🏫",
        beschreibung: "Bundesmittel für die Exzellenzstrategie, den Hochschulpakt und die Förderung von Spitzenuniversitäten. Obwohl Bildung Ländersache ist, beteiligt sich der Bund zunehmend an der Hochschulfinanzierung.",
      },
      {
        name: "Forschungsförderung",
        betrag: 7_200_000_000,
        icon: "🔬",
        beschreibung: "Finanzierung von Forschungseinrichtungen wie Max-Planck, Fraunhofer, Helmholtz und Leibniz-Gemeinschaft. Deutschland ist drittgrößter Forschungsinvestor weltweit.",
      },
      {
        name: "BAföG",
        betrag: 3_100_000_000,
        icon: "📚",
        beschreibung: "Bundesausbildungsförderung für Studierende und Schüler aus einkommensschwachen Familien. Wird zur Hälfte als Zuschuss und zur Hälfte als zinsloses Darlehen gewährt.",
      },
      {
        name: "Digitalpakt Schule",
        betrag: 2_250_000_000,
        icon: "💻",
        beschreibung: "Bundesfördermittel für die digitale Ausstattung von Schulen – WLAN, Tablets, interaktive Tafeln und Lernplattformen. Der Digitalpakt 2.0 soll die Digitalisierung weiter vorantreiben.",
      },
      {
        name: "Berufsbildung",
        betrag: 950_000_000,
        icon: "🔧",
        beschreibung: "Förderung der dualen Berufsausbildung, überbetriebliche Ausbildungsstätten und Programme gegen den Fachkräftemangel. Das duale System gilt international als Vorbild.",
      },
    ],
  },
  {
    name: "Gesundheit",
    betrag: 15_700_000_000,
    prozent: 3.0,
    icon: "🏥",
    farbe: "#06b6d4",
    unterkategorien: [
      {
        name: "Zuschuss Krankenversicherung",
        betrag: 7_200_000_000,
        icon: "💊",
        beschreibung: "Bundeszuschuss an den Gesundheitsfonds der gesetzlichen Krankenversicherung. Deckt versicherungsfremde Leistungen ab, etwa die beitragsfreie Mitversicherung von Kindern.",
      },
      {
        name: "Krankenhausreform",
        betrag: 3_400_000_000,
        icon: "🏨",
        beschreibung: "Fördermittel für die Krankenhausstrukturreform – Spezialisierung von Kliniken, Abbau von Überkapazitäten und Sicherstellung der stationären Versorgung im ländlichen Raum.",
      },
      {
        name: "Prävention & Pandemievorsorge",
        betrag: 2_800_000_000,
        icon: "🦠",
        beschreibung: "Mittel für das Robert Koch-Institut, nationale Impfstoffreserven, Pandemiepläne und Präventionsprogramme. Die COVID-Pandemie hat die Bedeutung dieser Ausgaben stark in den Fokus gerückt.",
      },
      {
        name: "Gesundheitsforschung",
        betrag: 1_400_000_000,
        icon: "🧬",
        beschreibung: "Forschungsförderung in Krebsforschung, seltenen Erkrankungen, digitalen Gesundheitsanwendungen und personalisierter Medizin.",
      },
      {
        name: "Pflege & Drogenpolitik",
        betrag: 900_000_000,
        icon: "🤲",
        beschreibung: "Bundesmittel für Pflegeinfrastruktur, Ausbildungsoffensive Pflege und die nationale Drogen- und Suchtpolitik. Umfasst auch Förderprogramme für pflegende Angehörige.",
      },
    ],
  },
  {
    name: "Sonstiges",
    betrag: 93_930_000_000,
    prozent: 17.9,
    icon: "📊",
    farbe: "#64748b",
    unterkategorien: [
      {
        name: "Umwelt & Klimaschutz",
        betrag: 12_500_000_000,
        icon: "🌱",
        beschreibung: "Klima- und Transformationsfonds, Gebäudesanierung, erneuerbare Energien, Naturschutz und Wasserstoffstrategie. Der Klimafonds finanziert Maßnahmen zur Erreichung der Klimaneutralität bis 2045.",
      },
      {
        name: "Innere Sicherheit & Polizei",
        betrag: 12_800_000_000,
        icon: "🚔",
        beschreibung: "Bundespolizei, Bundeskriminalamt (BKA), Verfassungsschutz und Katastrophenschutz (THW/BBK). Umfasst auch Cybersicherheit und Bekämpfung organisierter Kriminalität.",
      },
      {
        name: "Entwicklungszusammenarbeit",
        betrag: 11_200_000_000,
        icon: "🌍",
        beschreibung: "Bilaterale und multilaterale Entwicklungszusammenarbeit über GIZ, KfW und UN-Organisationen. Deutschland ist einer der größten Geber weltweit – Schwerpunkte sind Klimaanpassung und Ernährungssicherheit.",
      },
      {
        name: "Wirtschaftsförderung",
        betrag: 10_300_000_000,
        icon: "🏭",
        beschreibung: "Subventionen und Förderprogramme – KfW-Kredite, Innovationsförderung, Mittelstandsprogramme und Unterstützung von Schlüsselindustrien wie Halbleiter und Batteriezellenfertigung.",
      },
      {
        name: "Auswärtiges & Diplomatie",
        betrag: 7_400_000_000,
        icon: "🏳️",
        beschreibung: "Betrieb von über 220 deutschen Auslandsvertretungen, konsularische Dienste, humanitäre Hilfe und Kulturpolitik (Goethe-Institut, DAAD). Einschließlich Beiträge zu internationalen Organisationen.",
      },
      {
        name: "Kultur & Medien",
        betrag: 2_600_000_000,
        icon: "🎭",
        beschreibung: "Kulturstaatsministerin, Stiftung Preußischer Kulturbesitz, Bundeskulturförderung, Gedenkstätten und Filmförderung. Umfasst auch die Deutsche Welle als Auslandsrundfunk.",
      },
      {
        name: "Justiz & Bundesgerichte",
        betrag: 1_200_000_000,
        icon: "⚖️",
        beschreibung: "Betrieb der obersten Bundesgerichte (Bundesverfassungsgericht, BGH, BVerwG etc.), Generalbundesanwalt und gesetzgeberische Arbeit des Bundesjustizministeriums.",
      },
      {
        name: "Weitere Bundesausgaben",
        betrag: 35_930_000_000,
        icon: "📁",
        beschreibung: "Sammelposten für kleinere Einzelpläne: Bundespräsidialamt, Bundestag, Bundeskanzleramt, Bundesrat, Rechnungshof und weitere nachgeordnete Behörden sowie Rücklagen.",
      },
    ],
  },
];

/* ── Staatsverschuldung ──────────────────────────────────────────── */
const STAATSSCHULDEN_BASIS: number = 2_574_000_000_000;
const NEUVERSCHULDUNG_2026: number = 44_000_000_000;
const SCHULDEN_PRO_SEKUNDE: number = NEUVERSCHULDUNG_2026 / 365 / 24 / 3600;
const EINWOHNER: number = 84_400_000;

function calculateBudgetShare(einkommensteuer: number): BudgetKategorieMitAnteil[] {
  const anteil: number = einkommensteuer / TOTAL_EINKOMMENSTEUER_REVENUE;
  return BUNDESHAUSHALT_KATEGORIEN.map((k: BudgetKategorie): BudgetKategorieMitAnteil => {
    const deinAnteil: number = Math.round(anteil * k.betrag * 100) / 100;
    const unterkategorienMitAnteil: UnterkategorieMitAnteil[] = k.unterkategorien.map(
      (sub: Unterkategorie): UnterkategorieMitAnteil => ({
        ...sub,
        deinAnteil: Math.round(anteil * sub.betrag * 100) / 100,
      })
    );
    return { ...k, deinAnteil, unterkategorienMitAnteil };
  });
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function fmt(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function fmtDecimal(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPlain(n: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function generateShareText(r: TaxResult): string {
  return `Mein #SteuerWrapped 2026:\n💰 ${fmt(r.gesamtAbgaben)} Abgaben (${r.abgabenquote.toFixed(1)}%)\n🏛️ ${fmt(r.einkommensteuer)} Einkommensteuer\n👴 ${fmt(r.rentenversicherung)} Rente\n🏥 ${fmt(r.krankenversicherung)} Krankenversicherung\n\nBerechne deins: steuerwrapped.de`;
}

function shareOnX(text: string): void {
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

function shareOnWhatsApp(text: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

/* ═══════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

function AnimatedNumber({ value, duration = 1200, prefix = "", suffix = "" }: AnimatedNumberProps) {
  const [display, setDisplay] = useState<number>(0);
  useEffect(() => {
    const startTime: number = Date.now();
    let raf: number;
    const tick = (): void => {
      const elapsed: number = Date.now() - startTime;
      const progress: number = Math.min(elapsed / duration, 1);
      const eased: number = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span>{prefix}{fmtPlain(display)}{suffix}</span>;
}

function LiveDebtCounter() {
  const [debt, setDebt] = useState<number>(STAATSSCHULDEN_BASIS);
  const startRef = useRef<number>(Date.now());
  useEffect(() => {
    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      const elapsed: number = (Date.now() - startRef.current) / 1000;
      setDebt(STAATSSCHULDEN_BASIS + elapsed * SCHULDEN_PRO_SEKUNDE);
    }, 70);
    return () => clearInterval(interval);
  }, []);

  const formatted: string = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(debt));
  const proKopf: string = fmt(Math.round(debt / EINWOHNER));

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "clamp(1.2rem, 4.5vw, 1.8rem)",
        fontWeight: 700, background: "rgba(255,255,255,0.08)", borderRadius: 12,
        padding: "0.8rem 1rem", margin: "1.5rem 0 0.5rem",
        letterSpacing: "-0.02em", color: "#fff",
        border: "1px solid rgba(255,255,255,0.12)",
        minHeight: "3.2rem", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {formatted}
      </div>
      <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.45)", marginBottom: "2rem" }}>
        Staatsverschuldung — live
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "clamp(2rem, 8vw, 3.2rem)",
        fontWeight: 700, background: "rgba(255,255,255,0.08)", borderRadius: 12,
        padding: "0.8rem 1rem", margin: "0 0 0.5rem", color: "#f87171",
        border: "1px solid rgba(239,68,68,0.2)",
      }}>
        {proKopf}
      </div>
      <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.45)" }}>
        pro Einwohner
      </div>
    </div>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "1.25rem",
    }}>
      {children}
    </div>
  );
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.5)", marginBottom: "0.5rem" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function NavButton({ direction, disabled, onClick }: { direction: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} aria-label={direction === "prev" ? "Zurück" : "Weiter"} style={{
      width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: "1.2rem",
      cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-display)", opacity: disabled ? 0.2 : 1, transition: "all 0.2s",
    }}>
      {direction === "prev" ? "←" : "→"}
    </button>
  );
}

function ShareButton({ label, bg, color, border, onClick }: { label: string; bg: string; color: string; border?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "0.9rem", border: border || "none", borderRadius: 14,
      fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
      background: bg, color, transition: "all 0.2s",
    }}>
      {label}
    </button>
  );
}

function DescriptionOverlay({ modal, onClose }: { modal: DescriptionModalData; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.5rem", animation: "fadeIn 0.2s ease",
    }}>
      <div onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{
        background: "#fff", color: "#111", borderRadius: 20,
        padding: "1.75rem", maxWidth: 380, width: "100%",
        boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
        animation: "modalIn 0.3s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "1.4rem" }}>{modal.icon}</span>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>{modal.name}</h3>
        </div>
        <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", fontWeight: 600, color: "#6b7280", marginBottom: "1rem" }}>
          {modal.betrag}
        </div>
        <p style={{ fontSize: "0.92rem", lineHeight: 1.65, color: "#374151", margin: 0 }}>
          {modal.beschreibung}
        </p>
        <button onClick={onClose} style={{
          marginTop: "1.25rem", width: "100%", padding: "0.7rem",
          background: "#f3f4f6", border: "none", borderRadius: 10,
          fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
          fontFamily: "var(--font-display)", color: "#374151",
        }}>
          Schließen
        </button>
      </div>
    </div>
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
  { value: "BW", label: "Baden-Württemberg" }, { value: "BY", label: "Bayern" },
  { value: "BE", label: "Berlin" }, { value: "BB", label: "Brandenburg" },
  { value: "HB", label: "Bremen" }, { value: "HH", label: "Hamburg" },
  { value: "HE", label: "Hessen" }, { value: "MV", label: "Mecklenburg-Vorpommern" },
  { value: "NI", label: "Niedersachsen" }, { value: "NW", label: "Nordrhein-Westfalen" },
  { value: "RP", label: "Rheinland-Pfalz" }, { value: "SL", label: "Saarland" },
  { value: "SN", label: "Sachsen" }, { value: "ST", label: "Sachsen-Anhalt" },
  { value: "SH", label: "Schleswig-Holstein" }, { value: "TH", label: "Thüringen" },
];

const SLIDE_GRADIENTS: string[] = [
  "linear-gradient(135deg, #0c1445 0%, #1e1b4b 40%, #312e81 100%)",
  "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0e4a6e 100%)",
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #21262d 100%)",
  "linear-gradient(135deg, #0c0c1d 0%, #1b1140 50%, #2d1b69 100%)",
  "linear-gradient(135deg, #0a192f 0%, #112240 50%, #1d3461 100%)",
  "linear-gradient(135deg, #1a0a2e 0%, #2d1854 50%, #4a1942 100%)",
  "linear-gradient(135deg, #1c1917 0%, #292524 50%, #44403c 100%)",
  "linear-gradient(135deg, #0c1445 0%, #312e81 50%, #4c1d95 100%)",
];

const TOTAL_SLIDES: number = 9;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.85rem 1rem",
  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12, color: "#fff", fontFamily: "var(--font-display)",
  fontSize: "1rem", fontWeight: 500, outline: "none",
  WebkitAppearance: "none" as const,
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function SteuerWrapped() {
  const [view, setView] = useState<"input" | "results">("input");
  const [slide, setSlide] = useState<number>(0);
  const [animKey, setAnimKey] = useState<number>(0);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [descriptionModal, setDescriptionModal] = useState<DescriptionModalData | null>(null);
  const [form, setForm] = useState<TaxInput>({
    brutto: 50000, steuerklasse: "I", kinder: 0, kirchensteuer: false, bundesland: "NW",
  });

  const result: TaxResult = useMemo(() => calculateTax(form), [form]);
  const budgetShare: BudgetKategorieMitAnteil[] = useMemo(() => calculateBudgetShare(result.einkommensteuer), [result.einkommensteuer]);

  const goToSlide = useCallback((dir: number): void => {
    setSlide((s: number) => { const n: number = s + dir; return (n < 0 || n >= TOTAL_SLIDES) ? s : n; });
    setAnimKey((k: number) => k + 1);
    setExpandedCategory(null);
    setDescriptionModal(null);
  }, []);

  const handleSubmit = (): void => {
    setSlide(0); setAnimKey(0); setExpandedCategory(null); setDescriptionModal(null); setView("results");
  };

  const pieData: PieDataItem[] = useMemo(() => [
    { name: "Einkommensteuer", value: result.einkommensteuer, color: "#818cf8" },
    { name: "Soli", value: result.soli, color: "#a78bfa" },
    { name: "Kirchensteuer", value: result.kirchensteuer, color: "#c084fc" },
    { name: "Rentenvers.", value: result.rentenversicherung, color: "#38bdf8" },
    { name: "Krankenvers.", value: result.krankenversicherung, color: "#2dd4bf" },
    { name: "Pflegevers.", value: result.pflegeversicherung, color: "#fbbf24" },
    { name: "Arbeitslosenvers.", value: result.arbeitslosenversicherung, color: "#fb923c" },
  ].filter((i: PieDataItem) => i.value > 0), [result]);

  const top3: Top3Item[] = useMemo(() => [
    { name: "Rentenversicherung", icon: "👴", value: result.rentenversicherung },
    { name: "Krankenversicherung", icon: "🏥", value: result.krankenversicherung },
    { name: "Einkommensteuer", icon: "🏛️", value: result.einkommensteuer },
    { name: "Pflegeversicherung", icon: "🤝", value: result.pflegeversicherung },
    { name: "Arbeitslosenvers.", icon: "📋", value: result.arbeitslosenversicherung },
    { name: "Solidaritätszuschlag", icon: "🇩🇪", value: result.soli },
    { name: "Kirchensteuer", icon: "⛪", value: result.kirchensteuer },
  ].filter((a: Top3Item) => a.value > 0).sort((a: Top3Item, b: Top3Item) => b.value - a.value).slice(0, 3), [result]);

  const funFacts: FunFact[] = useMemo(() => {
    const h: number = Math.floor((result.abgabenquote / 100) * 8);
    const m: number = Math.round((((result.abgabenquote / 100) * 8) % 1) * 60);
    return [
      { icon: "👴", value: `${(result.rentenversicherung / 365).toFixed(2)} €`, label: "pro Tag für deine Rente" },
      { icon: "⏰", value: result.abgabenquote > 0 ? `${h}h ${m}min` : "0h", label: "am Tag arbeitest du für den Staat" },
      { icon: "💵", value: fmt(Math.round(result.nettoJahreseinkommen / 12)), label: "Netto pro Monat" },
      { icon: "📅", value: `${Math.round(result.abgabenquote * 3.65)} Tage`, label: "im Jahr für Abgaben" },
    ];
  }, [result]);

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length > 0) {
      return (
        <div style={{ background: "rgba(15,23,42,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "0.6rem 0.9rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#fff" }}>{payload[0].name}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{fmt(payload[0].value)}</div>
        </div>
      );
    }
    return null;
  };

  const WaveDeco = () => (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 120, overflow: "hidden", pointerEvents: "none", opacity: 0.15 }}>
      <svg viewBox="0 0 500 120" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <path d="M0,40 C100,80 200,10 300,50 C400,90 450,20 500,60" fill="none" stroke="white" strokeWidth="1.5" />
        <path d="M0,70 C80,30 180,90 280,40 C380,0 440,80 500,30" fill="none" stroke="white" strokeWidth="1" />
      </svg>
    </div>
  );

  const cs: React.CSSProperties = { width: "100%", maxWidth: 480, animation: "slideIn 0.5s cubic-bezier(0.16,1,0.3,1)" };

  const renderSlide = (): React.ReactNode => {
    switch (slide) {
      case 0: return (
        <div style={cs} key={animKey}><WaveDeco />
          <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>💰</div>
          <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem", lineHeight: 1.15 }}>Dein Steuer Wrapped 2026</h2>
          <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Dein Brutto-Jahreseinkommen</p>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(2.5rem,10vw,4rem)", fontWeight: 700, textAlign: "center", margin: "1rem 0", lineHeight: 1, background: "linear-gradient(135deg, #c7d2fe, #a78bfa, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            <AnimatedNumber value={form.brutto} suffix=" €" />
          </div>
          <p style={{ fontSize: "clamp(1rem,3vw,1.3rem)", textAlign: "center", color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>Steuerklasse {form.steuerklasse} · {form.kinder} {form.kinder === 1 ? "Kind" : "Kinder"}</p>
        </div>
      );

      case 1: return (
        <div style={cs} key={animKey}>
          <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>📊</div>
          <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>Deine Abgaben auf einen Blick</h2>
          <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>So viel geht dieses Jahr an den Staat</p>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(2.5rem,10vw,4rem)", fontWeight: 700, textAlign: "center", margin: "1rem 0", lineHeight: 1, color: "#f87171" }}>
            <AnimatedNumber value={result.gesamtAbgaben} suffix=" €" />
          </div>
          <p style={{ fontSize: "clamp(1rem,3vw,1.3rem)", textAlign: "center", color: "rgba(255,255,255,0.6)", fontWeight: 500, marginBottom: "0.5rem" }}>Abgabenquote: {result.abgabenquote.toFixed(1)}%</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1.5rem" }}>
            <GlassCard><div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", textAlign: "center" }}>🏛️</div><div style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem", fontWeight: 700, textAlign: "center", color: "#818cf8", marginBottom: "0.2rem" }}><AnimatedNumber value={result.gesamtSteuern} suffix=" €" /></div><div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", fontWeight: 500, textTransform: "uppercase" as const, textAlign: "center" }}>Steuern · {result.gesamtAbgaben > 0 ? ((result.gesamtSteuern / result.gesamtAbgaben) * 100).toFixed(0) : 0}%</div></GlassCard>
            <GlassCard><div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", textAlign: "center" }}>🛡️</div><div style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem", fontWeight: 700, textAlign: "center", color: "#38bdf8", marginBottom: "0.2rem" }}><AnimatedNumber value={result.gesamtSozial} suffix=" €" /></div><div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)", fontWeight: 500, textTransform: "uppercase" as const, textAlign: "center" }}>Sozialabgaben · {result.gesamtAbgaben > 0 ? ((result.gesamtSozial / result.gesamtAbgaben) * 100).toFixed(0) : 0}%</div></GlassCard>
          </div>
        </div>
      );

      case 2: return (
        <div style={cs} key={animKey}>
          <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🏆</div>
          <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>Deine Top 3 Abgaben</h2>
          <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Hier fließt am meisten hin</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {top3.map((item: Top3Item, i: number) => {
              const c: string[] = ["#fbbf24", "#94a3b8", "#cd7f32"];
              return (<div key={item.name} style={{ display: "flex", alignItems: "center", gap: "1rem", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "1rem 1.25rem", animation: `podiumIn 0.5s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.15}s both` }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, width: "2.5rem", textAlign: "center", color: c[i] }}>{i + 1}</div>
                <div style={{ fontSize: "1.8rem" }}>{item.icon}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: "0.85rem", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{item.name}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: "1.15rem", fontWeight: 700, color: c[i] }}>{fmt(item.value)}</div></div>
              </div>);
            })}
          </div>
        </div>
      );

      case 3: return (
        <div style={cs} key={animKey}>
          <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🍰</div>
          <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>Dein Abgaben-Mix</h2>
          <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Alle Abgaben im Überblick</p>
          <div style={{ width: "100%", height: 260, margin: "1rem 0" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={105} paddingAngle={3} dataKey="value" stroke="none" animationBegin={100} animationDuration={800}>
                {pieData.map((e: PieDataItem) => <Cell key={e.name} fill={e.color} />)}
              </Pie><Tooltip content={<CustomTooltip />} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", justifyContent: "center" }}>
            {pieData.map((e: PieDataItem) => (<div key={e.name} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flexShrink: 0 }} />{e.name}</div>))}
          </div>
        </div>
      );

      /* ── 4: BUNDESHAUSHALT (EXPANDABLE + CLICK-FOR-DESCRIPTION) ── */
      case 4: return (
        <div style={cs} key={animKey}>
          <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🇩🇪</div>
          <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>Wohin fließt dein Steuergeld?</h2>
          <p style={{ fontSize: "clamp(0.8rem,2.2vw,0.9rem)", textAlign: "center", color: "rgba(255,255,255,0.4)", marginBottom: "1.25rem" }}>Tippe auf eine Kategorie · Tippe auf eine Zeile für Details</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {budgetShare.map((kat: BudgetKategorieMitAnteil) => {
              const isExp: boolean = expandedCategory === kat.name;
              return (
                <div key={kat.name}>
                  <div onClick={() => setExpandedCategory(isExp ? null : kat.name)} style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    background: isExp ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${isExp ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: isExp ? "12px 12px 0 0" : 12,
                    padding: "0.65rem 0.7rem", cursor: "pointer", transition: "all 0.2s",
                  }}>
                    <div style={{ fontSize: "1rem", flexShrink: 0 }}>{kat.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.12rem" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kat.name}</span>
                        <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.35)", fontWeight: 500, flexShrink: 0, marginLeft: "0.4rem" }}>{kat.prozent}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${(kat.prozent / 40) * 100}%`, background: kat.farbe, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 600, color: kat.farbe, flexShrink: 0, width: "4.5rem", textAlign: "right" }}>
                      {kat.deinAnteil >= 1 ? fmt(Math.round(kat.deinAnteil)) : fmtDecimal(kat.deinAnteil)}
                    </div>
                    <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", flexShrink: 0, transition: "transform 0.25s", transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }}>▼</div>
                  </div>

                  <div style={{
                    overflow: "hidden", maxHeight: isExp ? 900 : 0, opacity: isExp ? 1 : 0,
                    transition: "max-height 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease",
                    background: "rgba(255,255,255,0.025)",
                    border: isExp ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                    borderTop: "none", borderRadius: "0 0 12px 12px",
                  }}>
                    {kat.unterkategorienMitAnteil.map((sub: UnterkategorieMitAnteil, idx: number) => {
                      const maxB: number = Math.max(...kat.unterkategorienMitAnteil.map((s: UnterkategorieMitAnteil) => s.betrag));
                      const bw: number = (sub.betrag / maxB) * 100;
                      return (
                        <div key={sub.name} onClick={() => setDescriptionModal({
                          name: sub.name, icon: sub.icon, beschreibung: sub.beschreibung,
                          betrag: sub.deinAnteil >= 1 ? `Dein Anteil: ${fmt(Math.round(sub.deinAnteil))}` : `Dein Anteil: ${fmtDecimal(sub.deinAnteil)}`,
                        })} style={{
                          display: "flex", alignItems: "center", gap: "0.45rem",
                          padding: "0.5rem 0.7rem 0.5rem 1.6rem",
                          borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          cursor: "pointer", transition: "background 0.15s",
                        }}
                          onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget).style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => { (e.currentTarget).style.background = "transparent"; }}>
                          <div style={{ fontSize: "0.8rem", flexShrink: 0, width: "1.2rem", textAlign: "center" }}>{sub.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "0.65rem", fontWeight: 500, color: "rgba(255,255,255,0.55)", marginBottom: "0.1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub.name}</div>
                            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 2, width: `${bw}%`, background: kat.farbe, opacity: 0.5 }} />
                            </div>
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", fontWeight: 600, color: kat.farbe, flexShrink: 0, opacity: 0.7 }}>
                            {sub.deinAnteil >= 1 ? fmt(Math.round(sub.deinAnteil)) : fmtDecimal(sub.deinAnteil)}
                          </div>
                          <div style={{ fontSize: "0.5rem", color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>ℹ️</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );

      case 5: return (
        <div style={cs} key={animKey}>
          <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🤯</div>
          <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>Fun Facts</h2>
          <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Deine Abgaben mal anders betrachtet</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {funFacts.map((f: FunFact, i: number) => (
              <GlassCard key={i}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem", textAlign: "center" }}>{f.icon}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.3rem", textAlign: "center" }}>{f.value}</div>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.45)", fontWeight: 500, lineHeight: 1.3, textAlign: "center" }}>{f.label}</div>
              </GlassCard>
            ))}
          </div>
        </div>
      );

      /* ── 6: HAUSHALTSBILANZ ────────────────────────────────── */
      case 6: {
        const einnahmen: number = 401_000_000_000;
        const defizit: number = BUNDESHAUSHALT_GESAMT - einnahmen;
        return (
          <div style={cs} key={animKey}><WaveDeco />
            <h2 style={{ fontSize: "clamp(1.6rem,5vw,2.4rem)", fontWeight: 900, textAlign: "center", marginBottom: "0.5rem", lineHeight: 1.15 }}>Der Bund gibt mehr aus,{"\n"}als er einnimmt.</h2>
            <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.45)", marginBottom: "2.5rem" }}>Deutlich mehr.</p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ background: "#ef4444", borderRadius: 8, padding: "0.5rem 1rem", fontFamily: "var(--font-mono)", fontSize: "clamp(1.1rem,4vw,1.5rem)", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{(BUNDESHAUSHALT_GESAMT / 1e9).toFixed(0)} Mrd. €</div>
              <span style={{ fontSize: "1rem", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Ausgaben</span>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "rgba(255,255,255,0.3)", marginBottom: "0.5rem", paddingLeft: "0.5rem" }}>−</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ background: "#10b981", borderRadius: 8, padding: "0.5rem 1rem", fontFamily: "var(--font-mono)", fontSize: "clamp(1.1rem,4vw,1.5rem)", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{(einnahmen / 1e9).toFixed(0)} Mrd. €</div>
              <span style={{ fontSize: "1rem", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Einnahmen</span>
            </div>
            <div style={{ borderTop: "2px solid rgba(255,255,255,0.15)", margin: "0.75rem 0", width: "80%" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ background: "#ef4444", borderRadius: 8, padding: "0.5rem 1rem", fontFamily: "var(--font-mono)", fontSize: "clamp(1.1rem,4vw,1.5rem)", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{(defizit / 1e9).toFixed(0)} Mrd. €</div>
              <span style={{ fontSize: "1rem", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Neuverschuldung</span>
            </div>
          </div>
        );
      }

      /* ── 7: SCHULDEN LIVE ──────────────────────────────────── */
      case 7: return (
        <div style={cs} key={animKey}><WaveDeco />
          <h2 style={{ fontSize: "clamp(1.6rem,5vw,2.4rem)", fontWeight: 900, textAlign: "center", marginBottom: "0.5rem", lineHeight: 1.15 }}>Diese Schulden?</h2>
          <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.45)", marginBottom: "0.5rem" }}>Die landen auf der nationalen Kreditkarte – und die Uhr tickt.</p>
          <LiveDebtCounter />
          <div style={{ marginTop: "2rem", padding: "0.75rem 1rem", background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 600, color: "#fbbf24" }}>+{fmtDecimal(SCHULDEN_PRO_SEKUNDE)}</span>
            <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginLeft: "0.5rem" }}>pro Sekunde</span>
          </div>
        </div>
      );

      /* ── 8: SHARE ──────────────────────────────────────────── */
      case 8: return (
        <div style={cs} key={animKey}>
          <div style={{ fontSize: "3.5rem", textAlign: "center", marginBottom: "1rem" }}>🎉</div>
          <h2 style={{ fontSize: "clamp(1.5rem,5vw,2.2rem)", fontWeight: 800, textAlign: "center", marginBottom: "0.5rem" }}>Teile dein Wrapped!</h2>
          <p style={{ fontSize: "clamp(0.9rem,2.5vw,1.05rem)", textAlign: "center", color: "rgba(255,255,255,0.5)", marginBottom: "2rem" }}>Zeig deinen Freunden, was der Staat von dir bekommt</p>
          <GlassCard><pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" as const }}>{generateShareText(result)}</pre></GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "2rem", width: "100%" }}>
            <ShareButton label="𝕏  Auf X teilen" bg="#fff" color="#000" onClick={() => shareOnX(generateShareText(result))} />
            <ShareButton label="💬  Auf WhatsApp teilen" bg="#25D366" color="#fff" onClick={() => shareOnWhatsApp(generateShareText(result))} />
            <ShareButton label="🔄  Neu berechnen" bg="rgba(255,255,255,0.08)" color="rgba(255,255,255,0.7)" border="1px solid rgba(255,255,255,0.15)" onClick={() => { setView("input"); setSlide(0); }} />
          </div>
        </div>
      );

      default: return null;
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "var(--font-display)", minHeight: "100vh", color: "#fff" }}>
      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateY(30px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes podiumIn { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalIn { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes drift { 0%,100% { transform:translate(0,0) rotate(0deg); } 33% { transform:translate(2%,-1%) rotate(1deg); } 66% { transform:translate(-1%,2%) rotate(-1deg); } }
      `}</style>

      {descriptionModal && <DescriptionOverlay modal={descriptionModal} onClose={() => setDescriptionModal(null)} />}

      {view === "input" ? (
        <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0c1445 0%, #1e1b4b 30%, #312e81 60%, #4c1d95 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "2rem 1rem", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: "radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(168,85,247,0.1) 0%, transparent 50%)", animation: "drift 20s ease-in-out infinite", pointerEvents: "none" }} />
          <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 100, padding: "0.4rem 1.2rem", fontSize: "0.8rem", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.7)", marginBottom: "1.5rem", position: "relative" as const, zIndex: 1 }}>Kostenlos · Anonym · Lokal</div>
          <h1 style={{ fontSize: "clamp(2.5rem,8vw,4.5rem)", fontWeight: 900, textAlign: "center", lineHeight: 1.05, marginBottom: "0.75rem", position: "relative" as const, zIndex: 1, background: "linear-gradient(135deg, #fff 0%, #c7d2fe 50%, #a78bfa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Steuer<br />Wrapped 2026</h1>
          <p style={{ fontSize: "clamp(0.95rem,2.5vw,1.2rem)", fontWeight: 400, textAlign: "center", color: "rgba(255,255,255,0.55)", marginBottom: "2.5rem", position: "relative" as const, zIndex: 1, maxWidth: 400 }}>Dein Jahr in Steuern & Abgaben – Spotify-Style</p>

          <div style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "2rem", width: "100%", maxWidth: 440, position: "relative" as const, zIndex: 1 }}>
            <FormGroup label="Brutto-Jahreseinkommen">
              <input type="number" min={0} step={1000} value={form.brutto} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, brutto: Math.max(0, Number(e.target.value)) })} placeholder="z.B. 50.000" style={inputStyle} />
            </FormGroup>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <FormGroup label="Steuerklasse">
                <select value={form.steuerklasse} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, steuerklasse: e.target.value })} style={inputStyle}>
                  {STEUERKLASSEN.map((sk: SteuerklasseOption) => <option key={sk.value} value={sk.value} style={{ background: "#1e1b4b", color: "#fff" }}>{sk.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Kinder">
                <input type="number" min={0} max={10} value={form.kinder} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, kinder: Math.max(0, Math.min(10, Number(e.target.value))) })} style={inputStyle} />
              </FormGroup>
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }} onClick={() => setForm({ ...form, kirchensteuer: !form.kirchensteuer })}>
                <button type="button" aria-label="Kirchensteuer" style={{ width: 44, height: 24, background: form.kirchensteuer ? "#8b5cf6" : "rgba(255,255,255,0.12)", borderRadius: 12, position: "relative" as const, cursor: "pointer", transition: "background 0.2s", flexShrink: 0, border: "none" }}>
                  <span style={{ position: "absolute", top: 2, left: 2, width: 20, height: 20, background: "#fff", borderRadius: "50%", transition: "transform 0.2s", transform: form.kirchensteuer ? "translateX(20px)" : "translateX(0)", display: "block" }} />
                </button>
                <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>Kirchensteuer zahlen</span>
              </div>
            </div>
            {form.kirchensteuer && (
              <FormGroup label="Bundesland">
                <select value={form.bundesland} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, bundesland: e.target.value })} style={inputStyle}>
                  {BUNDESLAENDER.map((bl: BundeslandOption) => <option key={bl.value} value={bl.value} style={{ background: "#1e1b4b", color: "#fff" }}>{bl.label}</option>)}
                </select>
              </FormGroup>
            )}
            <button onClick={handleSubmit} style={{ width: "100%", padding: "1rem", background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%)", border: "none", borderRadius: 14, color: "#fff", fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer", marginTop: "0.5rem" }}>
              Mein Wrapped anzeigen 🎉
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", marginTop: "1.5rem", position: "relative" as const, zIndex: 1, maxWidth: 400 }}>Alle Berechnungen erfolgen lokal in deinem Browser. Es werden keine Daten gespeichert oder übertragen. Die Ergebnisse sind Näherungswerte und ersetzen keine Steuerberatung.</p>
        </div>
      ) : (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", transition: "background 0.6s ease", background: SLIDE_GRADIENTS[slide] || SLIDE_GRADIENTS[0] }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: slide === 4 ? "flex-start" : "center", padding: slide === 4 ? "1.2rem 1.5rem 1rem" : "2rem 1.5rem", minHeight: "calc(100vh - 80px)", position: "relative", overflowY: slide === 4 ? "auto" : "visible" }}>
            {renderSlide()}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.5rem", position: "relative", zIndex: 10, flexShrink: 0 }}>
            <NavButton direction="prev" disabled={slide === 0} onClick={() => goToSlide(-1)} />
            <div style={{ display: "flex", gap: 5 }}>
              {Array.from({ length: TOTAL_SLIDES }).map((_: unknown, i: number) => (
                <div key={i} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: i === slide ? 3 : "50%", background: i === slide ? "#fff" : "rgba(255,255,255,0.2)", transition: "all 0.3s" }} />
              ))}
            </div>
            <NavButton direction="next" disabled={slide === TOTAL_SLIDES - 1} onClick={() => goToSlide(1)} />
          </div>
        </div>
      )}
    </div>
  );
}
