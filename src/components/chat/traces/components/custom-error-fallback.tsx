export const CustomErrorFallback = ({ error }: { error: Error }) => {
    return (
      <div role="alert" className="p-4 bg-red-100 text-red-700 rounded">
        <p>Something went wrong:</p>
        <pre>{error.message}</pre>
      </div>
    );
  };
  