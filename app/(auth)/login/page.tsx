import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-6">
      <div className="w-full">
        <LoginForm />
      </div>
    </main>
  );
}
