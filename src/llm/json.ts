export function extractJsonText(text: string): string {
  const trimmed = text.trim();

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0].trim();
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    return arrayMatch[0].trim();
  }

  return trimmed;
}

export function parseJsonResponse(text: string): unknown {
  return JSON.parse(extractJsonText(text));
}
