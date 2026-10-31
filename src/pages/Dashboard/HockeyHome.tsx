import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { deleteChatMessage, fetchChatMessages, sendChatMessage, type ChatMessage } from "../../lib/chat";
import { supabase } from "../../lib/supabase";
import { applyTeamBranding, fetchFantasyTeams, fetchTeamBrandingHistory, type FantasyTeam } from "../../lib/fantasyTeams";
import { CURRENT_LEAGUE_SEASON } from "../../lib/leagueSeasons";

const PAGE_SIZE = 50;
const emojiChoices = ["😀", "😂", "⚾", "🔥", "👍", "👏", "🎉", "🏟️"];

function initials(name: string) {
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FO";
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(timestamp));
}

function MessageContent({ message, teams }: { message: string; teams: FantasyTeam[] }) {
  const parts = message.split(/(\[team:\d+\])/g);
  return <>{parts.map((part, index) => {
    const match = part.match(/^\[team:(\d+)\]$/);
    if (!match) return <span key={`${part}-${index}`}>{part}</span>;
    const team = teams.find((item) => item.id === Number(match[1]));
    if (!team?.logo) return <span key={`${part}-${index}`}>{part}</span>;
    return <Link key={`${part}-${index}`} to={`/teams/${team.id}`} title={team.team_name} className="mx-0.5 inline-flex align-middle"><img src={team.logo} alt={`${team.team_name} logo`} className="inline-block h-7 w-7 rounded-md border border-gray-200 bg-white object-contain p-0.5 dark:border-gray-700" /></Link>;
  })}</>;
}

export default function HockeyHome() {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [teams, setTeams] = useState<FantasyTeam[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const didScrollInitiallyRef = useRef(false);

  useLayoutEffect(() => {
    if (loading || didScrollInitiallyRef.current || messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    didScrollInitiallyRef.current = true;
  }, [loading, messages]);

  useEffect(() => {
    let active = true;
    fetchChatMessages(PAGE_SIZE)
      .then((rows) => {
        if (!active) return;
        setMessages([...rows].reverse());
        setHasOlder(rows.length === PAGE_SIZE);
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));

    Promise.all([fetchFantasyTeams(), fetchTeamBrandingHistory()])
      .then(([teamRows, branding]) => {
        if (active) setTeams(teamRows.map((team) => applyTeamBranding(team, branding, CURRENT_LEAGUE_SEASON)).sort((a, b) => a.id - b.id));
      })
      .catch(() => {});

    const channel = supabase.channel("league-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const message = payload.new as ChatMessage;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        const deleted = payload.old as ChatMessage;
        setMessages((current) => current.filter((item) => item.id !== deleted.id));
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  async function loadOlder() {
    const oldestId = messages[0]?.id;
    if (!oldestId || loadingOlder) return;
    setLoadingOlder(true);
    setError("");
    try {
      const rows = await fetchChatMessages(PAGE_SIZE, oldestId);
      setMessages((current) => [...rows].reverse().concat(current));
      setHasOlder(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!user || !message || message.length > 250 || sending) return;
    setSending(true);
    setError("");
    try {
      const created = await sendChatMessage(user.id, message);
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      setDraft("");
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(message: ChatMessage) {
    if (!window.confirm("Delete this chat message?")) return;
    setDeletingId(message.id);
    setError("");
    try {
      await deleteChatMessage(message.id);
      setMessages((current) => current.filter((item) => item.id !== message.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete message.");
    } finally {
      setDeletingId(null);
    }
  }

  return <>
    <PageMeta title="League Chat | Front Office Baseball League" description="Front Office Baseball League chat" />
    <div className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">FOBL League Chat</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Talk baseball, trades, and league business with the other managers.</p>
        </div>

        <div ref={messagesContainerRef} className="flex min-h-[460px] max-h-[62vh] flex-col overflow-y-auto bg-gray-50/60 px-4 py-5 dark:bg-gray-950/20 sm:px-6">
          {hasOlder && <button type="button" onClick={loadOlder} disabled={loadingOlder} className="mx-auto mb-5 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{loadingOlder ? "Loading…" : "Load older messages"}</button>}
          {loading ? <p className="m-auto text-sm text-gray-500">Loading league chat…</p> : messages.length === 0 ? <div className="m-auto text-center"><p className="text-base font-medium text-gray-700 dark:text-gray-300">No messages yet.</p><p className="mt-1 text-sm text-gray-500">Start the conversation!</p></div> : <div className="space-y-4">{messages.map((message) => <article key={message.id} className="flex items-start gap-3">
            {message.team_logo ? <Link to={message.fantasy_team_id ? `/teams/${message.fantasy_team_id}` : "/teams"} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900"><img src={message.team_logo} alt={`${message.team_name || "Team"} logo`} className="h-full w-full object-contain" /></Link> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{initials(message.author_name)}</div>}
            <div className={`min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border px-4 py-3 shadow-theme-xs ${message.is_system ? "border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10" : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold text-gray-800 dark:text-white/90">{message.author_name}</span>{message.is_system && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{message.system_label||"Official Transaction"}</span>}{message.team_name && <span className="text-xs font-medium text-brand-500">{message.team_name}</span>}<time className="text-[11px] text-gray-400">{formatTimestamp(message.created_at)}</time></div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-gray-700 dark:text-gray-300"><MessageContent message={message.message} teams={teams} /></p>
              {message.is_system && message.link && <Link to={message.link} className="mt-2 inline-flex text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">{message.system_label==="Trade Market"?"View Trade Market":"View transaction"} →</Link>}
              {isAdmin && <button type="button" onClick={() => handleDelete(message)} disabled={deletingId === message.id} className="mt-1 text-[11px] font-semibold text-error-500 hover:underline disabled:opacity-50">{deletingId === message.id ? "Deleting…" : "Delete"}</button>}
            </div>
          </article>)}</div>}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 dark:border-gray-800 sm:p-5">
          {error && <p className="mb-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">{error}</p>}
          <div className="mb-3 flex flex-wrap gap-1.5">{emojiChoices.map((emoji) => <button key={emoji} type="button" onClick={() => setDraft((current) => `${current}${emoji}`.slice(0, 250))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-base hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800">{emoji}</button>)}</div>
          {teams.some((team) => team.logo) && <div className="mb-3"><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Team Logos</p><div className="flex flex-wrap gap-1.5">{teams.filter((team) => team.logo).map((team) => <button key={team.id} type="button" onClick={() => setDraft((current) => { const next = `${current}${current && !current.endsWith(" ") ? " " : ""}[team:${team.id}] `; return next.length <= 250 ? next : current; })} title={`Add ${team.team_name} logo`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white p-1 transition hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900"><img src={team.logo!} alt={team.team_name} className="h-full w-full object-contain" /></button>)}</div></div>}
          <div className="flex items-end gap-3"><div className="min-w-0 flex-1"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={250} rows={2} placeholder="Write a message…" className="w-full resize-none rounded-xl border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /><p className="mt-1 text-right text-[11px] text-gray-400">{draft.length} / 250</p></div><button type="submit" disabled={!draft.trim() || sending} className="mb-5 h-11 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Sending…" : "Send"}</button></div>
        </form>
      </div>
    </div>
  </>;
}
