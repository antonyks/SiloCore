import { storage } from "./storage";

export const logoutAndRedirect = () => {
  storage.clear();

  window.dispatchEvent(new Event("unauthorized-access"));
};
