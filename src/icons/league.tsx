import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function StandingsIcon(props: IconProps) {
  return <Icon {...props}><path d="M8 4h8v3a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 11v5M8 20h8M9 16h6"/></Icon>;
}

export function TeamsIcon(props: IconProps) {
  return <Icon {...props}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 14.5a4.5 4.5 0 0 1 6.5 4"/></Icon>;
}

export function TransactionsIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 7h14M15 4l3 3-3 3M20 17H6M9 14l-3 3 3 3"/></Icon>;
}

export function SkaterIcon(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="5" r="2"/><path d="m9 8 4 3 3 1M10 9l-2 5 4 2M8 14l-3 4M12 16l5 2M18 8v9c0 2 1 3 3 3"/></Icon>;
}

export function GoalieIcon(props: IconProps) {
  return <Icon {...props}><path d="M7 5c3-2 7-2 10 0l1 5c0 5-2.5 8-6 10-3.5-2-6-5-6-10l1-5Z"/><path d="M9 8h1M14 8h1M9 12h6M10 16h4"/></Icon>;
}

export function DashboardIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></Icon>;
}

export function ChatIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12h5"/></Icon>;
}

export function AuctionIcon(props: IconProps) {
  return <Icon {...props}><path d="m13 6 5 5M11 8l5 5M5 16l8-8M3 20h10M16 15l5 5"/></Icon>;
}

export function MarketIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5"/></Icon>;
}

export function TradeIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 7h14M15 4l3 3-3 3M20 17H6M9 14l-3 3 3 3"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="17" r="2"/></Icon>;
}

export function TeamAdminIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z"/><circle cx="12" cy="10" r="2"/><path d="M8.5 16a3.5 3.5 0 0 1 7 0"/></Icon>;
}

export function PlayerAdminIcon(props: IconProps) {
  return <Icon {...props}><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 14l4 4M20 14l-4 4"/></Icon>;
}

export function AdminTradeIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z"/><path d="M8 10h8M13 7l3 3-3 3"/></Icon>;
}

export function ReportIcon(props: IconProps) {
  return <Icon {...props}><path d="M7 3h10v3h3v15H4V6h3V3Z"/><path d="M7 3v4h10V3M8 17v-3M12 17v-6M16 17V9"/></Icon>;
}

export function BuyoutIcon(props: IconProps) {
  return <Icon {...props}><circle cx="7" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><path d="m9.5 8.5 11 7.5M9.5 15.5 20.5 8M16 5h5v5"/></Icon>;
}

export function AwardsIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="9" r="5"/><path d="m8.5 13-2 8 5.5-3 5.5 3-2-8M10 9l1.3 1.3L14 7.5"/></Icon>;
}

export function GoalHornIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 10v4l10 4V6L5 10Z"/><path d="M15 9h3a3 3 0 0 1 0 6h-3M7 15l-1 5h4l1-3M19 4v2M22 7l-2 1M22 12h-2"/></Icon>;
}
