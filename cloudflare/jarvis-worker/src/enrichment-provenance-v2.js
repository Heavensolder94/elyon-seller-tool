const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function collectEnrichmentLayers(product) {
  const layers = [];
  let current = asObject(product);
  const seen = new Set();
  for (let depth = 0; depth < 10; depth += 1) {
    if (!Object.keys(current).length || seen.has(current)) break;
    seen.add(current);
    const enrichment = asObject(current.enrichment);
    if (Object.keys(enrichment).length) layers.push(enrichment);
    current = asObject(current.raw);
  }
  return layers.reverse();
}

function existingEnrichmentFields(product) {
  const fields = {};
  for (const layer of collectEnrichmentLayers(product)) {
    Object.assign(fields, asObject(layer.fields));
  }
  return fields;
}

function buildPreservingEnrichmentPatch({ product, findings = [], version, now = new Date().toISOString() }) {
  const layers = collectEnrichmentLayers(product);
  const latest = layers.length ? layers[layers.length - 1] : {};
  const fields = { ...existingEnrichmentFields(product) };

  for (const finding of findings) {
    if (!finding?.field) continue;
    fields[finding.field] = {
      value: finding.value,
      confidence: finding.confidence,
      sourceType: finding.sourceType,
      sourceUrl: finding.sourceUrl || null,
      evidence: finding.evidence || null,
      status: finding.status,
      complianceSensitive: Boolean(finding.complianceSensitive),
      verifiedAt: now,
      version,
    };
  }

  return {
    enrichment: {
      ...latest,
      version,
      lastRunAt: now,
      fields,
    },
  };
}

export { buildPreservingEnrichmentPatch, collectEnrichmentLayers, existingEnrichmentFields };
