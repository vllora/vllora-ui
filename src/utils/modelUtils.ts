export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export const tryParseJson = (str: string) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return undefined;
  }
}

export const tryParseFloat = (str: string) => {
  try {
    return parseFloat(str);
  } catch (e) {
    return undefined;
  }
}

export const tryParseInt = (str: string) => {
  try {
    return parseInt(str);
  } catch (e) {
    return undefined;
  }
}

export const getModelTypeDisplayName = (type: string) => {
  switch (type) {
    case 'image_generation':
      return 'Image Generation';
    case 'chat':
      return 'Chat';
    case 'completion':
      return 'Completion';
    case 'embedding':
      return 'Embedding';
    case 'moderation':
      return 'Moderation';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

/**
 * Extract displayable output from raw API response.
 * - If single choice with content and no tool calls, returns just the content string
 * - If has tool calls or multiple choices, returns the full message JSON
 * - Fallback to entire response JSON
 */
export const extractOutput = (rawOutput: unknown): string => {
  if (!rawOutput) return "";

  try {
    const outputStr =
      typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
    const outputObj = JSON.parse(outputStr);

    const message = outputObj.choices?.[0]?.message;
    const hasToolCalls = message?.tool_calls?.length > 0;
    const hasSingleChoiceWithContent =
      outputObj.choices?.length === 1 && message?.content;

    // Simple content without tool calls - show just the content
    if (hasSingleChoiceWithContent && !hasToolCalls) {
      return message.content;
    }
    // Multiple choices or has tool calls - show the full message JSON
    if (outputObj.choices?.length >= 1) {
      return JSON.stringify(message, null, 2);
    }
    // Fallback - show entire response
    return JSON.stringify(outputObj, null, 2);
  } catch {
    return typeof rawOutput === "string"
      ? rawOutput
      : JSON.stringify(rawOutput);
  }
}