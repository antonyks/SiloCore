import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "../../../components/ui/Card";
import { useLogin } from "../hooks/useAuth";
import { schema, type FormValues } from "../types";
import { useForm } from "react-hook-form";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";

const Login: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
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
  const serverErrorMessage = axios.isAxiosError(error)
    ? error.response?.data?.message
    : error?.message;

  return (
    <div className="flex min-h-screen min-w-screen items-center justify-center bg-gray-100 px-4 py-10 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md space-y-8 border-2 border-gray-200" radius="3xl">
        <div className="text-center">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            SiloCore
          </h2>
          <p className="mt-2 text-sm text-gray-600">Sign in to your account</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{serverErrorMessage || "Login failed"}</div>
            </div>
          )}
          <div className="">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                autoComplete="email"
                {...register("email")}
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                placeholder="Email address"
              />
              <div className="mt-1 ml-1 min-h-[25px] text-left">
                {errors.email && (
                  <span className="w-full rounded-md text-red-700">{errors.email.message}</span>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none sm:text-sm"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="mt-1 ml-1 min-h-[25px] text-left">
                {errors.password && (
                  <span className="w-full rounded-md text-red-700">
                    {errors.password.message}
                  </span>
                )}
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
