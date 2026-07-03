import { Link } from "react-router-dom";
import { ArrowRight, LayoutDashboard } from "lucide-react";

interface AdminPlaceholderPageProps {
  title: string;
  description: string;
}

const AdminPlaceholderPage: React.FC<AdminPlaceholderPageProps> = ({ title, description }) => {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="rounded-md border border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Admin Section
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <Link
            to="/analytics/dashboard"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Overview
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default AdminPlaceholderPage;
