import { useState } from "react";
import { createFrontendExtensionRegistry } from "./extensions/registry";
import { FrontendExtensionProvider } from "./extensions/FrontendExtensionProvider";
import type { FrontendExtensionRegistry } from "./extensions/types";
import "./App.css";
import AppRoutes from "./routes/AppRoutes";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "react-error-boundary";
import AppErrorFallback from "./components/common/AppErrorFallback";
import UnauthorizedAccessHandler from "./features/auth/components/UnauthorizedAccessHandler";

function App({ extensions }: { extensions?: FrontendExtensionRegistry }) {
  const [defaultRegistry] = useState(createFrontendExtensionRegistry);

  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <FrontendExtensionProvider registry={extensions || defaultRegistry}>
          <UnauthorizedAccessHandler />
          <AppRoutes />
        </FrontendExtensionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
