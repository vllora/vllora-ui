import type { FallbackProps } from 'react-error-boundary';

export const CustomErrorFallback = ({ error }: FallbackProps) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div role="alert" className="p-4 bg-red-100 text-red-700 rounded">
        <p>Something went wrong:</p>
        <pre>{errorMessage}</pre>
      </div>
    );
  };
  