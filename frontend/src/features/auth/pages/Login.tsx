import React from "react";
import { zodResolver } from '@hookform/resolvers/zod';
import { Card } from "../../../components/ui/Card";
import { useLogin } from "../hooks/useAuth";
import { schema, type FormValues } from "../types";
import { useForm } from "react-hook-form";




const Login: React.FC = () => {
  const { mutate, isPending, error } = useLogin();

  const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<FormValues>({
  resolver: zodResolver(schema),
});

  const onSubmit = async (data: FormValues) => {
    mutate(data);
  };
  const serverErrorMessage = (error as any)?.response?.data?.message || error?.message;

  return (
    <div className="flex min-h-screen min-w-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8 bg-gray-100">
      <Card  className="w-full max-w-md space-y-8 border-2 border-gray-200" radius="3xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Insight Base
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)} >
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{serverErrorMessage|| "Login failed"}</div>
            </div>
          )}
          <div className="">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                autoComplete="email"
                {...register("email")}
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                placeholder="Email address"
              />
              <div className="mt-1 ml-1 min-h-[25px] text-left"> 
              {errors.email && <span className="text-red-700 rounded-md w-full align-left">{errors.email.message}</span>}
              </div>
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                {...register("password")}
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                placeholder="Password"
              />
              <div className="mt-1  ml-1 min-h-[25px] text-left"> 
              {errors.password && <span className="text-red-700 rounded-md w-full">{errors.password.message}</span>}
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isPending}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              {isPending ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Login;
