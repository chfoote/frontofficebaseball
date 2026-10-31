import { FormEvent, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/InputField";
import Label from "../../components/form/Label";
import Checkbox from "../../components/form/input/Checkbox";
import {
  createFantasyTeam,
  createTeamFinish,
  createTeamBranding,
  createTeamManagerTenure,
  deactivateFantasyTeam,
  deleteTeamManagerTenure,
  deleteTeamFinish,
  deleteTeamBranding,
  FantasyTeam,
  FantasyTeamInput,
  FantasyTeamManagerTenure,
  FantasyTeamFinish,
  FantasyTeamBranding,
  fetchFantasyTeams,
  fetchTeamManagerTenures,
  fetchTeamFinishes,
  fetchTeamBrandingHistory,
  updateFantasyTeam,
  uploadTeamLogo,
} from "../../lib/fantasyTeams";
import { PencilIcon, PlusIcon } from "../../icons";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

const emptyForm: FantasyTeamInput = {
  team_name: "",
  abbreviation: "",
  logo: "",
  primary_color: "#1d4ed8",
  secondary_color: "#f97316",
  manager_name: "",
  manager_since: "",
  eastern_farm_system: "",
  western_farm_system: "",
  championships: 0,
  runner_up_finishes: 0,
  third_place_finishes: 0,
  active: true,
  notes: "",
};

function normalizeForm(form: FantasyTeamInput): FantasyTeamInput {
  return {
    team_name: form.team_name.trim(),
    abbreviation: form.abbreviation.trim().toUpperCase(),
    logo: form.logo?.trim() || null,
    primary_color: form.primary_color || null,
    secondary_color: form.secondary_color || null,
    manager_name: form.manager_name?.trim() || null,
    manager_since: form.manager_since || null,
    eastern_farm_system: form.eastern_farm_system?.trim() || null,
    western_farm_system: form.western_farm_system?.trim() || null,
    championships: Number(form.championships) || 0,
    runner_up_finishes: Number(form.runner_up_finishes) || 0,
    third_place_finishes: Number(form.third_place_finishes) || 0,
    active: form.active,
    notes: form.notes?.trim() || null,
  };
}

function toForm(team: FantasyTeam): FantasyTeamInput {
  return {
    team_name: team.team_name,
    abbreviation: team.abbreviation,
    logo: team.logo || "",
    primary_color: team.primary_color || "#1d4ed8",
    secondary_color: team.secondary_color || "#f97316",
    manager_name: team.manager_name || "",
    manager_since: team.manager_since || "",
    eastern_farm_system: team.eastern_farm_system || "",
    western_farm_system: team.western_farm_system || "",
    championships: team.championships,
    runner_up_finishes: team.runner_up_finishes,
    third_place_finishes: team.third_place_finishes,
    active: team.active,
    notes: team.notes || "",
  };
}

export default function TeamAdmin() {
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [form, setForm] = useState<FantasyTeamInput>(emptyForm);
  const [editingTeam, setEditingTeam] = useState<FantasyTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [managerTenures, setManagerTenures] = useState<FantasyTeamManagerTenure[]>([]);
  const [tenureName, setTenureName] = useState("");
  const [tenureStart, setTenureStart] = useState(CURRENT_LEAGUE_SEASON);
  const [tenureEnd, setTenureEnd] = useState<number | "">("");
  const [teamFinishes, setTeamFinishes] = useState<FantasyTeamFinish[]>([]);
  const [finishYear, setFinishYear] = useState(CURRENT_LEAGUE_SEASON);
  const [finishPlacement, setFinishPlacement] = useState<1 | 2 | 3>(1);
  const [brandingHistory, setBrandingHistory] = useState<FantasyTeamBranding[]>([]);
  const [brandingStart, setBrandingStart] = useState(CURRENT_LEAGUE_SEASON);
  const [brandingEnd, setBrandingEnd] = useState<number | "">("");
  const [brandingName, setBrandingName] = useState("");
  const [brandingAbbreviation, setBrandingAbbreviation] = useState("");
  const [brandingLogo, setBrandingLogo] = useState("");
  const [brandingPrimary, setBrandingPrimary] = useState("#1d4ed8");
  const [brandingSecondary, setBrandingSecondary] = useState("#f97316");

  const activeCount = useMemo(
    () => teams.filter((team) => team.active).length,
    [teams],
  );

  async function loadTeams() {
    setLoading(true);
    setError("");
    try {
      setTeams(await fetchFantasyTeams(true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load teams.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeams();
  }, []);

  function updateField<K extends keyof FantasyTeamInput>(
    field: K,
    value: FantasyTeamInput[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingTeam(null);
    setError("");
    setSuccess("");
    setManagerTenures([]);
    setTeamFinishes([]);
    setBrandingHistory([]);
  }

  async function selectTeam(team: FantasyTeam) {
    setEditingTeam(team);
    setForm(toForm(team));
    setError("");
    setSuccess("");
    try {
      const [tenures, finishes, branding] = await Promise.all([
        fetchTeamManagerTenures(team.id),
        fetchTeamFinishes(team.id),
        fetchTeamBrandingHistory(team.id),
      ]);
      setManagerTenures(tenures);
      setTeamFinishes(finishes);
      setBrandingHistory(branding);
      setBrandingName(team.team_name);
      setBrandingAbbreviation(team.abbreviation);
      setBrandingLogo(team.logo || "");
      setBrandingPrimary(team.primary_color || "#1d4ed8");
      setBrandingSecondary(team.secondary_color || "#f97316");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load manager history.");
    }
  }

  async function addBrandingSeason() {
    if (!editingTeam || !brandingName.trim() || !brandingAbbreviation.trim()) return;
    setSaving(true); setError("");
    try {
      await createTeamBranding({
        fantasy_team_id: editingTeam.id,
        start_season: brandingStart,
        end_season: brandingEnd === "" ? null : brandingEnd,
        team_name: brandingName.trim(),
        abbreviation: brandingAbbreviation.trim().toUpperCase(),
        logo: brandingLogo.trim() || null,
        primary_color: brandingPrimary,
        secondary_color: brandingSecondary,
      });
      setBrandingHistory(await fetchTeamBrandingHistory(editingTeam.id));
      setSuccess("Team branding season added.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to add branding history."); }
    finally { setSaving(false); }
  }

  async function removeBrandingSeason(id: number) {
    if (!editingTeam) return;
    setSaving(true);
    try {
      await deleteTeamBranding(id);
      setBrandingHistory(await fetchTeamBrandingHistory(editingTeam.id));
      setSuccess("Branding history removed.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to remove branding history."); }
    finally { setSaving(false); }
  }

  async function addTeamFinish() {
    if (!editingTeam) return;
    setSaving(true);
    setError("");
    try {
      await createTeamFinish({
        fantasy_team_id: editingTeam.id,
        season_year: finishYear,
        placement: finishPlacement,
      });
      const finishes = await fetchTeamFinishes(editingTeam.id);
      setTeamFinishes(finishes);
      setForm((current) => ({
        ...current,
        championships: finishes.filter((finish) => finish.placement === 1).length,
        runner_up_finishes: finishes.filter((finish) => finish.placement === 2).length,
        third_place_finishes: finishes.filter((finish) => finish.placement === 3).length,
      }));
      setSuccess(`${finishYear} finish added.`);
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add finish history.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeamFinish(id: number) {
    if (!editingTeam) return;
    setSaving(true);
    try {
      await deleteTeamFinish(id);
      const finishes = await fetchTeamFinishes(editingTeam.id);
      setTeamFinishes(finishes);
      setForm((current) => ({
        ...current,
        championships: finishes.filter((finish) => finish.placement === 1).length,
        runner_up_finishes: finishes.filter((finish) => finish.placement === 2).length,
        third_place_finishes: finishes.filter((finish) => finish.placement === 3).length,
      }));
      setSuccess("Finish history removed.");
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove finish history.");
    } finally {
      setSaving(false);
    }
  }

  async function addManagerTenure() {
    if (!editingTeam || !tenureName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createTeamManagerTenure({
        fantasy_team_id: editingTeam.id,
        manager_name: tenureName.trim(),
        start_season: tenureStart,
        end_season: tenureEnd === "" ? null : tenureEnd,
      });
      setManagerTenures(await fetchTeamManagerTenures(editingTeam.id));
      setTenureName("");
      setTenureEnd("");
      setSuccess("Manager season added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add manager season.");
    } finally {
      setSaving(false);
    }
  }

  async function removeManagerTenure(id: number) {
    if (!editingTeam) return;
    setSaving(true);
    try {
      await deleteTeamManagerTenure(id);
      setManagerTenures(await fetchTeamManagerTenures(editingTeam.id));
      setSuccess("Manager season removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove manager season.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const logoUrl = await uploadTeamLogo(file);
      updateField("logo", logoUrl);
      setSuccess("Logo uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload logo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = normalizeForm(form);
      if (!payload.team_name || !payload.abbreviation) {
        throw new Error("Team name and abbreviation are required.");
      }

      if (editingTeam) {
        await updateFantasyTeam(editingTeam.id, payload);
        setSuccess("Team updated.");
      } else {
        await createFantasyTeam(payload);
        setSuccess("Team added.");
      }

      resetForm();
      await loadTeams();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save team."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(team: FantasyTeam) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await deactivateFantasyTeam(team.id);
      setSuccess(`${team.team_name} deactivated.`);
      if (editingTeam?.id === team.id) resetForm();
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to deactivate team.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageMeta title="Manage Teams | Front Office Baseball League" description="Manage Front Office Baseball League teams" />
      <PageBreadcrumb pageTitle="Manage Teams" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-gray-800 text-theme-xl dark:text-white/90">
                Fantasy Teams
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {activeCount} active of {teams.length} total
              </p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
            >
              <PlusIcon className="h-4 w-4" />
              New Team
            </button>
          </div>

          {loading ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Loading teams...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                    <th className="px-3 py-3">Team</th>
                    <th className="px-3 py-3">Manager</th>
                    <th className="px-3 py-3">Farm Systems</th>
                    <th className="px-3 py-3">Finishes</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {teams.map((team) => (
                    <tr key={team.id} className="text-sm">
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
                            {team.logo ? (
                              <img
                                src={team.logo}
                                alt={`${team.team_name} logo`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-semibold text-gray-500">
                                {team.abbreviation}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 dark:text-white/90">
                              {team.team_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {team.abbreviation} · Team ID {team.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-gray-600 dark:text-gray-300">
                        {team.manager_name || "Unassigned"}
                      </td>
                      <td className="px-3 py-4 text-gray-500 dark:text-gray-400">
                        {[team.eastern_farm_system, team.western_farm_system].filter(Boolean).join(" / ") || "None"}
                      </td>
                      <td className="px-3 py-4 text-gray-500 dark:text-gray-400">
                        {team.championships} / {team.runner_up_finishes} / {team.third_place_finishes}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            team.active
                              ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {team.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void selectTeam(team)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                            title="Edit team"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeactivate(team)}
                            disabled={!team.active || saving}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {teams.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        No teams have been added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h3 className="font-semibold text-gray-800 text-theme-lg dark:text-white/90">
            {editingTeam ? "Edit Team" : "Add Team"}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {editingTeam
              ? `Team ID ${editingTeam.id} · This ID remains the same when managers change.`
              : "A permanent team ID will be assigned automatically after the team is created."}
          </p>

          <div className="mt-5 grid gap-4">
            <div>
              <Label htmlFor="team_name">Team Name</Label>
              <Input
                id="team_name"
                value={form.team_name}
                onChange={(event) => updateField("team_name", event.target.value)}
                placeholder="Toronto Aces"
              />
            </div>

            <div>
              <Label htmlFor="abbreviation">Abbreviation</Label>
              <Input
                id="abbreviation"
                value={form.abbreviation}
                onChange={(event) => updateField("abbreviation", event.target.value)}
                placeholder="OSA"
              />
            </div>

            <div>
              <Label htmlFor="logo">Logo URL</Label>
              <Input
                id="logo"
                value={form.logo || ""}
                onChange={(event) => updateField("logo", event.target.value)}
                placeholder="https://..."
              />
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                className="mt-3 block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-300"
              />
              {uploading && <p className="mt-2 text-xs text-gray-500">Uploading logo...</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="primary_color">Primary</Label>
                <input
                  id="primary_color"
                  type="color"
                  value={form.primary_color || "#1d4ed8"}
                  onChange={(event) => updateField("primary_color", event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700"
                />
              </div>
              <div>
                <Label htmlFor="secondary_color">Secondary</Label>
                <input
                  id="secondary_color"
                  type="color"
                  value={form.secondary_color || "#f97316"}
                  onChange={(event) => updateField("secondary_color", event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="manager_name">Manager</Label>
              <Input
                id="manager_name"
                value={form.manager_name || ""}
                onChange={(event) => updateField("manager_name", event.target.value)}
                placeholder="Manager name"
              />
            </div>

            <div>
              <Label htmlFor="manager_since">Manager Since</Label>
              <Input
                id="manager_since"
                type="date"
                value={form.manager_since || ""}
                onChange={(event) => updateField("manager_since", event.target.value)}
              />
            </div>

            {editingTeam && (
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Manager History by Season</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Add each manager to Team ID {editingTeam.id}. Leave the end season blank for the current manager.
                </p>
                <div className="mt-3 space-y-2">
                  {managerTenures.map((tenure) => (
                    <div key={tenure.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600 dark:text-gray-300">
                        {tenure.manager_name}: {tenure.start_season}–{tenure.end_season || "present"}
                      </span>
                      <button type="button" onClick={() => void removeManagerTenure(tenure.id)} className="text-error-600 hover:underline" disabled={saving}>
                        Remove
                      </button>
                    </div>
                  ))}
                  {managerTenures.length === 0 && <p className="text-xs text-gray-500">No seasonal manager history yet.</p>}
                </div>
                <div className="mt-4 grid gap-3">
                  <Input value={tenureName} onChange={(event) => setTenureName(event.target.value)} placeholder="Manager name" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="number" min="2026" step={1} value={tenureStart} onChange={(event) => setTenureStart(Number(event.target.value))} placeholder="Start season" />
                    <Input type="number" min={String(tenureStart)} step={1} value={tenureEnd} onChange={(event) => setTenureEnd(event.target.value ? Number(event.target.value) : "")} placeholder="End (blank = current)" />
                  </div>
                  <button type="button" onClick={() => void addManagerTenure()} disabled={saving || !tenureName.trim()} className="rounded-lg border border-brand-500 px-3 py-2 text-sm font-medium text-brand-500 disabled:opacity-50">
                    Add Manager Season
                  </button>
                </div>
              </div>
            )}

            {editingTeam && (
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Team Branding History</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Preserve each name, abbreviation, logo, and colour set for Team ID {editingTeam.id}. Season ranges cannot overlap.</p>
                <div className="mt-3 space-y-2">
                  {brandingHistory.map((branding) => <div key={branding.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-2 text-sm dark:bg-gray-900">
                    <div className="flex min-w-0 items-center gap-2">{branding.logo && <img src={branding.logo} alt="" className="h-8 w-8 rounded object-contain" />}<span className="truncate text-gray-700 dark:text-gray-300">{branding.team_name} ({branding.abbreviation}): {branding.start_season}–{branding.end_season || "present"}</span></div>
                    <button type="button" onClick={() => void removeBrandingSeason(branding.id)} disabled={saving} className="text-xs text-error-600 hover:underline">Remove</button>
                  </div>)}
                  {!brandingHistory.length && <p className="text-xs text-gray-500">No seasonal branding history yet.</p>}
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="grid grid-cols-2 gap-3"><Input type="number" min="2026" value={brandingStart} onChange={(event) => setBrandingStart(Number(event.target.value))} placeholder="Start season" /><Input type="number" min={String(brandingStart)} value={brandingEnd} onChange={(event) => setBrandingEnd(event.target.value ? Number(event.target.value) : "")} placeholder="End (blank = current)" /></div>
                  <Input value={brandingName} onChange={(event) => setBrandingName(event.target.value)} placeholder="Team name" />
                  <Input value={brandingAbbreviation} onChange={(event) => setBrandingAbbreviation(event.target.value)} placeholder="Abbreviation" />
                  <Input value={brandingLogo} onChange={(event) => setBrandingLogo(event.target.value)} placeholder="Logo URL" />
                  <div className="grid grid-cols-2 gap-3"><input type="color" value={brandingPrimary} onChange={(event) => setBrandingPrimary(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 p-1 dark:border-gray-700" /><input type="color" value={brandingSecondary} onChange={(event) => setBrandingSecondary(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 p-1 dark:border-gray-700" /></div>
                  <button type="button" onClick={() => void addBrandingSeason()} disabled={saving || !brandingName.trim() || !brandingAbbreviation.trim()} className="rounded-lg border border-brand-500 px-3 py-2 text-sm font-medium text-brand-500 disabled:opacity-50">Add Branding Season</button>
                </div>
              </div>
            )}

            {editingTeam && (
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-white/90">League Finish History</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Add the team&apos;s placement for each completed season. Medal totals update automatically.
                </p>
                <div className="mt-3 space-y-2">
                  {teamFinishes.map((finish) => (
                    <div key={finish.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600 dark:text-gray-300">
                        {finish.placement === 1 ? "🥇" : finish.placement === 2 ? "🥈" : "🥉"} {finish.season_year}
                      </span>
                      <button type="button" onClick={() => void removeTeamFinish(finish.id)} disabled={saving} className="text-error-600 hover:underline">Remove</button>
                    </div>
                  ))}
                  {teamFinishes.length === 0 && <p className="text-xs text-gray-500">No finish history yet.</p>}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Input type="number" min="2026" step={1} value={finishYear} onChange={(event) => setFinishYear(Number(event.target.value))} />
                  <select value={finishPlacement} onChange={(event) => setFinishPlacement(Number(event.target.value) as 1 | 2 | 3)} className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                    <option value={1}>🥇 First Place</option>
                    <option value={2}>🥈 Second Place</option>
                    <option value={3}>🥉 Third Place</option>
                  </select>
                </div>
                <button type="button" onClick={() => void addTeamFinish()} disabled={saving} className="mt-3 w-full rounded-lg border border-brand-500 px-3 py-2 text-sm font-medium text-brand-500 disabled:opacity-50">
                  Add Season Finish
                </button>
              </div>
            )}

            <div>
              <Label htmlFor="eastern_farm_system">MLB Farm System 1 (legacy fallback)</Label>
              <Input
                id="eastern_farm_system"
                value={form.eastern_farm_system || ""}
                onChange={(event) => updateField("eastern_farm_system", event.target.value)}
                placeholder="Toronto Maple Leafs"
              />
            </div>

            <div>
              <Label htmlFor="western_farm_system">MLB Farm System 2 (legacy fallback)</Label>
              <Input
                id="western_farm_system"
                value={form.western_farm_system || ""}
                onChange={(event) => updateField("western_farm_system", event.target.value)}
                placeholder="Vancouver Canucks"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="championships">Titles</Label>
                <Input
                  id="championships"
                  type="number"
                  min="0"
                  step={1}
                  value={form.championships}
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="runner_up_finishes">Runner-Up</Label>
                <Input
                  id="runner_up_finishes"
                  type="number"
                  min="0"
                  step={1}
                  value={form.runner_up_finishes}
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="third_place_finishes">Third</Label>
                <Input
                  id="third_place_finishes"
                  type="number"
                  min="0"
                  step={1}
                  value={form.third_place_finishes}
                  disabled
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={form.notes || ""}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>

            <Checkbox
              label="Active"
              checked={form.active}
              onChange={(checked) => updateField("active", checked)}
            />
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </p>
          )}
          {success && (
            <p className="mt-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400">
              {success}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={saving || uploading}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Team"}
            </button>
            {editingTeam && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
