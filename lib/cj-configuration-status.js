// Configuration is not evidence of a working connection.
export function cjConfigurationStatus(env = process.env) {
  const token = String(env.CJ_ACCESS_TOKEN || "").trim();
  const apiKey = String(env.CJ_API_KEY || "").trim();
  // The search route treats a literal test token as an error even if a key exists.
  const placeholder = token.toLowerCase() === "test";
  const configured = Boolean((token || apiKey) && !placeholder);
  return {
    configured, connected: false, verified: false,
    status: placeholder ? "invalid_config" : configured ? "configured_not_tested" : "missing_config",
    message: placeholder
      ? "CJ-Zugang ist als Testwert konfiguriert und kann so nicht verwendet werden."
      : configured
        ? "CJ ist konfiguriert; die Verbindung wurde nicht geprüft."
        : "CJ-Zugang ist nicht konfiguriert."
  };
}
