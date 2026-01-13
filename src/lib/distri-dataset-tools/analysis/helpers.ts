/**
 * Analysis Tools Helpers
 *
 * Shared helper functions for analysis tools.
 */

import { DataInfo } from '@/types/dataset-types';

/**
 * Extract a summary of the input from a record
 */
export function getInputSummary(data: unknown): string {
  try {
    const dataInfo = data as DataInfo;
    if (dataInfo?.input?.messages && Array.isArray(dataInfo.input.messages)) {
      const userMessages = dataInfo.input.messages.filter(
        (m: any) => m.role === 'user'
      );
      const lastUser = userMessages[userMessages.length - 1];
      if (lastUser?.content) {
        const content =
          typeof lastUser.content === 'string'
            ? lastUser.content
            : JSON.stringify(lastUser.content);
        return content.slice(0, 200) + (content.length > 200 ? '...' : '');
      }
    }
    const str = JSON.stringify(data);
    return str.slice(0, 200) + (str.length > 200 ? '...' : '');
  } catch {
    return '(unable to extract input)';
  }
}

/**
 * Extract a summary of the output from a record
 */
export function getOutputSummary(data: unknown): string {
  try {
    const dataInfo = data as DataInfo;
    if (dataInfo?.output?.messages) {
      const msg = Array.isArray(dataInfo.output.messages)
        ? dataInfo.output.messages[0]
        : dataInfo.output.messages;
      const content = (msg as any)?.content;
      if (content) {
        const str = typeof content === 'string' ? content : JSON.stringify(content);
        return str.slice(0, 200) + (str.length > 200 ? '...' : '');
      }
    }
    if (dataInfo?.output?.tool_calls) {
      return `Tool calls: ${JSON.stringify(dataInfo.output.tool_calls).slice(0, 150)}...`;
    }
    const str = JSON.stringify(data);
    return str.slice(0, 200) + (str.length > 200 ? '...' : '');
  } catch {
    return '(unable to extract output)';
  }
}

/**
 * Calculate simple similarity between two strings (Jaccard index)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Extract keywords from content for topic suggestion
 */
export function extractKeywords(content: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
    'just', 'don', 'now', 'i', 'me', 'my', 'you', 'your', 'he', 'she',
    'it', 'we', 'they', 'this', 'that', 'these', 'those', 'what',
  ]);

  const words = content.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  const freq: Record<string, number> = {};
  words.forEach((w) => {
    freq[w] = (freq[w] || 0) + 1;
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}
