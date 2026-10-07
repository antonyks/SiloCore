import { useFrontendExtensions } from "../extensions/context";
import { extensionRoutePath } from "../extensions/registry";
import {
  AdminExtensionPage,
  WorkspaceExtensionPage,
} from "../extensions/ExtensionPage";
import { WorkspaceRouteProvider } from "../features/workspace/components/WorkspaceRouteProvider";
import React, { lazy, Suspense } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import Login from "../features/auth/pages/Login";
import NotFound from "../pages/NotFound";
import ProtectedRoute from "./ProtectedRoute";
import { UserRole } from "../types";
import { RootRedirect } from "./RootRedirect";
import { useAuth } from "../features/auth/hooks/useAuth";
import { getPersonalWorkspaceRoute } from "../lib/workspaceRouting";

const AdminLayout = lazy(() => import("../components/layout/AdminLayout"));
const Dashboard = lazy(() => import("../features/analytics/pages/Dashboard"));
const ProviderConfigsPage = lazy(
  () => import("../features/analytics/pages/ProviderConfigsPage"),
);
const ModelRegistryPage = lazy(
  () => import("../features/analytics/pages/ModelRegistryPage"),
);
const UserDirectoryPage = lazy(
  () => import("../features/analytics/pages/UserDirectoryPage"),
);
const UserAccessPage = lazy(
  () => import("../features/analytics/pages/UserAccessPage"),
);
const Home = lazy(() => import("../features/chat/pages/Home"));

const LegacyChatRedirect: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return <NotFound />;
  }

  const workspaceRoute = getPersonalWorkspaceRoute(user);

  return workspaceRoute ? (
    <Navigate to={workspaceRoute} replace />
  ) : (
    <NotFound />
  );
};

const AppRoutes: React.FC = () => {
  const extensions = useFrontendExtensions();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
          Loading...
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]} />}>
          <Route element={<AdminLayout />}>
            <Route path="/analytics/dashboard" element={<Dashboard />} />
            <Route
              path="/admin/llm/providers"
              element={<ProviderConfigsPage />}
            />
            <Route path="/admin/llm/models" element={<ModelRegistryPage />} />
            <Route path="/admin/users" element={<UserDirectoryPage />} />
            <Route path="/admin/users/access" element={<UserAccessPage />} />
            {extensions.flatMap((extension) =>
              (extension.routes || [])
                .filter((route) => route.scope === "admin")
                .map((route) => (
                  <Route
                    key={`${extension.id}/${route.id}`}
                    path={extensionRoutePath(extension.id, route)}
                    element={
                      <AdminExtensionPage
                        extensionId={extension.id}
                        routeId={route.id}
                      />
                    }
                  />
                )),
            )}
            <Route path="/admin/extensions/*" element={<NotFound />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute allowedRoles={[UserRole.USER]} />}>
          <Route path="/chat/home" element={<LegacyChatRedirect />} />
          <Route
            path="/workspaces/:workspaceId"
            element={<WorkspaceRouteProvider />}
          >
            <Route path="chat/home" element={<Home />} />
            {extensions.flatMap((extension) =>
              (extension.routes || [])
                .filter((route) => route.scope === "workspace")
                .map((route) => (
                  <Route
                    key={`${extension.id}/${route.id}`}
                    path={`extensions/${extension.id}/${route.path}`}
                    element={
                      <WorkspaceExtensionPage
                        extensionId={extension.id}
                        routeId={route.id}
                      />
                    }
                  />
                )),
            )}
            <Route path="extensions/*" element={<NotFound />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
