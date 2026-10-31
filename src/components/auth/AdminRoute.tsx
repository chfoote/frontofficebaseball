import { Navigate, Outlet } from "react-router";
import { useAuth } from "../../context/AuthContext";

export default function AdminRoute() {
  const { isAdmin, loading, session } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signin" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Admin access required
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          This page is only available to league admins.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
