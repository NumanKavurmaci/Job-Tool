export function extractJsonText(text: string): string {
  const trimmed = text.trim();

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

export function parseJsonResponse(text: string): unknown {
  return JSON.parse(extractJsonText(text));
}
