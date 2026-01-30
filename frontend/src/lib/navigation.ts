export const logoutAndRedirect = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  window.dispatchEvent(new Event("unauthorized-access"));
};