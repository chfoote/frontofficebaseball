import { useLeagueRoute } from "../context/LeagueRouteContext";
import { isPlatformPage } from "../lib/leagueIdentity";
import { POOLSTERS_LEAGUE_ID } from "../lib/leagueIdentity";
import { useLeague } from "../context/LeagueContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

// Assume these icons are imported from an icon library
import {
  ChevronDownIcon,
  HorizontaLDots,
  PlugInIcon,
} from "../icons";
import {
  AdminTradeIcon,
  AuctionIcon,
  AwardsIcon,
  BuyoutIcon,
  ChatIcon,
  DashboardIcon,
  GoalieIcon,
  GoalHornIcon,
  PlayerAdminIcon,
  ReportIcon,
  SkaterIcon,
  StandingsIcon,
  TeamAdminIcon,
  TeamsIcon,
} from "../icons/league";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import LeagueBrand from "../components/common/LeagueBrand";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const leagueItems: NavItem[] = [
  { icon: <DashboardIcon />, name: "My Leagues", path: "/" },
  {
    icon: <StandingsIcon />,
    name: "Standings",
    path: "/standings",
  },
  {
    icon: <TeamsIcon />,
    name: "Teams",
    path: "/teams",
  },
  { icon: <DashboardIcon />, name: "Cap & Roster Overview", path: "/league-dashboard" },
  {
    icon: <SkaterIcon />,
    name: "Batter Stats",
    path: "/batter-stats",
  },
  {
    icon: <GoalieIcon />,
    name: "Pitcher Stats",
    path: "/pitcher-stats",
  },
];

const leaguePulseItems: NavItem[] = [
  {
    icon: <GoalHornIcon />,
    name: "MLB Scoreboard",
    path: "/scoreboard",
  },
];

const gmToolItems: NavItem[] = [
  {
    icon: <DashboardIcon />,
    name: "My Front Office",
    path: "/front-office",
  },
  {
    icon: <DashboardIcon />,
    name: "Roster Lab",
    path: "/roster-lab",
  },
  {
    icon: <SkaterIcon />,
    name: "Upcoming RFAs",
    path: "/upcoming-rfas",
  },
  {
    icon: <SkaterIcon />,
    name: "Upcoming UFAs",
    path: "/upcoming-ufas",
  },
];

const communityItems: NavItem[] = [
  { icon: <ChatIcon />, name: "League Chat", path: "/league-chat" },
];

type MenuType = "league" | "pulse" | "gmTools" | "community" | "admin" | "others";

const adminItems: NavItem[] = [
  {
    icon: <TeamAdminIcon />,
    name: "Manage Teams",
    path: "/admin/teams",
  },
  {
    icon: <PlayerAdminIcon />,
    name: "Manage Players",
    path: "/admin/players",
  },
  {
    icon: <ReportIcon />,
    name: "Player Change Log",
    path: "/admin/player-changes",
  },
  {
    icon: <AdminTradeIcon />,
    name: "Trade Admin",
    path: "/admin/trades",
  },
  {
    icon: <AuctionIcon />,
    name: "Auction Admin",
    path: "/admin/auction-admin",
  },
  {
    icon: <ReportIcon />,
    name: "Bidding Report",
    path: "/admin/auction-report",
  },
  {
    icon: <BuyoutIcon />,
    name: "Buyout Admin",
    path: "/admin/buyouts",
  },
  {
    icon: <BuyoutIcon />,
    name: "Retention Admin",
    path: "/admin/retentions",
  },
  {
    icon: <AwardsIcon />,
    name: "Manage Awards",
    path: "/admin/awards",
  },
];

const othersItems: NavItem[] = [
  {
    icon: <PlugInIcon />,
    name: "Authentication",
    subItems: [
      { name: "Sign In", path: "/signin", pro: false },
      { name: "Sign Up", path: "/signup", pro: false },
    ],
  },
];

const menuItems: Record<MenuType, NavItem[]> = {
  league: leagueItems,
  pulse: leaguePulseItems,
  gmTools: gmToolItems,
  community: communityItems,
  admin: adminItems,
  others: othersItems,
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const { isAdmin, isPlatformAdmin, adminSetupPending, user } = useAuth();
  const { membership, league } = useLeague();
  const location = useLocation();
  const { basename } = useLeagueRoute();
  const platformMode = isPlatformPage(basename,location.pathname);

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: MenuType;
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => location.pathname === path;
  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  useEffect(() => {
    let submenuMatched = false;
    (Object.keys(menuItems) as MenuType[]).forEach((menuType) => {
      const items = menuItems[menuType];
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType,
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (
    index: number,
    menuType: MenuType,
  ) => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const renderMenuItems = (
    items: NavItem[],
    menuType: MenuType,
  ) => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={`menu-item-icon-size  ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              (["/", "/admin/users", "/admin/leagues"].includes(nav.path) ? (
              <a
                href={nav.path}
                onClick={() => { if (isMobileOpen) toggleMobileSidebar(); }}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </a>
              ) : (
              <Link
                to={nav.path}
                onClick={() => { if (isMobileOpen) toggleMobileSidebar(); }}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
              ))
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      onClick={() => { if (isMobileOpen) toggleMobileSidebar(); }}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`app-sidebar fixed top-16 flex flex-col px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 transition-all duration-300 ease-in-out z-50 border-r border-gray-200 lg:top-0
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <a href="/" onClick={() => { if (isMobileOpen) toggleMobileSidebar(); }} className="flex items-center gap-3" aria-label="Front Office Baseball League home">
          <LeagueBrand compact={!isExpanded && !isHovered && !isMobileOpen} />
        </a>
      </div>
      <div className="no-scrollbar flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain pb-[calc(1.5rem+env(safe-area-inset-bottom))] duration-300 ease-linear [-webkit-overflow-scrolling:touch]">
        {platformMode ? <nav className="space-y-3"><a href="/" className="menu-item">My Leagues</a><a href="/profile" className="menu-item">My Account</a>{(isPlatformAdmin || (adminSetupPending && isAdmin)) && <><a href="/admin/leagues" className="menu-item">Site Administration</a><a href="/admin/users" className="menu-item">User Admin</a></>}{!isPlatformAdmin && membership?.role==='commissioner' && <a href="/admin/users" className="menu-item">User Admin</a>}</nav> : league.id !== POOLSTERS_LEAGUE_ID ? <nav className="space-y-3"><a href="/" className="menu-item">← My Leagues</a><p className="px-3 text-xs font-bold text-gray-400">{league.name}</p>{renderMenuItems([{icon:<DashboardIcon />,name:"Front Office",path:"/front-office"},{icon:<TeamsIcon />,name:"Teams",path:"/teams"},{icon:<PlayerAdminIcon />,name:"Roster & Contracts",path:"/contracts"}],"league")}{(isPlatformAdmin || membership?.role==='commissioner') && <a className="menu-item" href={`/admin/users?league=${league.id}`}>User Admin</a>}{isPlatformAdmin && <a className="menu-item" href="/admin/leagues">Site Administration</a>}</nav> : <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  `${league.name} · League`
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(leagueItems, "league")}
            </div>
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "League Pulse"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(leaguePulseItems, "pulse")}
            </div>
            <div>
              <h2 className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                {isExpanded || isHovered || isMobileOpen ? "GM Tools" : <HorizontaLDots />}
              </h2>
              {renderMenuItems(gmToolItems, "gmTools")}
            </div>
            <div>
              <h2 className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}>
                {isExpanded || isHovered || isMobileOpen ? "Community" : <HorizontaLDots />}
              </h2>
              {renderMenuItems(communityItems, "community")}
            </div>
            {(isPlatformAdmin || (adminSetupPending && isAdmin) || membership?.role === "commissioner") && <div><h2 className="mb-3 text-xs uppercase text-gray-400">{isPlatformAdmin || (adminSetupPending && isAdmin) ? "Platform" : "Membership"}</h2>{renderMenuItems([
              ...(isPlatformAdmin || (adminSetupPending && isAdmin) ? [{icon:<DashboardIcon />,name:"Site Administration",path:"/admin/leagues"}] : []),
              {icon:<TeamAdminIcon />,name:"User Admin",path:"/admin/users"},
            ], "admin")}</div>}
            {isAdmin && (
              <div>
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    "Admin"
                  ) : (
                    <HorizontaLDots />
                  )}
                </h2>
                {renderMenuItems(adminItems, "admin")}
              </div>
            )}
            {!user && <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Others"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(othersItems, "others")}
            </div>}
          </div>
        </nav>}
      </div>
    </aside>
  );
};

export default AppSidebar;
