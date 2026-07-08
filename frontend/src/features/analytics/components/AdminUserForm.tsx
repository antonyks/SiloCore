import { zodResolver } from "@hookform/resolvers/zod";
import { Save, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { AdminUser, AdminUserCreateInput, AdminUserUpdateInput } from "../types";

const buildUserFormSchema = (isEditing: boolean) =>
  z.object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email("Valid email is required"),
    password: isEditing
      ? z.string()
      : z.string().min(6, "Password must be at least 6 characters long"),
  });

type UserFormValues = z.infer<ReturnType<typeof buildUserFormSchema>>;

interface AdminUserFormProps {
  user: AdminUser | null;
  isSubmitting: boolean;
  serverError?: string;
  onCancel: () => void;
  onSubmit: (input: AdminUserCreateInput | AdminUserUpdateInput) => void;
}

const inputClassName =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100";

const errorClassName = "mt-1 min-h-4 text-xs text-red-700";

const buildDefaultValues = (user: AdminUser | null): UserFormValues => ({
  name: user?.name ?? "",
  email: user?.email ?? "",
  password: "",
});

const toUserInput = (
  values: UserFormValues,
  user: AdminUser | null,
): AdminUserCreateInput | AdminUserUpdateInput => {
  const baseInput = {
    name: values.name.trim(),
    email: values.email.trim(),
  };

  if (user) {
    return baseInput;
  }

  return {
    ...baseInput,
    password: values.password,
  };
};

const AdminUserForm: React.FC<AdminUserFormProps> = ({
  user,
  isSubmitting,
  serverError,
  onCancel,
  onSubmit,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(buildUserFormSchema(Boolean(user))),
    defaultValues: buildDefaultValues(user),
  });

  return (
    <form
      className="rounded-md border border-slate-200 bg-white"
      onSubmit={handleSubmit((values) => onSubmit(toUserInput(values, user)))}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">
            {user ? "Edit User" : "Create User"}
          </h2>
          <p className="text-xs text-slate-500">
            User management never exposes chat contents.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Cancel
        </button>
      </div>

      {serverError && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
          {serverError}
        </div>
      )}

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Name</span>
          <input className={inputClassName} {...register("name")} disabled={isSubmitting} />
          <div className={errorClassName}>{errors.name?.message}</div>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Email</span>
          <input
            className={inputClassName}
            type="email"
            autoComplete="email"
            {...register("email")}
            disabled={isSubmitting}
          />
          <div className={errorClassName}>{errors.email?.message}</div>
        </label>

        {!user && (
          <label className="block lg:col-span-2">
            <span className="text-xs font-medium text-slate-700">Initial Password</span>
            <input
              className={inputClassName}
              type="password"
              autoComplete="new-password"
              {...register("password")}
              disabled={isSubmitting}
            />
            <div className={errorClassName}>{errors.password?.message}</div>
          </label>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? "Saving..." : "Save User"}
        </button>
      </div>
    </form>
  );
};

export default AdminUserForm;
