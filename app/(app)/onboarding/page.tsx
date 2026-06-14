import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/leagues/queries";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return (
    <main className="mx-auto max-w-md p-6 min-h-dvh flex items-center">
      <div className="w-full">
        <OnboardingForm initialName={profile.display_name ?? ""} />
      </div>
    </main>
  );
}
