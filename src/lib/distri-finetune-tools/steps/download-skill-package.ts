/**
 * Download Skill Package Tool
 *
 * Triggers a browser download of a previously generated skill package ZIP.
 * Must call generate_skill_package first to create the package.
 */

import type { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';
import { getPackageBlob, clearPackageBlob } from './generate-skill-package';

export const downloadSkillPackageHandler: ToolHandler = async (params) => {
  try {
    const { workflow_id, filename } = params;

    if (!workflow_id || typeof workflow_id !== 'string') {
      return { success: false, error: 'workflow_id is required' };
    }

    const blob = getPackageBlob(workflow_id);
    if (!blob) {
      return {
        success: false,
        error: 'No skill package found. Run generate_skill_package first.',
      };
    }

    // Trigger browser download
    const resolvedFilename =
      typeof filename === 'string' && filename.trim()
        ? filename.trim()
        : 'skill-package.zip';

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = resolvedFilename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    // Cleanup DOM + object URL
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 100);

    // Free memory
    clearPackageBlob(workflow_id);

    return {
      success: true,
      filename: resolvedFilename,
      size_bytes: blob.size,
      message: `Skill package downloaded as "${resolvedFilename}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download skill package',
    };
  }
};

export const downloadSkillPackageTool: DistriFnTool = {
  name: 'download_skill_package',
  description: `Download a previously generated skill package as a ZIP file.

Must call generate_skill_package first. Triggers a browser file download.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      workflow_id: { type: 'string', description: 'The workflow ID' },
      filename: {
        type: 'string',
        description: 'Filename for the download. Defaults to "skill-package.zip".',
      },
    },
    required: ['workflow_id'],
  },
  autoExecute: true,
  handler: async (input: object) =>
    JSON.stringify(
      await downloadSkillPackageHandler(input as Record<string, unknown>),
    ),
} as DistriFnTool;
