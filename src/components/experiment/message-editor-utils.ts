import type { MessageContentPart } from "@/hooks/useExperiment";

export type EditorMode = "plain" | "markdown" | "structured";

// Detect if content is structured (array or JSON array string)
export function isStructuredContent(
  content: string | MessageContentPart[]
): boolean {
  if (Array.isArray(content)) return true;
  if (typeof content !== "string") return false;
  const trimmed = content.trim();
  if (!trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

// Default template for structured content
export const STRUCTURED_CONTENT_TEMPLATE = JSON.stringify(
  [{ type: "text", text: "" }],
  null,
  2
);

// Convert plain text to structured format
export function toStructuredContent(plainText: string): string {
  const trimmed = plainText.trim();
  if (trimmed) {
    return JSON.stringify([{ type: "text", text: trimmed }], null, 2);
  }
  return STRUCTURED_CONTENT_TEMPLATE;
}

// Check if structured content has non-text parts (like images)
export function hasNonTextParts(
  content: string | MessageContentPart[]
): boolean {
  try {
    const parsed = Array.isArray(content) ? content : JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.some(
        (part: MessageContentPart) => part.type !== "text"
      );
    }
  } catch {
    // If parsing fails, assume no non-text parts
  }
  return false;
}

// Extract plain text from structured content
// If content has non-text parts (images, etc.), returns the JSON string as-is to preserve data
export function fromStructuredContent(
  content: string | MessageContentPart[]
): string {
  try {
    const parsed = Array.isArray(content) ? content : JSON.parse(content);
    if (Array.isArray(parsed)) {
      // If there are non-text parts (like images), keep the JSON string as-is
      if (parsed.some((part: MessageContentPart) => part.type !== "text")) {
        return typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2);
      }
      const textParts = parsed
        .filter(
          (part: MessageContentPart) =>
            part.type === "text" && typeof part.text === "string"
        )
        .map((part: MessageContentPart) => part.text);
      return textParts.join("\n");
    }
  } catch {
    // If parsing fails, return as-is
  }
  return typeof content === "string" ? content : JSON.stringify(content);
}

// Handle mode change and return the converted content (or null if no conversion needed)
export function convertContentForModeChange(
  currentContent: string | MessageContentPart[],
  currentContentAsString: string,
  isCurrentlyStructured: boolean,
  newMode: EditorMode
): string | null {
  if (newMode === "structured" && !isCurrentlyStructured) {
    // Switch to structured: convert plain text to structured format
    return toStructuredContent(currentContentAsString);
  } else if (newMode !== "structured" && isCurrentlyStructured) {
    // Switch from structured to plain/markdown: extract text content
    return fromStructuredContent(currentContent);
  }
  return null; // No conversion needed
}

// Convert a File to base64 data URL
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Supported image MIME types (based on backend restrictions)
const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

// Check if a file is a supported image (png, jpeg, gif, webp)
export function isImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(file.type);
}

// Check if a file is an audio file (wav or mp3)
export function isAudioFile(file: File): boolean {
  return file.type === "audio/wav" || file.type === "audio/mpeg" || file.type === "audio/mp3";
}

// Get audio format from file type
export function getAudioFormat(file: File): "wav" | "mp3" {
  return file.type === "audio/wav" ? "wav" : "mp3";
}

// Convert a File to raw base64 (without data URL prefix) - used for audio
export function fileToBase64Raw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/wav;base64,")
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Add an image to structured content (returns JSON string)
export function addImageToContent(
  currentContent: string | MessageContentPart[],
  imageBase64Url: string
): string {
  let contentParts: MessageContentPart[] = [];

  // Parse existing content if structured
  if (Array.isArray(currentContent)) {
    contentParts = [...currentContent];
  } else if (typeof currentContent === "string") {
    const trimmed = currentContent.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          contentParts = parsed;
        }
      } catch {
        // Not valid JSON, treat as plain text
        if (trimmed) {
          contentParts = [{ type: "text", text: trimmed }];
        }
      }
    } else if (trimmed) {
      // Plain text content - convert to structured
      contentParts = [{ type: "text", text: trimmed }];
    }
  }

  // Add the new image part
  contentParts.push({
    type: "image_url",
    image_url: { url: imageBase64Url },
  });

  return JSON.stringify(contentParts, null, 2);
}

// Add an audio to structured content (returns JSON string)
export function addAudioToContent(
  currentContent: string | MessageContentPart[],
  audioBase64Data: string,
  format: "wav" | "mp3"
): string {
  let contentParts: MessageContentPart[] = [];

  // Parse existing content if structured
  if (Array.isArray(currentContent)) {
    contentParts = [...currentContent];
  } else if (typeof currentContent === "string") {
    const trimmed = currentContent.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          contentParts = parsed;
        }
      } catch {
        // Not valid JSON, treat as plain text
        if (trimmed) {
          contentParts = [{ type: "text", text: trimmed }];
        }
      }
    } else if (trimmed) {
      // Plain text content - convert to structured
      contentParts = [{ type: "text", text: trimmed }];
    }
  }

  // Add the new audio part
  contentParts.push({
    type: "input_audio",
    input_audio: { data: audioBase64Data, format },
  });

  return JSON.stringify(contentParts, null, 2);
}

// Add a generic file to structured content (returns JSON string)
export function addFileToContent(
  currentContent: string | MessageContentPart[],
  fileBase64Data: string,
  filename: string
): string {
  let contentParts: MessageContentPart[] = [];

  // Parse existing content if structured
  if (Array.isArray(currentContent)) {
    contentParts = [...currentContent];
  } else if (typeof currentContent === "string") {
    const trimmed = currentContent.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          contentParts = parsed;
        }
      } catch {
        // Not valid JSON, treat as plain text
        if (trimmed) {
          contentParts = [{ type: "text", text: trimmed }];
        }
      }
    } else if (trimmed) {
      // Plain text content - convert to structured
      contentParts = [{ type: "text", text: trimmed }];
    }
  }

  // Add the new file part
  contentParts.push({
    type: "file",
    file: { file_data: fileBase64Data, filename },
  });

  return JSON.stringify(contentParts, null, 2);
}

// Attachment type for preview
export interface Attachment {
  type: "image" | "audio" | "file";
  index: number;
  // For images
  url?: string;
  // For audio
  format?: "wav" | "mp3";
  // For files
  filename?: string;
}

// Extract attachments from content for preview
export function extractAttachments(
  content: string | MessageContentPart[]
): Attachment[] {
  const attachments: Attachment[] = [];

  try {
    const parsed = Array.isArray(content) ? content : JSON.parse(content);
    if (!Array.isArray(parsed)) return attachments;

    parsed.forEach((part: MessageContentPart, index: number) => {
      if (part.type === "image_url" && part.image_url?.url) {
        attachments.push({
          type: "image",
          index,
          url: part.image_url.url,
        });
      } else if (part.type === "input_audio" && part.input_audio) {
        attachments.push({
          type: "audio",
          index,
          format: part.input_audio.format,
        });
      } else if (part.type === "file" && part.file) {
        attachments.push({
          type: "file",
          index,
          filename: part.file.filename,
        });
      }
    });
  } catch {
    // Not valid JSON, no attachments
  }

  return attachments;
}

// Remove an attachment from content by index
export function removeAttachment(
  content: string | MessageContentPart[],
  attachmentIndex: number
): string {
  try {
    const parsed = Array.isArray(content) ? content : JSON.parse(content);
    if (!Array.isArray(parsed)) return typeof content === "string" ? content : JSON.stringify(content);

    const filtered = parsed.filter((_, index) => index !== attachmentIndex);

    // If only text parts remain and there's just one, convert back to plain text
    if (filtered.length === 1 && filtered[0].type === "text") {
      return filtered[0].text || "";
    }

    // If no parts remain, return empty text template
    if (filtered.length === 0) {
      return JSON.stringify([{ type: "text", text: "" }], null, 2);
    }

    return JSON.stringify(filtered, null, 2);
  } catch {
    return typeof content === "string" ? content : JSON.stringify(content);
  }
}
