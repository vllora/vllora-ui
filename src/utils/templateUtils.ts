/**
 * Normalize content to string for UI editing
 * Handles string, array (converts to JSON), null/undefined
 */
export function normalizeContentToString(
  content: string | unknown[] | null | undefined
): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return JSON.stringify(content, null, 2);
  return String(content);
}

/**
 * Apply Mustache-style variable substitution ({{variableName}})
 * Recursively replaces variables in strings, arrays, and objects
 */
export function applyMustacheVariables(
  value: unknown,
  variables: Record<string, string>
): unknown {
  if (!variables || Object.keys(variables).length === 0) {
    return value;
  }

  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyMustacheVariables(item, variables));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = applyMustacheVariables(val, variables);
    }
    return result;
  }

  return value;
}
