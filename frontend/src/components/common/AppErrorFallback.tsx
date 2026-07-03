import { useEffect } from "react";
import { logger } from "../../lib/logger";

interface AppErrorFallbackProps {
  error: unknown;
  resetErrorBoundary: () => void;
}

const AppErrorFallback=({ error, resetErrorBoundary }: AppErrorFallbackProps)=> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    useEffect(() => {
    logger.error('Unhandled error caught by ErrorBoundary', {
      message: errorMessage,
      stack: errorStack
    });
  }, [errorMessage, errorStack]);
        
  return (
    <div>
      <h2>Something went wrong</h2>
      <pre>{errorMessage}</pre>
      <button className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
       onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export default AppErrorFallback;
