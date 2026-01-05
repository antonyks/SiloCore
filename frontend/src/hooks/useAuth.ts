import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";

export const useAuth = () => {
  const context = useContext(AppContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AppProvider");
  }

  return {
    isAuthenticated: !!context.user,
    user: context.user,
    loading: context.loading,
  };
};
