import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchFantasyTeams, type FantasyTeam } from "../../lib/fantasyTeams";

const sections = [
  { id: "salary", label: "1. Salary" },
  { id: "roster", label: "2. Roster" },
  { id: "free-agency", label: "3. Free Agency" },
  { id: "transaction-windows", label: "4. Transaction Windows" },
  { id: "scoring", label: "5. League Scoring" },
  { id: "prospects", label: "6. Prospects" },
  { id: "manager-tools", label: "7. Manager Tools" },
];

const salaryRules = [
  ["Annual Salary Cap", "$47,000,000"],
  ["Minimum Free Agent Salary", "$750,000"],
  ["Minimum Retained RFA Salary", "$500,000"],
  ["Minimum Contract Term", "1 year"],
  ["Maximum Contract Term", "5 years"],
];

const rosterMinimums = [["Centers", "3"], ["Left Wings", "3"], ["Right Wings", "3"], ["Defensemen", "6"], ["Goalies", "2"]];

const farmSystems = [
  ["Boston Bruins", "Niagara Bengals", "Daniel P.", "Nashville Predators", "Formerly Toronto Ice Bears (Steven I.)"],
  ["Montreal Canadiens", "Halifax Shithawks", "Kyle E.", "Calgary Flames", ""],
  ["Buffalo Sabres", "St Thomas Mallards", "Charles F.", "Dallas Stars", ""],
  ["Washington Capitals", "Bacon Bruins", "Flavio C.", "Los Angeles Kings", ""],
  ["Pittsburgh Penguins", "Sparta Spartans", "Gordon M.", "Utah Mammoth", ""],
  ["Philadelphia Flyers", "Georgian Bay Bears", "Zack D.", "Seattle Kraken", ""],
  ["New York Islanders", "Hawksville Horndogs", "Zach C.", "Vancouver Canucks", ""],
  ["Tampa Bay Lightning", "Lake Erie River Otters", "Emily G.", "Winnipeg Jets", ""],
  ["New Jersey Devils", "San Diego Seadogs", "Cameron D.", "Anaheim Ducks", ""],
  ["Detroit Red Wings", "Etobicoke Stingers", "Johnny V.", "Colorado Avalanche", ""],
];

function RuleSection({ id, number, title, children }: { id: string; number: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500">Article {number}</p><h2 className="mt-1 text-xl font-black text-gray-900 dark:text-white sm:text-2xl">{title}</h2></div>
    <div className="space-y-5 p-5 text-sm leading-6 text-gray-600 dark:text-gray-300 sm:p-6">{children}</div>
  </section>;
}

function RuleList({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2">{children}</ul>;
}

function Rule({ children }: { children: React.ReactNode }) {
  return <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /><span>{children}</span></li>;
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-3 text-base font-black text-gray-900 dark:text-white">{title}</h3>{children}</div>;
}

export default function Rulebook() {
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  useEffect(() => { let active = true; void fetchFantasyTeams(true).then((rows) => { if (active) setTeams(rows); }).catch(() => {}); return () => { active = false; }; }, []);
  const teamByName = useMemo(() => new Map(teams.map((team) => [team.team_name, team])), [teams]);
  return <div>
    <PageMeta title="CBA & Rulebook | GLDHL" description="Official Great Lakes Dynasty Hockey League collective bargaining agreement and rulebook" />
    <PageBreadcrumb pageTitle="CBA & Rulebook" />
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-brand-950 p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-300">GLDHL · 2027 Season 2</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Collective Bargaining Agreement</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">The official operating rules for the Great Lakes Dynasty Hockey League. Season 2 rules are effective for the 2027 GLDHL season.</p>
        <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold ring-1 ring-white/15">Salary Cap · $47,000,000</span><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold ring-1 ring-white/15">Season 2</span><span className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950">Official Rulebook</span></div>
      </header>

      <nav aria-label="Rulebook sections" className="sticky top-16 z-20 -mx-1 flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white/95 p-3 shadow-theme-xs backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 lg:top-20">{sections.map((section) => <a key={section.id} href={`#${section.id}`} className="shrink-0 whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-brand-50 hover:text-brand-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-brand-500/10 dark:hover:text-brand-300">{section.label}</a>)}</nav>

      <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><p className="font-black">Season 2 major changes</p><p className="mt-1">The annual salary cap is $47,000,000. Buy-Out, Salary Retention, and LTIR were added as formal Manager Tools. Exact 2027 event dates remain subject to league scheduling.</p></aside>

      <RuleSection id="salary" number="1" title="Salary">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{salaryRules.map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/70"><p className="text-[10px] font-black uppercase tracking-wide text-gray-400">{label}</p><p className="mt-2 text-lg font-black text-gray-900 dark:text-white">{value}</p></div>)}</div>
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"><strong>Salary cap:</strong> The league uses a $47,000,000 annual salary cap for every season.</p>
      </RuleSection>

      <RuleSection id="roster" number="2" title="Roster">
        <Subsection title="Minimum active roster requirements"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{rosterMinimums.map(([position, count]) => <div key={position} className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-900/70"><p className="text-xs font-bold text-gray-500">{position}</p><p className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{count}</p></div>)}</div><p className="mt-3 font-bold text-gray-900 dark:text-white">Maximum Active Roster Size: 23 total players (skaters + goalies).</p></Subsection>
      </RuleSection>

      <RuleSection id="free-agency" number="3" title="Free Agency">
        <p>Free Agency occurs on a mutually agreed date, typically during the NHL pre-season. The exact 2027 GLDHL Free Agency date is to be announced. The default remains at least 7 days before the NHL regular-season opener.</p>
        <div className="grid gap-4 lg:grid-cols-2"><Subsection title="3.1 Unrestricted Free Agents (UFA)"><RuleList><Rule>A UFA is a player not controlled by any Manager.</Rule><Rule>Conducted via open auction.</Rule><Rule>Highest contract value wins.</Rule><Rule>Tiebreaker: contract delivering money faster.</Rule><Rule>Minimum bid: <strong>$750,000</strong>.</Rule></RuleList></Subsection><Subsection title="3.2 Restricted Free Agents (RFA)"><RuleList><Rule>An RFA is a player controlled by a Manager.</Rule><Rule>Conducted via blind auction.</Rule><Rule>Retaining Manager must declare intent to retain or release.</Rule><Rule>If retained: minimum 1-year contract at 50% of prior AAV.</Rule><Rule>Minimum retained bid: <strong>1 year · $500,000</strong>.</Rule><Rule>If matched, the player stays at the new AAV.</Rule><Rule>If declined, the retaining Manager claims one Prospect from the winning Manager.</Rule></RuleList></Subsection></div>
      </RuleSection>

      <RuleSection id="transaction-windows" number="4" title="Transaction Windows">
        <p>The league operates under two transaction windows: Off-Season and In-Season.</p>
        <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"><h3 className="font-black text-gray-900 dark:text-white">4.1 Off-Season</h3><p className="mt-2">Opens at 12:01 PM the day after the NHL regular season ends. The 2027 calendar date will be announced once the NHL schedule is finalized.</p><RuleList><Rule>Trades: <strong>Allowed</strong></Rule><Rule>Prospect Call-Ups: <strong>Allowed</strong></Rule><Rule>Waiver Moves: <strong>Not allowed</strong></Rule><Rule>LTIR Moves: <strong>Not allowed</strong></Rule><Rule>Players in Waiver/LTIR return to the Active Roster.</Rule></RuleList></div><div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"><h3 className="font-black text-gray-900 dark:text-white">4.2 In-Season</h3><p className="mt-2">Opens at 12:01 PM the day after GLDHL Free Agency and closes at 11:59 PM on the second Sunday after the NHL Trade Deadline. Exact 2027 dates are to be announced.</p><RuleList><Rule>Trades: <strong>Allowed</strong></Rule><Rule>Prospect Call-Ups: <strong>Allowed</strong></Rule><Rule>Waivers: <strong>Allowed (1)</strong></Rule><Rule>IR: <strong>Allowed (1)</strong></Rule><Rule>LTIR: <strong>Allowed (1)</strong></Rule><Rule>Salary Retention: <strong>1 contract, up to 25% of the current-year salary</strong></Rule><Rule>Buy-Outs: <strong>Maximum 2</strong><span className="mt-2 block text-xs text-gray-500">3+ years remaining = 50% · 2 years = 40% · 1 year = 30%</span></Rule></RuleList></div></div>
      </RuleSection>

      <RuleSection id="scoring" number="5" title="League Scoring">
        <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl bg-slate-950 p-5 text-white"><p className="text-xs font-black uppercase tracking-wider text-blue-300">5.1 Skater Scoring Formula</p><p className="mt-3 font-mono text-sm leading-7">(G × 3) + (A × 2) + (+/− × 0.25) + (PIM × 0.2) + PPG + (SHG × 2) + GWG + PPA + (SHA × 2) + (SOG × 0.2) + (FOW × 0.025) + (B × 0.2) + (H × 0.2)</p></div><div className="rounded-xl bg-slate-950 p-5 text-white"><p className="text-xs font-black uppercase tracking-wider text-blue-300">5.2 Goaltender Scoring Formula</p><p className="mt-3 font-mono text-sm leading-7">(W × 3) + L + T/O + (GA × −0.5) + (S × 0.2) + (SO × 2) + P + (PIM × −1)</p></div></div>
      </RuleSection>

      <RuleSection id="prospects" number="6" title="Prospects">
        <RuleList><Rule>Each Manager is assigned 2 Farm Systems: 1 Eastern Conference and 1 Western Conference.</Rule><Rule>Farm Systems cannot be swapped.</Rule><Rule>Prospects belong to the drafting team, not the player's current NHL team.</Rule></RuleList>
        <Subsection title="Examples"><RuleList><Rule>Fraser Minten drafted by Toronto remains a Toronto Prospect even if traded.</Rule><Rule>If Team A trades a draft pick pre-selection, the player belongs to Team B.</Rule><Rule>If Team A drafts and immediately trades, the player remains Team A's Prospect.</Rule></RuleList></Subsection>
        <Subsection title="6.1 Protection Rules"><p>Prospects are protected until either:</p><RuleList><Rule>They turn 25 and must be called up before their birthday.</Rule><Rule>They exceed the previous season's positional median.</Rule><Rule>If the positional median is exceeded, the player must be called up by 11:59 PM before Free Agency or the Manager loses protection.</Rule></RuleList></Subsection>
        <Subsection title="6.2 Assigned Farm Systems"><div className="grid gap-3 sm:grid-cols-2">{farmSystems.map(([east, franchise, manager, west, history]) => { const team = teamByName.get(franchise); return <article key={franchise} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/70"><div className="flex items-center gap-3">{team?.logo ? <img src={team.logo} alt={`${franchise} logo`} className="h-14 w-14 shrink-0 object-contain" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-xs font-black text-gray-400 dark:bg-gray-800">GL</div>}<div className="min-w-0"><p className="font-black text-gray-900 dark:text-white">{franchise}</p><p className="text-xs text-gray-500">{manager}</p>{history && <p className="mt-1 text-[10px] font-bold text-brand-500">{history}</p>}</div></div><div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg bg-white p-3 text-center text-xs dark:bg-gray-950"><span>{east}</span><span className="font-black text-gray-300">+</span><span>{west}</span></div></article>; })}</div></Subsection>
      </RuleSection>

      <RuleSection id="manager-tools" number="7" title="Manager Tools">
        <p className="rounded-xl border border-success-200 bg-success-50 p-4 text-success-900 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200"><strong>New for Season 2:</strong> Buy-Out, Salary Retention, and LTIR are formal Manager Tools beginning with the 2027 season.</p>
        <Subsection title="7.1 Waiver Roster Space"><RuleList><Rule><strong>Does</strong> count toward the Salary Cap.</Rule><Rule><strong>Does not</strong> count toward the Active Roster limit.</Rule><Rule>48-hour claim window; priority is based on standings.</Rule><Rule>After 48 hours unclaimed, the player is available to the first Manager to claim.</Rule><Rule>Recall is permitted only after 2 weeks if the player remains unclaimed.</Rule></RuleList></Subsection>
        <Subsection title="7.2 Long-Term Injured Reserve (LTIR)"><RuleList><Rule>A Manager may place an eligible player on Long-Term Injured Reserve.</Rule><Rule>The player <strong>does not</strong> count toward the Salary Cap while on LTIR.</Rule><Rule>The player <strong>does not</strong> count toward the Active Roster limit while on LTIR.</Rule><Rule>Eligibility is limited to players who are on NHL LTIR.</Rule><Rule>When the player leaves LTIR, normal Salary Cap and Active Roster rules resume.</Rule></RuleList></Subsection>
        <Subsection title="7.3 Buy-Out"><RuleList><Rule>A Manager may buy out a player contract to immediately open an Active Roster spot while accepting a Salary Cap penalty.</Rule><Rule>Maximum of 2 Buy-Out spots at any given time.</Rule><Rule>A bought-out player no longer occupies an Active Roster spot.</Rule><Rule>The Buy-Out penalty <strong>does</strong> count against the Salary Cap.</Rule><Rule>The Buy-Out penalty <strong>does not</strong> occupy a roster spot.</Rule></RuleList><div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"><div className="grid grid-cols-2 bg-gray-50 text-xs font-black text-gray-500 dark:bg-gray-900"><div className="p-3">Years remaining</div><div className="p-3">Salary-cap penalty</div></div>{[["3 years or more", "50%"], ["2 years", "40%"], ["1 year", "30%"]].map(([years, penalty]) => <div key={years} className="grid grid-cols-2 border-t border-gray-100 dark:border-gray-800"><div className="p-3">{years}</div><div className="p-3 font-black text-gray-900 dark:text-white">{penalty}</div></div>)}</div><p className="mt-3 text-xs text-gray-500">The roster spot opens immediately. The applicable Buy-Out amount remains a Salary Cap charge only and does not use an Active Roster spot.</p></Subsection>
        <Subsection title="7.4 Salary Retention"><RuleList><Rule>A team may retain salary on one traded contract per season.</Rule><Rule>Maximum: 1 retained contract per team per season.</Rule><Rule>A team may retain up to 25% of the player's <strong>current-season salary</strong>.</Rule><Rule>Retention applies only to the current season, even when the contract has multiple years remaining.</Rule><Rule>Future years return to the player's normal full salary.</Rule><Rule>The trading team absorbs the retained amount as a current-season cap charge.</Rule><Rule>The acquiring team receives equal current-season cap relief, up to the 25% maximum.</Rule></RuleList><p className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/70"><strong>Example:</strong> On a $1,000,000 contract with 3 years remaining, the trading team may retain up to $250,000 for the current season. Years 2 and 3 return to the normal contract salary.</p></Subsection>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><strong>Rule hierarchy:</strong> Where a Season 2 Manager Tool conflicts with the inaugural 2026 wording, the 2027 Season 2 rule in Section 7 controls.</p>
      </RuleSection>

      <footer className="py-4 text-center text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Great Lakes Dynasty Hockey League · 2027 Season 2 Rulebook</footer>
    </div>
  </div>;
}
