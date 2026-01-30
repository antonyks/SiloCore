import "./App.css";
import AppRoutes from "./routes/AppRoutes";
import { AppProvider } from "./contexts/AppContext";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "react-error-boundary";
import AppErrorFallback from "./components/common/AppErrorFallback";

function App() {

  return (
     <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <QueryClientProvider client={queryClient}>
    <AppProvider>
     
      <AppRoutes />
      
    </AppProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
