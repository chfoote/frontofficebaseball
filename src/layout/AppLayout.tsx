import LeagueCoreWorkspace from "../pages/League/LeagueCoreWorkspace";
import { useLeague } from "../context/LeagueContext";
import { useLocation } from "react-router";
import { isCoreLeaguePath, POOLSTERS_LEAGUE_ID } from "../lib/leagueIdentity";
import { LeagueProvider } from "../context/LeagueContext";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { league } = useLeague();
  const location = useLocation();
  const coreOnly = league.id !== POOLSTERS_LEAGUE_ID;

  return (
    <div className="min-h-screen xl:flex">
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          {coreOnly ? isCoreLeaguePath(location.pathname) && league.core_setup_ready ? <LeagueCoreWorkspace /> : <div className="rounded-xl border border-gray-200 p-6 dark:border-gray-800"><h1 className="text-xl font-bold dark:text-white">{league.core_setup_ready ? `This feature is not open for ${league.name} yet` : `${league.name} setup is being prepared`}</h1><p className="mt-2 text-sm text-gray-500">{league.core_setup_ready ? "You can arrange teams and contracts in the league’s Front Office." : "Your membership is saved. Return to My Leagues to choose an available league."}</p><a href={league.core_setup_ready ? `/leagues/${league.slug}/front-office` : "/"} className="mt-4 inline-block text-sm font-semibold text-brand-500">{league.core_setup_ready ? "Open Front Office →" : "My Leagues →"}</a></div> : <Outlet />}
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <LeagueProvider>
      <SidebarProvider>
        <LayoutContent />
      </SidebarProvider>
    </LeagueProvider>
  );
};

export default AppLayout;
