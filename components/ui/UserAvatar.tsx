import { initialsOf } from "@/components/players/PlayerAvatar";

/** A simple initials disc for a player/user (no flag). `size` is the diameter in px. */
export function UserAvatar({ name, size = 32, highlight = false }: {
  name: string; size?: number; highlight?: boolean;
}) {
  return (
    <span
      className={"inline-grid shrink-0 place-items-center rounded-full font-black " + (highlight ? "bg-[var(--bn-gold)]/20 text-[var(--bn-gold)] ring-1 ring-[var(--bn-gold)]/40" : "bg-white/10 text-white/70 ring-1 ring-white/10")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
