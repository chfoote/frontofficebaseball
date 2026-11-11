import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { fetchFantasyTeams, type FantasyTeam } from "../../lib/fantasyTeams";
import { closeAuction, compareAuctionBids, deleteAuction, fetchAuctions, nominateAuction, setAuctionPaused, undoAuctionAward, type Auction } from "../../lib/auctions";
import { createFantasyPlayer, createPlayerSeason, fetchFantasyPlayers, fetchPlayerSeasonsBySeason, type FantasyPlayer, type PlayerSeasonWithRelations } from "../../lib/fantasyPlayers";
import { fetchNhlGoalieStats, fetchNhlPlayerLanding, fetchNhlSkaterStats, type NhlGoalieRecord, type NhlSkaterRecord } from "../../lib/nhl";
import { fetchProspectRights, getProspectRight, removeAgedOutProspectRights, type ProspectRight } from "../../lib/prospectRights";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";

const seasonOptions = Array.from({ length: 10 }, (_, index) => 2026 + index);
const positionOrder = ["C", "LW", "RW", "D", "G"];
const teamCategoryOrder = ["C", "LW", "RW", "D", "G", "RFA", "W", "IR", "LTIR", "RETENTION", "BUYOUT", "PROSPECT"];
const prospectPositions = new Set(["PROSPECT", "AP"]);
const categoryLabels: Record<string, string> = {
  C: "C",
  LW: "LW",
  RW: "RW",
  D: "D",
  G: "G",
  RFA: "RFA",
  W: "Waivers",
  IR: "IR",
  LTIR: "LTIR",
  RETENTION: "Retention",
  BUYOUT: "Buyout",
  PROSPECT: "Prospects",
};

type NhlNominee = {
  playerApiId: string;
  name: string;
  position: string;
  nhlTeam: string;
};

type NomineeOption = NhlNominee & {
  value: string;
  player: FantasyPlayer | null;
  fantasyTeam: FantasyTeam | null;
  teamCategory: string;
};

function nhlSeasonId(year: number) {
  return (year - 1) * 10000 + year;
}

function playerName(player: FantasyPlayer) {
  return player.full_name || [player.first_name, player.last_name].filter(Boolean).join(" ") || "Unknown Player";
}

function normalizePosition(position: string | null | undefined) {
  const code = (position || "").toUpperCase();
  if (code === "L") return "LW";
  if (code === "R") return "RW";
  return positionOrder.includes(code) ? code : "Unassigned";
}

function positionRank(position: string) {
  const index = positionOrder.indexOf(position);
  return index === -1 ? positionOrder.length : index;
}

function teamCategory(position: string | null | undefined, hasProspectRights: boolean) {
  const code = (position || "").toUpperCase();
  if (prospectPositions.has(code) || (!code && hasProspectRights)) return "PROSPECT";
  return teamCategoryOrder.includes(code) ? code : normalizePosition(code);
}

function teamCategoryRank(category: string) {
  const index = teamCategoryOrder.indexOf(category);
  return index === -1 ? teamCategoryOrder.length : index;
}

export default function AuctionAdmin() {
  const { user } = useAuth();
  const [selectedSeason, setSelectedSeason] = useState(CURRENT_LEAGUE_SEASON);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [playerSeasons, setPlayerSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [previousPlayerSeasons, setPreviousPlayerSeasons] = useState<PlayerSeasonWithRelations[]>([]);
  const [players, setPlayers] = useState<FantasyPlayer[]>([]);
  const [nhlNominees, setNhlNominees] = useState<NhlNominee[]>([]);
  const [prospectRights, setProspectRights] = useState<Map<string, ProspectRight>>(new Map());
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [nomineeId, setNomineeId] = useState("");
  const [auctionType, setAuctionType] = useState<"ufa"|"rfa">("ufa");
  const [rosterPosition, setRosterPosition] = useState("C");
  const [rfaQualified, setRfaQualified] = useState(true);
  const [isTestAuction, setIsTestAuction] = useState(false);
  const [savingAuction, setSavingAuction] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      // Load auctions first so a failure in unrelated admin/roster data cannot
      // hide records that remain visible in the manager-facing Auction House.
      const auctionRows = await fetchAuctions(selectedSeason);
      setAuctions(auctionRows);

      const [teamRows, seasonRows, previousSeasonRows, playerRows, skaterRows, goalieRows, rights] = await Promise.all([
        fetchFantasyTeams(),
        fetchPlayerSeasonsBySeason(selectedSeason),
        fetchPlayerSeasonsBySeason(selectedSeason - 1),
        fetchFantasyPlayers(),
        Promise.all([
          fetchNhlSkaterStats(nhlSeasonId(selectedSeason)).catch(() => [] as NhlSkaterRecord[]),
          fetchNhlSkaterStats(nhlSeasonId(selectedSeason - 1)).catch(() => [] as NhlSkaterRecord[]),
        ]).then(([current, previous]) => current.length ? current : previous),
        Promise.all([
          fetchNhlGoalieStats(nhlSeasonId(selectedSeason)).catch(() => [] as NhlGoalieRecord[]),
          fetchNhlGoalieStats(nhlSeasonId(selectedSeason - 1)).catch(() => [] as NhlGoalieRecord[]),
        ]).then(([current, previous]) => current.length ? current : previous),
        fetchProspectRights(selectedSeason).catch(() => new Map<string, ProspectRight>()),
      ]);
      const nominees = [
        ...skaterRows.map((record) => ({
          playerApiId: String(record.playerId),
          name: record.skaterFullName,
          position: normalizePosition(record.positionCode),
          nhlTeam: record.teamAbbrevs || "NHL FA",
        })),
        ...goalieRows.map((record) => ({
          playerApiId: String(record.playerId),
          name: record.goalieFullName,
          position: "G",
          nhlTeam: record.teamAbbrevs || "NHL FA",
        })),
      ];
      const eligibleRights = await removeAgedOutProspectRights(
        rights,
        nominees.map((nominee) => ({ playerId: Number(nominee.playerApiId), playerName: nominee.name })),
      );
      setTeams(teamRows);
      setPlayerSeasons(seasonRows);
      setPreviousPlayerSeasons(previousSeasonRows);
      setPlayers(playerRows);
      setNhlNominees(nominees);
      setProspectRights(eligibleRights);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load auction admin data.");
    } finally {
      setLoading(false);
    }
  }

  const nomineeOptions = useMemo(() => {
    const nhlByApiId = new Map(nhlNominees.map((nominee) => [nominee.playerApiId, nominee]));
    const localByApiId = new Map(players.filter((player) => player.player_api_id).map((player) => [String(player.player_api_id), player]));
    const options = new Map<string, NomineeOption>();

    nhlNominees.forEach((nominee) => {
      const player = localByApiId.get(nominee.playerApiId) || null;
      const season = player ? playerSeasons.find((row) => row.player_id === player.id) : null;
      const right = getProspectRight(prospectRights, nominee.playerApiId, nominee.name);
      options.set(nominee.playerApiId, {
        ...nominee,
        value: player ? String(player.id) : `nhl:${nominee.playerApiId}`,
        player,
        fantasyTeam: season?.fantasy_team || right?.team || null,
        teamCategory: teamCategory(season?.fantasy_team ? season.position : null, Boolean(right)),
      });
    });

    players.forEach((player) => {
      const apiId = String(player.player_api_id || `local:${player.id}`);
      if (options.has(apiId)) return;
      const season = playerSeasons.find((row) => row.player_id === player.id);
      const name = playerName(player);
      const right = getProspectRight(prospectRights, player.player_api_id, name);
      const nhl = nhlByApiId.get(String(player.player_api_id));
      options.set(apiId, {
        playerApiId: String(player.player_api_id || ""),
        name,
        position: normalizePosition(season?.position || nhl?.position),
        nhlTeam: nhl?.nhlTeam || "NHL FA",
        value: String(player.id),
        player,
        fantasyTeam: season?.fantasy_team || right?.team || null,
        teamCategory: teamCategory(season?.fantasy_team ? season.position : null, Boolean(right)),
      });
    });

    return [...options.values()]
      .filter((option) => !option.player || !auctions.some((auction) => auction.player_id === option.player!.id && !auction.resolution))
      .sort((a, b) => teamCategoryRank(a.teamCategory) - teamCategoryRank(b.teamCategory) || positionRank(a.position) - positionRank(b.position) || a.name.localeCompare(b.name));
  }, [auctions, nhlNominees, playerSeasons, players, prospectRights]);

  const teamNomineeGroups = useMemo(() => teams
    .map((team) => ({
      team,
      players: nomineeOptions.filter((option) => option.fantasyTeam?.id === team.id),
    }))
    .filter((group) => group.players.length)
    .sort((a, b) => a.team.team_name.localeCompare(b.team.team_name)), [nomineeOptions, teams]);
  const ufaNomineeGroups = useMemo(() => [...positionOrder, "Unassigned"]
    .map((position) => ({
      position,
      players: nomineeOptions.filter((option) => !option.fantasyTeam && option.position === position),
    }))
    .filter((group) => group.players.length), [nomineeOptions]);
  const selectedOption = nomineeOptions.find((option) => option.value === nomineeId) || null;
  const selectedPlayer = selectedOption?.player || null;
  const previousNominee = selectedPlayer ? previousPlayerSeasons.find((row) => row.player_id === selectedPlayer.id) : undefined;
  const requiredQualifyingAav = Math.max(Math.round((previousNominee?.salary||0)*0.5),250000);
  async function selectNominee(value:string){setNomineeId(value);const option=nomineeOptions.find(item=>item.value===value);const row=option?.player?playerSeasons.find(item=>item.player_id===option.player!.id):undefined;const storedPosition=(row?.position||"").toUpperCase();const isRfa=storedPosition==="RFA";setAuctionType(isRfa?"rfa":"ufa");setRfaQualified(true);if(option&&positionOrder.includes(option.position)){setRosterPosition(option.position);return;}if(option?.playerApiId){try{const landing=await fetchNhlPlayerLanding(Number(option.playerApiId));const position=normalizePosition(landing.position);if(positionOrder.includes(position))setRosterPosition(position);}catch{/* Position remains editable if NHL data is unavailable. */}}}
  async function handleNominate() {
    if (!user || !selectedOption) return;
    setSavingAuction(true);
    setError("");
    setSuccess("");
    try {
      const effectiveType = auctionType === "rfa" && rfaQualified ? "rfa" : "ufa";
      let player = selectedPlayer;
      if (!player && effectiveType === "rfa") {
        throw new Error("Only an existing player with assigned franchise rights can be nominated as an RFA.");
      }
      if (!player) {
        const nameParts = selectedOption.name.trim().split(/\s+/);
        player = await createFantasyPlayer({
          player_api_id: selectedOption.playerApiId,
          first_name: nameParts.slice(0, -1).join(" ") || null,
          last_name: nameParts[nameParts.length - 1] || null,
          full_name: selectedOption.name,
          on_trade_block: false,
          notes: "Created automatically from NHL stats by Auction Admin nomination.",
        });
      }
      const minimumAav = 250000;
      let seasonRow = playerSeasons.find((row) => row.player_id === player.id);
      if (!seasonRow && !isTestAuction) {
        if (effectiveType === "rfa") throw new Error("Create an RFA rights record and assign its rights team before nominating this player as an RFA.");
        seasonRow = await createPlayerSeason({ player_id: player.id, season_year: selectedSeason, fantasy_team_id: null, salary: null, position: rosterPosition, term_end_year: null, contract_group: "UFA", notes: "Created automatically by Auction Admin nomination." });
      }
      if (effectiveType === "rfa" && !seasonRow?.fantasy_team_id) throw new Error("Assign the player's RFA rights to a team before opening blind bidding.");
      await nominateAuction({ playerId: player.id, playerName: selectedOption.name, playerSeasonId: seasonRow?.id || null, seasonYear: selectedSeason, type: effectiveType, position: rosterPosition, rightsTeamId: effectiveType === "rfa" ? seasonRow?.fantasy_team_id || null : null, qualifyingAav: effectiveType === "rfa" ? requiredQualifyingAav : null, minimumAav, nominatedBy: user.id, isTest: isTestAuction });
      const prefix = isTestAuction ? "TEST RUN — " : "";
      setSuccess(prefix + (effectiveType === "rfa" ? `Qualified RFA nominated with a one-year $${requiredQualifyingAav.toLocaleString()} rights-owner offer. Sealed bidding is open for 90 seconds.` : `Player nominated for open UFA bidding at a $${minimumAav.toLocaleString()} minimum.`));
      setNomineeId("");
      setIsTestAuction(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to nominate player.");
    } finally {
      setSavingAuction(false);
    }
  }
  async function handleCloseAuction(id:number){setError("");try{await closeAuction(id);setSuccess("Bidding closed. Sealed offers are now revealed and the winning offer was processed.");await loadData();}catch(err){setError(err instanceof Error?err.message:"Unable to close auction.");}}
  async function handlePauseAuction(auction:Auction){setError("");setSuccess("");try{await setAuctionPaused(auction.id,!auction.paused_at);setSuccess(auction.paused_at?"Auction timer resumed.":"Auction timer paused. Bidding is disabled.");await loadData();}catch(err){setError(err instanceof Error?err.message:"Unable to update the auction timer.");}}
  async function handleRemoveAuction(auction:Auction){const player=auction.player_season?.player?.full_name||auction.player_name;const warning=auction.status==="completed"?" This will not reverse an awarded contract or transaction.":"";const bids=auction.auction_type==="rfa"&&auction.status==="open"?"all sealed bid records":`all ${auction.auction_bids.length} bid records`;if(!window.confirm(`Remove the ${player} auction and ${bids}?${warning}`))return;setError("");setSuccess("");try{await deleteAuction(auction.id);setAuctions(current=>current.filter(row=>row.id!==auction.id));setSuccess(`${player} was removed from the Auction Log.`);}catch(err){setError(err instanceof Error?err.message:"Unable to remove the auction.");}}
  async function handleUndoAuction(auction:Auction){const player=auction.player_season?.player?.full_name||auction.player_name;if(!window.confirm(`Undo the ${player} auction result? This restores the pre-auction roster records and deletes the auction-generated transaction.`))return;setError("");setSuccess("");try{await undoAuctionAward(auction.id);setSuccess(`${player}'s auction result was undone and the previous roster state was restored.`);await loadData();}catch(err){setError(err instanceof Error?err.message:"Unable to undo the auction result.");}}

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);


  return (
    <>
      <PageMeta
        title="Auction Admin | Front Office Baseball"
        description="Manage league auctions and nominations"
      />
      <PageBreadcrumb pageTitle="Auction Admin" />

      <div className="space-y-6">
        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Auction Admin
              </p>
              <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                Auctions and Nominations
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage auction nominations, bids, and results.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Season
              </label>
              <select
                value={selectedSeason}
                onChange={(event) => setSelectedSeason(Number(event.target.value))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 sm:w-36"
              >
                {seasonOptions.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Loading auction admin data...
            </p>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300">
              {success}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4"><p className="text-xs font-semibold uppercase text-gray-500">Auction Control</p><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nominate a player</h2><p className="mt-1 text-sm text-gray-500">Qualified RFAs receive 90 seconds of sealed bidding. Unqualified players enter the open UFA auction.</p></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Player</label>
              <select value={nomineeId} onChange={e => void selectNominee(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900">
                <option value="">Choose player</option>
                {teamNomineeGroups.map(({ team, players: teamPlayers }) => (
                  <optgroup key={team.id} label={`${team.team_name} (${team.abbreviation})`}>
                    {teamPlayers.map((option) => <option key={option.value} value={option.value}>{categoryLabels[option.teamCategory] || option.teamCategory} — {option.name}{option.teamCategory === "PROSPECT" ? " (P)" : ""}</option>)}
                  </optgroup>
                ))}
                {ufaNomineeGroups.map(({ position, players: ufaPlayers }) => (
                  <optgroup key={`ufa-${position}`} label={`UFA — ${position}`}>
                    {ufaPlayers.map((option) => <option key={option.value} value={option.value}>{option.name} — {option.nhlTeam}</option>)}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Franchise players are grouped first by team and position. True UFAs have no roster owner or active prospect rights.</p>
            </div>
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Type</label><select value={auctionType} onChange={e=>setAuctionType(e.target.value as "ufa"|"rfa")} className="h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900"><option value="ufa">UFA — Open</option><option value="rfa">RFA — Blind</option></select></div>
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Roster Position</label><select value={rosterPosition} onChange={e=>setRosterPosition(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-900">{["C","LW","RW","D","G"].map(p=><option key={p}>{p}</option>)}</select></div>
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-500">{auctionType==="rfa"?"Qualifying":"UFA Timer"}</label>{auctionType==="rfa"?<label className="flex h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-3 dark:border-gray-700"><input type="checkbox" checked={rfaQualified} onChange={e=>setRfaQualified(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-brand-500"/><span className="text-sm font-semibold">Qualified · ${requiredQualifyingAav.toLocaleString()} / 1 year</span></label>:<div className="flex h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700">60 seconds · resets to 45 when below 45</div>}</div>
            {auctionType==="rfa"&&<div><label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Auction Result</label><div className={`flex h-11 items-center rounded-lg border px-3 text-sm font-medium ${rfaQualified?"border-violet-200 bg-violet-50 text-violet-700":"border-brand-200 bg-brand-50 text-brand-700"}`}>{rfaQualified?"90-second blind RFA":"60-second open UFA"}</div></div>}
          </div>
          <div className="mt-4 rounded-xl border border-success-300 bg-success-50 p-4 dark:border-success-500/50 dark:bg-success-500/10"><span className="block text-sm font-bold text-gray-900 dark:text-white">$250,000 league minimum</span><span className="mt-1 block text-xs text-gray-600 dark:text-gray-300">Applied automatically to all MLB contracts and qualifying offers.</span></div>
          <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${isTestAuction?"border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10":"border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"}`}>
            <input type="checkbox" checked={isTestAuction} onChange={e=>setIsTestAuction(e.target.checked)} className="mt-0.5 h-5 w-5 rounded border-gray-300 text-amber-500"/>
            <span><span className="block text-sm font-bold text-gray-900 dark:text-white">TEST auction — practice only</span><span className="mt-1 block text-xs text-gray-600 dark:text-gray-300">Runs the complete bidding experience, but does not change rosters or contracts and does not post a website or Discord transaction.</span></span>
          </label>
          <button type="button" onClick={()=>void handleNominate()} disabled={!selectedOption||savingAuction} className="mt-4 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingAuction?"Nominating…":"Nominate Player"}</button>
          {auctions.filter(a=>!["completed","cancelled"].includes(a.status)).length>0&&<div className="mt-6"><h3 className="mb-2 font-semibold">Active auction controls</h3><div className="space-y-2">{auctions.filter(a=>!["completed","cancelled"].includes(a.status)).map(a=>{const rfaSealed=a.auction_type==="rfa"&&a.status==="open";const expired=new Date(a.ends_at).getTime()<=Date.now();return <div key={a.id} className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${a.is_test?"border-amber-300 bg-amber-50/60":"border-gray-200"}`}><div><p className="font-medium">{a.player_season?.player?.full_name} {a.is_test&&<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">TEST</span>} {a.paused_at&&<span className="ml-2 rounded-full bg-warning-50 px-2 py-0.5 text-[10px] font-bold uppercase text-warning-700">Paused</span>}</p><p className="text-xs uppercase text-gray-500">{a.auction_type} · {a.status.replace(/_/g," ")} · {a.paused_at?`${a.paused_seconds_remaining||0}s remaining`: `ends ${new Date(a.ends_at).toLocaleString()}`}</p>{rfaSealed&&<p className="mt-1 text-xs font-medium text-violet-600">Offers are sealed. Bid count and details are hidden until reveal.</p>}</div>{a.status==="open"&&<div className="flex gap-2"><button onClick={()=>void handlePauseAuction(a)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${a.paused_at?"bg-success-600 text-white":"border border-warning-300 bg-warning-50 text-warning-700"}`}>{a.paused_at?"Resume Timer":"Pause Timer"}</button><button disabled={rfaSealed&&!expired} onClick={()=>void handleCloseAuction(a.id)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{rfaSealed?"Reveal Offers":"Close Bidding Now"}</button></div>}</div>})}</div></div>}
          <div className="mt-8">
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Auction Log</h3>
              <p className="text-sm text-gray-500">Every nomination and its complete bid history. Removing an auction also removes its bid records.</p>
            </div>
            {auctions.length===0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No auctions have been recorded for this season.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Nominated</th>
                      <th className="px-3 py-2 text-left">Player</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Bids</th>
                      <th className="px-3 py-2 text-left">Complete Bid Log</th>
                      <th className="px-3 py-2">High / Winning Offer</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auctions.map(a=>{
                      const sealed=a.auction_type==="rfa"&&a.status==="open";
                      const ranked=[...a.auction_bids].sort(compareAuctionBids);
                      const offer=a.winning_bid||ranked[0];
                      const expired=a.status==="open"&&!a.paused_at&&new Date(a.ends_at).getTime()<=Date.now();
                      return (
                        <tr key={a.id} className={`align-top ${a.is_test?"bg-amber-50/60 dark:bg-amber-500/5":""}`}>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">{new Date(a.created_at).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-medium">{a.player_season?.player?.full_name||a.player_name} {a.is_test&&<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">TEST</span>}</td>
                          <td className="px-3 py-3 text-center uppercase">{a.auction_type}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-center capitalize">{expired?"Expired — close required":a.paused_at?"Paused":a.status.replace(/_/g," ")}</td>
                          <td className="px-3 py-3 text-center font-semibold">{sealed?"Sealed":a.auction_bids.length}</td>
                          <td className="min-w-64 px-3 py-3">
                            {sealed?<span className="text-xs font-medium text-violet-600">Hidden until the admin reveals offers</span>:ranked.length===0 ? "—" : (
                              <div className="space-y-1.5">
                                {ranked.map((bid,index)=>(
                                  <div key={bid.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md bg-gray-50 px-2 py-1.5 text-xs dark:bg-gray-800">
                                    <span className="font-medium text-gray-800 dark:text-gray-100">
                                      {index+1}. {bid.fantasy_team?.team_name||bid.fantasy_team?.abbreviation||"Team"}
                                      {bid.is_qualifying_bid&&<span className="ml-1 text-gray-500">(qualifying)</span>}
                                    </span>
                                    <span className="whitespace-nowrap font-semibold">${bid.aav.toLocaleString()}</span>
                                    <span className="whitespace-nowrap text-gray-500">{bid.years} {bid.years===1?"year":"years"}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center">{sealed?"Sealed":offer?`${offer.fantasy_team?.abbreviation||"Team"} · $${offer.aav.toLocaleString()} · ${offer.years}yr`:"—"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-center capitalize">{a.resolution?.replace(/_/g," ")||"Pending"}</td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex flex-col gap-2">{a.status==="completed"&&a.pre_award_player_seasons&&!a.award_undone_at&&<button type="button" onClick={()=>void handleUndoAuction(a)} className="rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-xs font-semibold uppercase text-warning-700 transition hover:bg-warning-100">Undo Result</button>}<button type="button" onClick={()=>void handleRemoveAuction(a)} className="rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold uppercase text-error-600 transition hover:bg-error-50 dark:border-error-500/40 dark:text-error-300 dark:hover:bg-error-500/10">Remove</button></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"><p className="text-sm text-gray-500">Membership, display names and team assignments are now managed in <Link to="/admin/users" className="font-semibold text-brand-500 hover:underline">User Admin →</Link></p></section>
      </div>
    </>
  );
}
