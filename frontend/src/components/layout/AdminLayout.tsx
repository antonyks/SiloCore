import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  ChevronLeft,
  ChevronRight,
  Database,
  Gauge,
  ListChecks,
  Server,
  Settings2,
  ShieldBan,
  Users,
} from "lucide-react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useAdminSystemStatus } from "../../features/analytics/hooks/useAdminDashboard";
import UserProfileDropdown from "../ui/UserProfileDropdown";

const navGroups = [
  {
    label: "Dashboard / Stats",
    icon: BarChart3,
    href: "/analytics/dashboard",
  },
  {
    label: "LLM Providers",
    icon: Bot,
    href: "/admin/llm/providers",
    children: [
      { label: "Provider Configs", icon: Settings2, href: "/admin/llm/providers" },
      { label: "Model Registry", icon: ListChecks, href: "/admin/llm/models" },
    ],
  },
  {
    label: "User Governance",
    icon: Users,
    href: "/admin/users",
    children: [
      { label: "User Directory", icon: Users, href: "/admin/users" },
      { label: "Access & Bans", icon: ShieldBan, href: "/admin/users/access" },
    ],
  },
];

const routeLabels = [
  { path: "/analytics/dashboard", label: "Dashboard / Stats", section: "Overview" },
  { path: "/admin/llm/providers", label: "Provider Configs", section: "LLM Providers" },
  { path: "/admin/llm/models", label: "Model Registry", section: "LLM Providers" },
  { path: "/admin/users", label: "User Directory", section: "User Governance" },
  { path: "/admin/users/access", label: "Access & Bans", section: "User Governance" },
];

const getRouteLabel = (pathname: string) =>
  routeLabels.find((route) => route.path === pathname) || {
    label: "Admin",
    section: "Console",
  };

const isNavItemActive = (
  pathname: string,
  item: (typeof navGroups)[number],
) => pathname === item.href || item.children?.some((child) => child.href === pathname);

const mobileNavItems = navGroups.flatMap((item) => item.children || [item]);

const AdminLayout: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const systemStatusQuery = useAdminSystemStatus();
  const location = useLocation();
  const activeRoute = getRouteLabel(location.pathname);
  const systemStatus = systemStatusQuery.data;
  const databaseIsOnline = systemStatus?.database.status === "online";
  const inferenceStatus = systemStatus?.inference.status;
  const inferenceIsOnline = inferenceStatus === "online";
  const inferenceNeedsReview = inferenceStatus === "review";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-slate-950 text-slate-100 transition-all duration-200 md:flex md:flex-col ${
            isSidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          <div className="flex h-14 items-center gap-3 border-b border-slate-800 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-500 text-slate-950">
              <Gauge className="h-4 w-4" aria-hidden="true" />
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">SiloCore Admin</div>
                <div className="truncate text-xs text-slate-400">Control console</div>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Admin navigation">
            {!isSidebarCollapsed && (
              <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Navigation
              </div>
            )}
            <div className="space-y-1">
              {navGroups.map((item) => {
                const Icon = item.icon;
                const isActive = isNavItemActive(location.pathname, item);

                return (
                  <div key={item.label}>
                    <Link
                      to={item.href}
                      title={isSidebarCollapsed ? item.label : undefined}
                      className={`flex h-9 items-center gap-3 rounded-md px-2 text-sm font-medium hover:bg-slate-800 hover:text-white ${
                        isActive ? "bg-slate-800 text-white" : "text-slate-200"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                    {!isSidebarCollapsed && item.children && (
                      <div className="ml-4 mt-1 space-y-1 border-l border-slate-800 pl-3">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;

                          return (
                            <Link
                              key={child.label}
                              to={child.href}
                              className={`flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium hover:bg-slate-800 hover:text-slate-100 ${
                                location.pathname === child.href
                                  ? "bg-slate-800 text-slate-100"
                                  : "text-slate-400"
                              }`}
                            >
                              <ChildIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-slate-800 p-2">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md px-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Collapse Sidebar</span>
                </>
              )}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Home</span>
                <span>/</span>
                <span>Admin</span>
                <span>/</span>
                <span className="truncate">{activeRoute.section}</span>
                <span>/</span>
                <span className="truncate text-slate-700">{activeRoute.label}</span>
              </div>
              <h1 className="truncate text-base font-semibold text-slate-950">{activeRoute.label}</h1>
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 sm:flex">
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              Inference monitor
            </div>
            <UserProfileDropdown user={user} />
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden px-3 py-4 sm:px-5 lg:px-6">
            <div className="mb-4 flex gap-2 overflow-x-auto md:hidden" aria-label="Admin mobile navigation">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;

                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-medium ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <Outlet />
          </main>

          <footer className="sticky bottom-0 z-10 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Database
                  className={`h-3.5 w-3.5 ${databaseIsOnline ? "text-emerald-600" : "text-red-600"}`}
                  aria-hidden="true"
                />
                Database: {systemStatusQuery.isLoading ? "Checking" : databaseIsOnline ? "Connected" : "Review"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                Backend: {systemStatus?.backend.status === "online" ? "Online" : "Checking"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Activity
                  className={`h-3.5 w-3.5 ${
                    inferenceIsOnline
                      ? "text-emerald-600"
                      : inferenceNeedsReview
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                  aria-hidden="true"
                />
                Inference:{" "}
                {systemStatusQuery.isLoading
                  ? "Checking"
                  : inferenceIsOnline
                    ? "Online"
                    : inferenceNeedsReview
                      ? "Review"
                      : "Offline"}
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
