import React from 'react';
import { Code2 } from 'lucide-react';

interface ClientSdkIconProps {
  client_name: string;
  className?: string;
}

/**
 * Icon component for client SDKs
 * TODO: Add specific icons for different SDKs (Python, JavaScript, etc.)
 */
export const ClientSdkIcon: React.FC<ClientSdkIconProps> = ({ className }) => {
  // For now, return a generic code icon
  // In the future, you can map client_name to specific icons
  return <Code2 className={className} />;
};
