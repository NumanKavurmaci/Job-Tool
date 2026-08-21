export function extractJsonText(text: string): string {
  const trimmed = text.trim();

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    const opening = trimmed[index];
    if (opening !== "{" && opening !== "[") {
      continue;
    }

    const extracted = extractBalancedJson(trimmed, index);
    if (extracted) {
      return extracted;
    }
  }

  return trimmed;
}

function extractBalancedJson(text: string, startIndex: number): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      stack.push(character);
      continue;
    }

    if (character !== "}" && character !== "]") {
      continue;
    }

    const opening = stack.pop();
    const isMatchingPair =
      (opening === "{" && character === "}") ||
      (opening === "[" && character === "]");
    if (!isMatchingPair) {
      return null;
    }

    if (stack.length === 0) {
      return text.slice(startIndex, index + 1).trim();
    }
  }

  return null;
}

export function parseJsonResponse(text: string): unknown {
  return JSON.parse(extractJsonText(text));
}
