import { useState } from 'react';
import { EmailForm } from './login/EmailForm';
import { OTPForm } from './login/OTPForm';

type LoginStep = 'email' | 'otp';

export function LoginPage() {
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [session, setSession] = useState('');

  const handleEmailSuccess = (userEmail: string, sessionId: string) => {
    setEmail(userEmail);
    setSession(sessionId);
    setStep('otp');
  };

  const handleChangeEmail = () => {
    setStep('email');
    setSession('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <h1 className="text-6xl font-bold mb-3">
            <span className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent">
              {step === 'email' ? 'Welcome to Vlora' : 'Verify Email'}
            </span>
          </h1>
        </div>

        <div key={step} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {step === 'email' ? (
            <EmailForm onSuccess={handleEmailSuccess} />
          ) : (
            <OTPForm
              email={email}
              session={session}
              onChangeEmail={handleChangeEmail}
            />
          )}
        </div>
      </div>
    </div>
  );
}
