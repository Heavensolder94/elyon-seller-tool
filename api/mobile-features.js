const FEATURE_DEFINITIONS = [
  {
    key: "scannerV2",
    name: "Scanner V2",
    version: "v1.2",
    status: "prepared",
    description: "Barcode-Erkennung, Fotoanalyse, Vision AI und Produktidee-Übernahme.",
    env: "ELYON_FEATURE_SCANNER_V2",
  },
  {
    key: "brainV2",
    name: "Brain V2",
    version: "v1.3",
    status: "prepared",
    description: "Elyon Brain mit Live-Kontext aus Orders, Health, Scanner und Backups.",
    env: "ELYON_FEATURE_BRAIN_V2",
  },
  {
    key: "pushV1",
    name: "Push Notifications",
    version: "v1.4",
    status: "planned",
    description: "Warnungen für Verkäufe, API-Fehler, Backups und Tagesfokus.",
    env: "ELYON_FEATURE_PUSH_V1",
  },
  {
    key: "agentsV1",
    name: "Virtuelle Mitarbeiter",
    version: "v1.5",
    status: "planned",
    description: "Produkt-Agent, Preis-Agent, Risiko-Agent und Tagesfokus-Agent.",
    env: "ELYON_FEATURE_AGENTS_V1",
  },
  {
    key: "analyticsV2",
    name: "Live Analytics V2",
    version: "v1.6",
    status: "planned",
    description: "Umsatz, Gewinn, Topseller, Trends und operative Tagesauswertung.",
    env: "ELYON_FEATURE_ANALYTICS_V2",
  },
  {
    key: "autoPipelineV1",
    name: "Auto Produkt Pipeline",
    version: "v1.7",
    status: "planned",
    description: "Link/Fotoscan → Konkurrenzcheck → Marge → Listing-Entwurf.",
    env: "ELYON_FEATURE_AUTO_PIPELINE_V1",
  },
];

function flagValue(name) {
  return /^(1|true|yes|on|enabled)$/i.test(String(process.env[name] || "").trim());
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
  }

  const features = FEATURE_DEFINITIONS.map((feature) => ({
    ...feature,
    enabled: flagValue(feature.env),
    source: flagValue(feature.env) ? "environment" : "default-off",
  }));

  return res.status(200).json({
    ok: true,
    version: "1.1",
    checkedAt: new Date().toISOString(),
    features,
    note: "Serverweite Freischaltung erfolgt über Vercel Environment Variables. Lokale Mobile-Schalter können zusätzlich im Browser aktiviert werden.",
  });
}
