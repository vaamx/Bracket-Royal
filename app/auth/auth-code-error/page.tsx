import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AuthCodeError() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <h1 className="text-xl font-black">Sign-in link expired</h1>
        <p className="mt-2 text-sm text-white/70">
          That link didn&apos;t work or has already been used. Request a fresh one.
        </p>
        <div className="mt-4">
          <Link href="/login">
            <Button>Back to sign in</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
