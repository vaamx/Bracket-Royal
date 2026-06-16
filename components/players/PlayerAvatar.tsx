/** Two-letter initials (first + last name word) for the generated avatar. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * A generated player "portrait" — initials in a tinted disc with a flag badge.
 * We have no real photos in our data source, so this gives every player a
 * consistent, recognizable face. `size` is the diameter in px.
 */
export function PlayerAvatar({ name, flag, size = 40, boot = false }: {
  name: string; flag: string | null; size?: number; boot?: boolean;
}) {
  return (
    <span
      className={"relative inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#1c2c4d] to-[#0a1428] font-black text-white/90 " + (boot ? "ring-2 ring-[var(--bn-gold)]" : "ring-1 ring-white/10")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name)}
      <span
        className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-[var(--bn-bg-deep)] ring-2 ring-[var(--bn-bg-deep)]"
        style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42), fontSize: Math.round(size * 0.3) }}
        aria-hidden
      >
        {flag ?? "🏳️"}
      </span>
    </span>
  );
}
