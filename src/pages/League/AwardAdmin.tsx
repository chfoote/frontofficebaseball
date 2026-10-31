import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";
import Input from "../../components/form/input/InputField";
import Label from "../../components/form/Label";
import { fetchFantasyPlayers, type FantasyPlayer } from "../../lib/fantasyPlayers";
import {
  assignPlayerAward,
  createAward,
  deleteAward,
  deletePlayerAward,
  fetchAwards,
  fetchPlayerAwards,
  uploadAwardImage,
  type Award,
  type PlayerAward,
} from "../../lib/awards";

function playerName(player: FantasyPlayer | null) {
  return player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Unknown Player";
}

export default function AwardAdmin() {
  const [awards, setAwards] = useState<Award[]>([]);
  const [assignments, setAssignments] = useState<PlayerAward[]>([]);
  const [players, setPlayers] = useState<FantasyPlayer[]>([]);
  const [awardName, setAwardName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [awardId, setAwardId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [seasonYear, setSeasonYear] = useState(CURRENT_LEAGUE_SEASON);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    const [awardRows, assignmentRows, playerRows] = await Promise.all([
      fetchAwards(true), fetchPlayerAwards(undefined, false), fetchFantasyPlayers(),
    ]);
    setAwards(awardRows);
    setAssignments(assignmentRows);
    setPlayers(playerRows);
  }

  useEffect(() => { loadData().catch((err: Error) => setError(err.message)); }, []);

  async function addAward() {
    if (!awardName.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await createAward({ name: awardName.trim(), image_url: imageUrl.trim() || null });
      setAwardName(""); setImageUrl(""); setSuccess("Award added."); await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to add award."); }
    finally { setSaving(false); }
  }

  async function addAssignment() {
    if (!awardId || !playerId) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await assignPlayerAward({ award_id: Number(awardId), player_id: Number(playerId), season_year: seasonYear });
      setSuccess("Award assigned."); await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to assign award."); }
    finally { setSaving(false); }
  }

  return <div>
    <PageMeta title="Great Lakes Dynasty Hockey League" description="Manage GLDHL player awards" />
    <PageBreadcrumb pageTitle="Manage Awards" />
    {error && <p className="mb-4 rounded-lg bg-error-50 p-3 text-sm text-error-700">{error}</p>}
    {success && <p className="mb-4 rounded-lg bg-success-50 p-3 text-sm text-success-700">{success}</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Award Definitions</h2>
        <div className="mt-4 grid gap-3">
          <div><Label htmlFor="award_name">Award Name</Label><Input id="award_name" value={awardName} onChange={(e) => setAwardName(e.target.value)} placeholder="MVP" /></div>
          <div><Label htmlFor="award_image">Award Image URL</Label><Input id="award_image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." /></div>
          <input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setSaving(true); try { setImageUrl(await uploadAwardImage(file)); setSuccess("Award image uploaded."); } catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); } finally { setSaving(false); } }} className="text-sm text-gray-500" />
          <button type="button" onClick={() => void addAward()} disabled={saving || !awardName.trim()} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Add Award</button>
        </div>
        <div className="mt-5 space-y-2">{awards.map((award) => <div key={award.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800"><div className="flex items-center gap-3">{award.image_url ? <img src={award.image_url} alt="" className="h-10 w-10 rounded-lg object-contain" /> : <div className="h-10 w-10 rounded-lg bg-gray-100" />}<span className="text-sm font-medium">{award.name}</span></div><button type="button" onClick={async () => { await deleteAward(award.id); await loadData(); }} className="text-xs text-error-600">Delete</button></div>)}</div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="font-semibold text-gray-800 dark:text-white/90">Assign Player Award</h2>
        <div className="mt-4 grid gap-3">
          <select value={awardId} onChange={(e) => setAwardId(e.target.value)} className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 dark:border-gray-700 dark:bg-gray-900"><option value="">Select award</option>{awards.filter((award) => award.active).map((award) => <option key={award.id} value={award.id}>{award.name}</option>)}</select>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 dark:border-gray-700 dark:bg-gray-900"><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id}>{playerName(player)}</option>)}</select>
          <Input type="number" min="2026" value={seasonYear} onChange={(e) => setSeasonYear(Number(e.target.value))} />
          <button type="button" onClick={() => void addAssignment()} disabled={saving || !awardId || !playerId} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Assign Award</button>
        </div>
        <div className="mt-5 space-y-2">{assignments.map((assignment) => <div key={assignment.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"><div className="flex items-center gap-3">{assignment.award?.image_url && <img src={assignment.award.image_url} alt="" className="h-9 w-9 rounded object-contain" />}<span>{assignment.award?.name} · {playerName(assignment.player)} · {assignment.season_year}</span></div><button type="button" onClick={async () => { await deletePlayerAward(assignment.id); await loadData(); }} className="text-xs text-error-600">Remove</button></div>)}</div>
      </section>
    </div>
  </div>;
}
