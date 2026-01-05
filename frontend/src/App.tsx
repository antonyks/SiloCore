import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import { AppProvider } from "./contexts/AppContext";

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="app flex flex-col items-center justify-center min-h-screen">
          <Routes>
            <Route path="/*" element={<AppRoutes />} />
          </Routes>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
