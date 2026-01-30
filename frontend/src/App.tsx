import "./App.css";
import AppRoutes from "./routes/AppRoutes";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "react-error-boundary";
import AppErrorFallback from "./components/common/AppErrorFallback";

function App() {

  return (
     <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <QueryClientProvider client={queryClient}>
     
      <AppRoutes />
      
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
