import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Anonymous (or no) session → link/sign-in preserves current picks.
  const isAnonymous = !user || user.is_anonymous === true;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-6">
      <div className="w-full">
        <LoginForm isAnonymous={isAnonymous} />
      </div>
    </main>
  );
}
