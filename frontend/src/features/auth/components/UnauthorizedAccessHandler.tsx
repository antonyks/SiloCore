import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const UnauthorizedAccessHandler: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const handleUnauthorizedAccess = () => {
      queryClient.setQueryData(["auth-user"], null);
      queryClient.clear();
      navigate("/login", { replace: true });
    };

    window.addEventListener("unauthorized-access", handleUnauthorizedAccess);

    return () => {
      window.removeEventListener("unauthorized-access", handleUnauthorizedAccess);
    };
  }, [navigate, queryClient]);

  return null;
};

export default UnauthorizedAccessHandler;
