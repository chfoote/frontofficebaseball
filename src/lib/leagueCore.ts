import { supabase } from "./supabase";
import { requireSupportedLeague } from "./leagueIdentity";
export type CorePlayer = { id: number; player_api_id: string; full_name: string | null; first_name: string | null; last_name: string | null };
export async function fetchCorePlayers() {
  const rows: CorePlayer[] = [];
  for (let from=0; ; from+=1000) {
    const { data,error }=await supabase.from("players").select("id,player_api_id,full_name,first_name,last_name").order("id").range(from,from+999);
    if(error)throw error;
    rows.push(...(data || []));
    if((data || []).length<1000)return rows;
  }
}
export async function createCoreTeam(leagueId:string,name:string,abbreviation:string) {
  requireSupportedLeague(leagueId);
  const {error}=await supabase.rpc("core_create_team",{p_league_id:leagueId,p_name:name,p_abbreviation:abbreviation});
  if(error)throw error;
}
export async function saveCoreContract(leagueId:string,input:{playerId:number;teamId:number;start:number;end:number;salary:number;position:string}) {
  requireSupportedLeague(leagueId);
  const {error}=await supabase.rpc("core_save_contract",{p_league_id:leagueId,p_player_id:input.playerId,p_team_id:input.teamId,p_start_year:input.start,p_end_year:input.end,p_salary:input.salary,p_position:input.position});
  if(error)throw error;
}
export async function releaseCoreContract(leagueId:string,playerId:number,year:number) {
  requireSupportedLeague(leagueId);
  const {error}=await supabase.rpc("core_release_contract",{p_league_id:leagueId,p_player_id:playerId,p_from_year:year});
  if(error)throw error;
}
