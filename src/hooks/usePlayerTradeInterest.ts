import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { PlayerSeasonWithRelations } from "../lib/fantasyPlayers";
import { fetchLatestUserTeamAssignment, fetchUserTeamAssignment } from "../lib/teamUserAssignments";
import { addPlayerTradeInterest, fetchPlayerTradeInterests, removePlayerTradeInterest, type PlayerTradeInterest } from "../lib/tradeMarket";

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return "Unable to update player interest.";
}

export function usePlayerTradeInterest(seasonYear: number) {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState<number | null>(null);
  const [interests, setInterests] = useState<PlayerTradeInterest[]>([]);
  const [busyPlayerSeasonId, setBusyPlayerSeasonId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!user) { setTeamId(null); setInterests([]); return; }
    Promise.all([
      fetchUserTeamAssignment(user.id, seasonYear).then((assignment) => assignment || fetchLatestUserTeamAssignment(user.id)),
      fetchPlayerTradeInterests(seasonYear),
    ]).then(([assignment, rows]) => {
      if (!active) return;
      setTeamId(assignment?.fantasy_team_id ?? null);
      setInterests(rows);
      setError("");
    }).catch((err) => { if (active) setError(message(err)); });
    return () => { active = false; };
  }, [seasonYear, user]);

  const interestByPlayerSeason = useMemo(() => new Map(
    interests.filter((interest) => interest.interested_team_id === teamId).map((interest) => [interest.player_season_id, interest]),
  ), [interests, teamId]);

  function canExpressInterest(playerSeason: PlayerSeasonWithRelations | null | undefined) {
    return Boolean(user && teamId && playerSeason?.fantasy_team_id && playerSeason.fantasy_team_id !== teamId);
  }

  async function toggleInterest(playerSeason: PlayerSeasonWithRelations) {
    if (!user || !teamId || !playerSeason.fantasy_team_id || playerSeason.fantasy_team_id === teamId) return;
    const current = interestByPlayerSeason.get(playerSeason.id);
    setBusyPlayerSeasonId(playerSeason.id);
    setError("");
    try {
      if (current) {
        await removePlayerTradeInterest(current.id);
        setInterests((rows) => rows.filter((row) => row.id !== current.id));
      } else {
        const created = await addPlayerTradeInterest({
          playerSeasonId: playerSeason.id,
          interestedTeamId: teamId,
          ownerTeamId: playerSeason.fantasy_team_id,
          seasonYear,
          createdBy: user.id,
        });
        setInterests((rows) => [created, ...rows]);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyPlayerSeasonId(null);
    }
  }

  return {
    canExpressInterest,
    isInterested: (playerSeasonId: number) => interestByPlayerSeason.has(playerSeasonId),
    busyPlayerSeasonId,
    toggleInterest,
    error,
  };
}
