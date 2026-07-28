export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "****";

  const prefix = apiKey.startsWith("nvapi-") ? "nvapi-" : apiKey.slice(0, 4);
  const suffix = apiKey.slice(-4);
  return `${prefix}****${suffix}`;
}

export function redactSensitiveText(text: string, sensitiveValues: (string | undefined)[]): string {
  let result = text;
  for (const value of sensitiveValues) {
    if (!value || value.length < 4) continue;
    const masked = maskApiKey(value);
    result = result.replaceAll(value, masked);
  }
  // 또한 nvapi-[a-zA-Z0-9_-]+ 패턴 자동 마스킹
  result = result.replace(/nvapi-[a-zA-Z0-9_-]{10,}/g, (match) => maskApiKey(match));
  return result;
}
