import React from "react";
import {
  Ban,
  CheckCircle2,
  Download,
  Edit3,
  Plus,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  TestTube2,
} from "lucide-react";

const providerRows = [
  {
    name: "Local Ollama",
    type: "OLLAMA",
    endpoint: "http://localhost:11434",
    model: "llama3:8b",
    status: "Active",
  },
  {
    name: "Cloud OpenAI",
    type: "OPENAI_COMPATIBLE",
    endpoint: "https://api.openai.example/v1",
    model: "gpt-4.1-mini",
    status: "Disabled",
  },
  {
    name: "Research Node",
    type: "OLLAMA",
    endpoint: "http://research-box:11434",
    model: "mistral:7b",
    status: "Testing",
  },
];

const modelRows = [
  { name: "llama3:8b", provider: "Local Ollama", params: "8B", status: "Ready" },
  { name: "mistral:7b", provider: "Local Ollama", params: "7B", status: "Pulling 45%" },
  { name: "nomic-embed-text", provider: "Research Node", params: "Embed", status: "Queued" },
];

const userRows = [
  { name: "Admin Operator", role: "ADMIN", status: "Active", sessions: 12 },
  { name: "Morgan Lee", role: "USER", status: "Active", sessions: 27 },
  { name: "Sam Carter", role: "USER", status: "Review", sessions: 4 },
];

const statusClass = (status: string) => {
  if (status === "Active" || status === "Ready") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Disabled" || status === "Review") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
};

const Dashboard: React.FC = () => {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active Providers", value: "2", detail: "1 disabled config" },
          { label: "Registered Models", value: "14", detail: "3 pending refresh" },
          { label: "User Accounts", value: "128", detail: "4 require review" },
          { label: "Inference Status", value: "Online", detail: "placeholder signal" },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">{item.value}</div>
            <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Active Provider Configs</h2>
            <p className="text-xs text-slate-500">Static preview for /api/admin/llm/providers.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Provider
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Provider Name</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Default Model</th>
                <th className="px-4 py-2 font-semibold">Endpoint</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {providerRows.map((provider) => (
                <tr key={provider.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{provider.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{provider.type}</td>
                  <td className="px-4 py-3 text-slate-700">{provider.model}</td>
                  <td className="max-w-64 truncate px-4 py-3 text-xs text-slate-500">{provider.endpoint}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(provider.status)}`}>
                      {provider.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100">
                        <TestTube2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Test
                      </button>
                      <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100">
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Model Registry & Pull Jobs</h2>
              <p className="text-xs text-slate-500">Provider-qualified model inventory preview.</p>
            </div>
            <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Model Name</th>
                  <th className="px-4 py-2 font-semibold">Provider</th>
                  <th className="px-4 py-2 font-semibold">Params</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelRows.map((model) => (
                  <tr key={`${model.provider}-${model.name}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{model.name}</td>
                    <td className="px-4 py-3 text-slate-700">{model.provider}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{model.params}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(model.status)}`}>
                        {model.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100">
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Pull
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">User Governance</h2>
              <p className="text-xs text-slate-500">Directory and access status preview.</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="divide-y divide-slate-100">
            {userRows.map((user) => (
              <div key={user.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{user.role}</span>
                    <span>{user.sessions} sessions</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(user.status)}`}>
                    {user.status}
                  </span>
                  <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100" aria-label={`Ban ${user.name}`}>
                    <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Access policy and ban controls are placeholders for a later admin implementation.
            </div>
          </div>
        </section>
      </div>

      <section className="grid gap-3 lg:grid-cols-3">
        {[
          { label: "Provider Configs", icon: ServerCog, text: "Create, test, disable, or soft-delete LLM provider configs." },
          { label: "User Directory", icon: ShieldCheck, text: "Search users, review roles, and inspect account status." },
          { label: "Access & Bans", icon: Ban, text: "Ban or reactivate accounts without viewing private chats." },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="rounded-md border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Icon className="h-4 w-4 text-cyan-700" aria-hidden="true" />
                {item.label}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.text}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default Dashboard;
