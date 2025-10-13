import React from 'react';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { tryParseJson } from '@/utils/modelUtils';
import { getBackendUrl } from '@/config/api';
import { CodeBlock } from './CodeBlock';

interface CodeViewProps {
  runId: string;
}

export const TraceCodeView: React.FC<CodeViewProps> = ({ runId }) => {
  const { spanMap } = ChatWindowConsumer();
  const spans = spanMap[runId] || [];
  const cloudSpan = spans && spans.length > 0 ? spans[0] : undefined 
  const apiInvokeSpans = spans.filter(s => s.operation_name === 'api_invoke')
  const apiInvokeSpan = apiInvokeSpans[apiInvokeSpans.length - 1]
  const cloudAttribute = cloudSpan?.attribute as {
    [key: string]: any;
  };
  const apiInvokeAttribute = apiInvokeSpan?.attribute as {
    [key: string]: any;
  };
  // header 
  const headerStr = cloudAttribute && cloudAttribute['http.request.header'];
  const method: string = cloudAttribute && cloudAttribute['http.request.method'] || 'POST';
  const apiCloudBody:string = cloudAttribute && cloudAttribute['http.request.body'] || '';
  const url: string = cloudAttribute && cloudAttribute['http.request.path'] || '/v1/chat/completions';

  const fullUrl = `${getBackendUrl()}${url}`

  const requestStr: string = apiInvokeAttribute && apiInvokeAttribute['request'] || '';
  const headerObj: any = headerStr && tryParseJson(headerStr)
  const requestObj: any = (apiCloudBody || requestStr) && tryParseJson(apiCloudBody || requestStr) || undefined

  // Generate curl command
  const generateCurlCommand = () => {
    if (!requestObj && !headerObj) {
      return '# No request data available';
    }

    const lines = [`curl -X ${method} \\`];
    lines.push(`  '${fullUrl}' \\`);

    // Add headers
    if (headerObj) {
      const filteredHeaders = Object.entries(headerObj).filter(h => {
        const validHeaders = ["x-project-id", 'x-thread-id', 'x-tag', 'x-thread-title', 'content-type', 'authorization', 'Authorization']
        return validHeaders.includes(h[0].toLowerCase())
      });

      filteredHeaders.forEach(([key, value], idx) => {
        const isLast = idx === filteredHeaders.length - 1 && (!requestObj || method === 'GET');
        lines.push(`  -H '${key}: ${value}'${isLast ? '' : ' \\'}`);
      });
    }
    // Add request body
    if ((requestObj) && method !== 'GET') {
      lines.push(`  -d '{`);
      const bodyStr = JSON.stringify(requestObj, null, 2).replace(/'/g, "'\\''");
      // Skip first and last lines (the outer braces)
      const bodyLines = bodyStr.split('\n');
      bodyLines.slice(1, -1).forEach((line) => {
        lines.push(`  ${line}`);
      });
      lines.push(`  }'`);
    }

    return lines.join('\n');
  };

  const curlCommand = generateCurlCommand();

  return (
    <div className="p-4">
      <div className="space-y-4">
        <CodeBlock title="cURL" code={curlCommand} language="bash" />
      </div>
    </div>
  );
};
