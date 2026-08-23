const REQUIRED_SIGNATURES = [
  'const ROOT_ID = "virtualAgentsSettingsRoot";',
  'const COMPANY_HOST_ID = "elyonWorkforceCompanyHost";',
  'const ADVANCED_HOST_ID = "elyonWorkforceAdvancedHost";',
  'function adoptLegacySurfaces()',
  'target.dataset.workforceOwner = "company";',
  'target.dataset.workforceOwner = "advanced";',
  'window.ElyonAIWorkforceOrgchartV1?.render?.()',
];

export function optimizeCompanyEntryRuntime(source) {
  const input = String(source || "");
  for (const signature of REQUIRED_SIGNATURES) {
    if (!input.includes(signature)) {
      throw new Error(`Company-entry optimization failed: single-owner signature not found: ${signature}`);
    }
  }
  return input;
}
