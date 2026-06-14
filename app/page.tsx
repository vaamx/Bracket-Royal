import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <header className="text-center">
        <p className="text-xs tracking-[3px] text-[var(--bn-accent)] font-bold">
          FIFA WORLD CUP 2026 · PREDICTIONS
        </p>
        <h1 className="mt-2 text-3xl font-black">Bracket Royale</h1>
      </header>
      <Card>
        <p className="text-sm text-white/70">
          Predict every match. Build your bracket. Climb the leaderboard.
        </p>
        <div className="mt-4 flex gap-3">
          <Button>Get started</Button>
          <Button variant="ghost">How it works</Button>
        </div>
      </Card>
    </main>
  );
}
