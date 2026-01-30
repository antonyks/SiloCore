import { useEffect } from "react";
import { logger } from "../../lib/logger";

const AppErrorFallback=({ error, resetErrorBoundary }: any)=> {

    useEffect(() => {
    logger.error('Unhandled error caught by ErrorBoundary', {
      message: error?.message,
      stack: error?.stack
    });
  }, [error]);
        
  return (
    <div>
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
       onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export default AppErrorFallback;
