import { storage } from "./storage";

const tokenErrorMessages = [
  "jwt expired",
  "jwt malformed",
  "invalid jwt token",
  "invalid signature",
  "invalid or expired jwt token",
];

export const isAuthSessionError = (status?: number, message?: string): boolean => {
  if (status === 401) {
    return true;
  }

  if (!message) {
    return false;
  }

  const normalizedMessage = message.toLowerCase();

  return tokenErrorMessages.some((tokenErrorMessage) =>
    normalizedMessage.includes(tokenErrorMessage),
  );
};

export const logoutAndRedirect = () => {
  storage.clear();

  window.dispatchEvent(new Event("unauthorized-access"));
};
