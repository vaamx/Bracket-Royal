import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-6 min-h-dvh flex items-center">
      <div className="w-full">
        <LoginForm />
      </div>
    </main>
  );
}
