export type Channel = "push" | "email";

export interface DueMatch {
  id: string;
  lockAtMs: number;
}
export interface NotifyUser {
  userId: string;
  push: boolean;
  email: boolean;
}
export interface SelectInput {
  dueMatches: DueMatch[];
  users: NotifyUser[];
  predictedPairs: Set<string>; // `${userId}:${matchId}`
  sentPairs: Set<string>;      // `${userId}:${matchId}:${channel}`
}
export interface Reminder {
  userId: string;
  matchId: string;
  channels: Channel[];
}

/**
 * Decide which lock-reminders to send: for each due match × user, the user's
 * enabled channels they haven't already been sent — unless they've predicted it.
 * Pure; the caller supplies "due" matches (already filtered to the time window).
 */
export function selectDueReminders(input: SelectInput): Reminder[] {
  const out: Reminder[] = [];
  for (const m of input.dueMatches) {
    for (const u of input.users) {
      if (input.predictedPairs.has(`${u.userId}:${m.id}`)) continue;
      const channels: Channel[] = [];
      if (u.push && !input.sentPairs.has(`${u.userId}:${m.id}:push`)) channels.push("push");
      if (u.email && !input.sentPairs.has(`${u.userId}:${m.id}:email`)) channels.push("email");
      if (channels.length > 0) out.push({ userId: u.userId, matchId: m.id, channels });
    }
  }
  return out;
}
