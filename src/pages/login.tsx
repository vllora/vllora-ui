import { EmailForm } from './login/EmailForm';

export function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[40vw]">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <h1 className="text-5xl font-bold mb-3 flex items-center justify-center gap-4">
            <span className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent">
              Welcome to
            </span>
            <img
              src="/logo-dark.svg"
              alt="vLLora Logo"
              className="h-16 w-auto animate-in zoom-in duration-500"
            />
          </h1>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <EmailForm />
        </div>
      </div>
    </div>
  );
}
