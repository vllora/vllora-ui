import React from 'react';
import { JsonViewer } from '../../traces/TraceRow/span-info/JsonViewer';
import { ContentTypeBadge } from '../ContentTypeBadge';

interface JsonContentProps {
  data: object;
  showBadge?: boolean;
}

export const JsonContent: React.FC<JsonContentProps> = ({
  data,
  showBadge = false,
}) => (
  <div className={showBadge ? "pl-3 border-l-2 border-amber-400/30" : ""}>
    {showBadge && (
      <div className="mb-2">
        <ContentTypeBadge type="json" />
      </div>
    )}
    <JsonViewer data={data} collapsed={10} />
  </div>
);
