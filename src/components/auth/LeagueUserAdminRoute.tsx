import { Outlet } from "react-router";
import { useAuth } from "../../context/AuthContext";

export default function LeagueUserAdminRoute({ platformOnly = false }: { platformOnly?: boolean }) {
  const { isPlatformAdmin, isAdmin, adminSetupPending } = useAuth();
  if (isPlatformAdmin || (adminSetupPending && isAdmin) || !platformOnly) return <Outlet />;
  return <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-800"><h1 className="text-xl font-bold dark:text-white">{platformOnly ? "Site administrator" : "Commissioner"} access required</h1><p className="mt-2 text-sm text-gray-500">Your account does not have access to this administration section.</p></div>;
}
