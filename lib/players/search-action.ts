"use server";
import { searchPlayers } from "@/lib/players/queries";
export async function searchPlayersAction(q: string) {
  return searchPlayers(q);
}
