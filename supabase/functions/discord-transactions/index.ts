import { createClient } from "npm:@supabase/supabase-js@2";

type Delivery = {
  transaction_id: number;
  attempt_count: number;
};

type Team = {
  id: number;
  team_name: string;
  abbreviation: string | null;
  logo: string | null;
  primary_color: string | null;
};

type Player = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type TradePlayer = {
  to_team_id: number;
  player_season: {
    position: string | null;
    salary: number | null;
    term_end_year: number | null;
    player: Player | null;
  } | null;
};

type Transaction = {
  id: number;
  action: string;
  transaction_date: string;
  season_year: number;
  salary: number | null;
  term_end_year: number | null;
  contract_group: string | null;
  position: string | null;
  notes: string | null;
  description: string | null;
  trade_offer_id: number | null;
  created_at: string;
  player: Player | null;
  fantasy_team: Team | null;
  trade_offer: {
    from_team: Team | null;
    to_team: Team | null;
    third_team: Team | null;
    trade_offer_players: TradePlayer[];
  } | null;
};

const transactionSelect = `
  id,
  action,
  transaction_date,
  season_year,
  salary,
  term_end_year,
  contract_group,
  position,
  notes,
  description,
  trade_offer_id,
  created_at,
  player:players(full_name, first_name, last_name),
  fantasy_team:fantasy_teams(id, team_name, abbreviation, logo, primary_color),
  trade_offer:trade_offers!league_transactions_trade_offer_id_fkey(
    from_team:fantasy_teams!trade_offers_from_team_id_fkey(id, team_name, abbreviation, logo, primary_color),
    to_team:fantasy_teams!trade_offers_to_team_id_fkey(id, team_name, abbreviation, logo, primary_color),
    third_team:fantasy_teams!trade_offers_third_team_id_fkey(id, team_name, abbreviation, logo, primary_color),
    trade_offer_players(
      to_team_id,
      player_season:player_seasons(position, salary, term_end_year, player:players(full_name, first_name, last_name))
    )
  )
`;

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function playerName(player: Player | null | undefined) {
  return player?.full_name
    || [player?.first_name, player?.last_name].filter(Boolean).join(" ")
    || "Unknown player";
}

function actionLabel(action: string) {
  return ({
    signed: "Signing",
    called_up: "Call-up",
    waived: "Waiver",
    claimed: "Waiver Claim",
    bought_out: "Contract Buyout",
    retained: "Player Retained",
    injured_reserve: "Injured Reserve",
    long_term_injured_reserve: "Long Term Injured Reserve",
    released_to_rfa_offer: "RFA Offer",
    matched_rfa_offer: "RFA Offer Matched",
    competitive_balance_drafted: "Competitive Balance Draft Selection",
    traded: "Trade Acquisition",
  } as Record<string, string>)[action] || "Transaction";
}

function actionSentence(transaction: Transaction) {
  const team = transaction.fantasy_team?.team_name || "Unknown team";
  const name = playerName(transaction.player);
  const position = transaction.action === "competitive_balance_drafted" ? "prospect " : transaction.position ? `${transaction.position.toUpperCase()} ` : "";
  const phrases: Record<string, [string, string]> = {
    signed: ["have signed", ""],
    called_up: ["have called up", ""],
    waived: ["have waived", ""],
    claimed: ["have claimed", ""],
    bought_out: ["have bought out", ""],
    retained: ["have retained", ""],
    injured_reserve: ["have assigned", " to Injured Reserve"],
    long_term_injured_reserve: ["have assigned", " to Long Term Injured Reserve"],
    released_to_rfa_offer: ["have released", " to an RFA offer"],
    matched_rfa_offer: ["have matched an RFA offer for", ""],
    competitive_balance_drafted: ["have selected", " in the Competitive Balance Draft"],
    traded: ["have acquired", " via trade"],
  };
  const [verb, suffix] = phrases[transaction.action] || ["have updated", ""];
  return `**${team}** ${verb} ${position}**${name}**${suffix}.`;
}

function colorNumber(color: string | null | undefined) {
  const normalized = color?.replace("#", "");
  return normalized && /^[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized, 16)
    : 0x465fff;
}

function siteUrl(transaction: Transaction) {
  const base = (Deno.env.get("SITE_URL") || "https://greatlakesdynasty.ca").replace(/\/$/, "");
  const anchor = transaction.trade_offer_id
    ? `trade-${transaction.trade_offer_id}`
    : `transaction-${transaction.id}`;
  return `${base}/transactions#${anchor}`;
}

function discordPayload(transaction: Transaction) {
  const url = siteUrl(transaction);
  const embed: Record<string, unknown> = {
    title: transaction.trade_offer_id ? "GLDHL Trade" : `GLDHL ${actionLabel(transaction.action)}`,
    url,
    color: colorNumber(transaction.fantasy_team?.primary_color),
    timestamp: transaction.created_at,
    footer: { text: `Transaction date: ${transaction.transaction_date}` },
  };

  if (transaction.trade_offer_id && transaction.trade_offer) {
    const teams = [
      transaction.trade_offer.from_team,
      transaction.trade_offer.to_team,
      transaction.trade_offer.third_team,
    ].filter((team): team is Team => Boolean(team));
    embed.color = colorNumber(teams[0]?.primary_color);
    embed.description = "A trade has been approved by the GLDHL Commissioner.";
    embed.fields = teams.map((team) => {
      const acquired = transaction.trade_offer!.trade_offer_players
        .filter((move) => move.to_team_id === team.id)
        .map((move) => {
          const position = move.player_season?.position?.toUpperCase();
          return `• ${position ? `${position} ` : ""}**${playerName(move.player_season?.player)}**`;
        });
      return {
        name: `${team.team_name} receive`,
        value: acquired.join("\n") || "No players listed",
        inline: false,
      };
    });
  } else {
    embed.description = actionSentence(transaction);
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];
    if (transaction.salary !== null) {
      fields.push({ name: "Annual salary", value: money.format(transaction.salary), inline: true });
    }
    if (transaction.term_end_year !== null) {
      const years = Math.max(transaction.term_end_year - transaction.season_year + 1, 1);
      fields.push({
        name: "Contract term",
        value: `${years} ${years === 1 ? "year" : "years"} (through ${transaction.term_end_year})`,
        inline: true,
      });
    }
    if (transaction.contract_group) {
      fields.push({ name: "Contract group", value: transaction.contract_group, inline: true });
    }
    if (fields.length) embed.fields = fields;
    if (transaction.fantasy_team?.logo) embed.thumbnail = { url: transaction.fantasy_team.logo };
  }

  if (transaction.notes) {
    const fields = (embed.fields as Array<Record<string, unknown>> | undefined) || [];
    fields.push({ name: "Notes", value: transaction.notes.slice(0, 1024), inline: false });
    embed.fields = fields.slice(0, 25);
  }

  return {
    username: "GLDHL Transactions",
    content: "🏒 **New GLDHL transaction posted**",
    embeds: [embed],
    allowed_mentions: { parse: [] },
  };
}

async function sendToDiscord(webhookUrl: string, payload: unknown) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) return await response.json() as { id?: string };
    const responseText = await response.text();
    if (response.status !== 429) {
      throw new Error(`Discord returned ${response.status}: ${responseText.slice(0, 500)}`);
    }

    let retryAfter = 1;
    try {
      const rateLimit = JSON.parse(responseText) as { retry_after?: number };
      retryAfter = Math.max(rateLimit.retry_after || 1, 0.25);
    } catch {
      retryAfter = 1;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000)));
  }
  throw new Error("Discord rate limit retries were exhausted.");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookUrl = Deno.env.get("DISCORD_TRANSACTIONS_WEBHOOK_URL");
  if (!supabaseUrl || !serviceRoleKey || !webhookUrl) {
    return Response.json({ error: "Required server secrets are missing." }, { status: 500 });
  }

  let requestedBatchSize = 5;
  try {
    const body = await request.json() as { batch_size?: number };
    requestedBatchSize = body.batch_size || requestedBatchSize;
  } catch {
    // Database webhook calls do not need to supply a custom body.
  }
  const batchSize = Math.max(1, Math.min(requestedBatchSize, 25));
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: deliveries, error: claimError } = await supabase
    .rpc("claim_discord_transaction_deliveries", { p_limit: batchSize });
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });

  const results = { claimed: deliveries?.length || 0, sent: 0, failed: 0 };
  for (const delivery of (deliveries || []) as Delivery[]) {
    try {
      const { data, error } = await supabase
        .from("league_transactions")
        .select(transactionSelect)
        .eq("id", delivery.transaction_id)
        .single();
      if (error) throw error;

      const discordMessage = await sendToDiscord(webhookUrl, discordPayload(data as unknown as Transaction));
      const { error: updateError } = await supabase
        .from("discord_transaction_deliveries")
        .update({
          status: "sent",
          discord_message_id: discordMessage.id || null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("transaction_id", delivery.transaction_id);
      if (updateError) throw updateError;
      results.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Discord delivery error";
      const exhausted = delivery.attempt_count >= 8;
      await supabase
        .from("discord_transaction_deliveries")
        .update({
          status: exhausted ? "failed" : "queued",
          last_error: message.slice(0, 2000),
          next_attempt_at: new Date(Date.now() + Math.min(2 ** delivery.attempt_count, 60) * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("transaction_id", delivery.transaction_id);
      results.failed += 1;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return Response.json(results);
});
