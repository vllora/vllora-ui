/**
 * useFileAttachments
 *
 * Manages file attachments for chat input.
 * Supports images, PDFs, and document files.
 * Handles base64 conversion and cleanup of blob URLs.
 */

import { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface AttachedFile {
  /** Unique identifier */
  id: string;
  /** Original file object */
  file: File;
  /** Blob URL for preview (images only) */
  preview: string;
  /** Base64 encoded content */
  base64: string;
  /** MIME type */
  mimeType: string;
  /** File name */
  name: string;
}

/**
 * Alias for backwards compatibility with LucyChatInput.
 * AttachedImage and AttachedFile are structurally identical.
 */
export type AttachedImage = AttachedFile;

export interface UseFileAttachmentsOptions {
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Accepted file types (for validation) */
  acceptedTypes?: string[];
}

export interface UseFileAttachmentsReturn {
  /** Currently attached files */
  files: AttachedFile[];
  /** Add files to attachments */
  addFiles: (files: FileList | File[]) => Promise<void>;
  /** Remove a file by ID */
  removeFile: (id: string) => void;
  /** Clear all files */
  clearFiles: () => void;
  /** Check if a file type is accepted */
  isAcceptedFile: (file: File) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_ACCEPTED_TYPES = [
  'image/*',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
];

const DEFAULT_MAX_FILES = 10;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a unique ID for a file
 */
function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 11);
}

/**
 * Read file as base64
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Check if file matches accepted types
 */
function matchesAcceptedType(file: File, acceptedTypes: string[]): boolean {
  return acceptedTypes.some((type) => {
    if (type.endsWith('/*')) {
      // Wildcard match (e.g., "image/*")
      const prefix = type.slice(0, -2);
      return file.type.startsWith(prefix);
    }
    if (type.startsWith('.')) {
      // Extension match (e.g., ".pdf")
      return file.name.toLowerCase().endsWith(type.toLowerCase());
    }
    // Exact MIME type match
    return file.type === type;
  });
}

// ============================================================================
// Hook
// ============================================================================

export function useFileAttachments({
  maxFiles = DEFAULT_MAX_FILES,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
}: UseFileAttachmentsOptions = {}): UseFileAttachmentsReturn {
  const [files, setFiles] = useState<AttachedFile[]>([]);

  // Check if a file type is accepted
  const isAcceptedFile = useCallback(
    (file: File): boolean => {
      return matchesAcceptedType(file, acceptedTypes);
    },
    [acceptedTypes]
  );

  // Add files to attachments
  const addFiles = useCallback(
    async (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles).filter(isAcceptedFile);

      // Limit to max files
      const availableSlots = maxFiles - files.length;
      const filesToAdd = fileArray.slice(0, availableSlots);

      const attachedFiles: AttachedFile[] = [];

      for (const file of filesToAdd) {
        const id = generateId();
        const preview = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : '';
        const base64 = await readFileAsBase64(file);

        attachedFiles.push({
          id,
          file,
          preview,
          base64,
          mimeType: file.type || 'application/octet-stream',
          name: file.name,
        });
      }

      setFiles((prev) => [...prev, ...attachedFiles]);
    },
    [files.length, maxFiles, isAcceptedFile]
  );

  // Remove a file by ID
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file && file.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Clear all files
  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      return [];
    });
  }, []);

  return {
    files,
    addFiles,
    removeFile,
    clearFiles,
    isAcceptedFile,
  };
}

export default useFileAttachments;
