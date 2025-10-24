import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, LogIn, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Hub } from 'aws-amplify/utils';
import { useAuth } from '@/contexts/AuthContext';

type LoginStep = 'email' | 'otp';

export function LoginPage() {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [session, setSession] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_LANGDB_API_URL;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Call backend to create user (if needed) and send OTP
      const response = await fetch(`${apiUrl}/session/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to send OTP. Please try again.');
      }

      const data = await response.json();
      setSession(data.session);
      setStep('otp');
      toast.success('OTP sent to your email');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Verify OTP with backend
      const response = await fetch(`${apiUrl}/session/otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code: otp,
          session
        }),
      });

      if (!response.ok) {
        throw new Error('Invalid OTP. Please try again.');
      }

      // Backend returns Cognito tokens
      const tokens = await response.json();

      // Store tokens in localStorage for Amplify to use
      const cognitoKey = `CognitoIdentityServiceProvider.${import.meta.env.VITE_COGNITO_CLIENT_ID}`;
      const username = email; // or extract from id_token if needed

      localStorage.setItem(`${cognitoKey}.LastAuthUser`, username);
      localStorage.setItem(`${cognitoKey}.${username}.idToken`, tokens.id_token);
      localStorage.setItem(`${cognitoKey}.${username}.accessToken`, tokens.access_token);
      localStorage.setItem(`${cognitoKey}.${username}.refreshToken`, tokens.refresh_token);

      // Notify Amplify Hub about the sign-in
      Hub.dispatch('auth', {
        event: 'signedIn',
        data: { username }
      });

      // Refresh auth context to pick up the new session
      await refreshAuth();

      toast.success('Login successful!');
      // Redirect to home page
      navigate('/');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string) => {
    // Only allow digits and max 6 characters
    const sanitized = value.replace(/\D/g, '').slice(0, 6);
    setOtp(sanitized);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold mb-3">
            <span className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent">
              Welcome
            </span>
          </h1>
          {step === 'otp' && (
            <p className="text-muted-foreground text-base">
              Enter the OTP sent to your email
            </p>
          )}
        </div>

        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-8 shadow-2xl">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-sm font-medium text-foreground/90">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-11 h-12 bg-background/50 border-border/60 focus:border-[rgb(var(--theme-500))] transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="default"
                className="w-full h-12 bg-gradient-to-r from-[rgb(var(--theme-500))] to-[rgb(var(--theme-600))] hover:from-[rgb(var(--theme-600))] hover:to-[rgb(var(--theme-700))] text-white font-medium transition-all duration-200 shadow-lg shadow-[rgb(var(--theme-500))]/20"
                disabled={loading || !email}
              >
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? 'Sending...' : 'Login'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="otp" className="text-sm font-medium text-foreground/90">
                  6-Digit Code
                </Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => handleOtpChange(e.target.value)}
                  required
                  disabled={loading}
                  maxLength={6}
                  className="text-center text-3xl tracking-[0.5em] font-mono h-16 bg-background/50 border-border/60 focus:border-[rgb(var(--theme-500))] transition-colors"
                />
                <p className="text-sm text-muted-foreground text-center pt-1">
                  Code sent to <span className="text-foreground/80 font-medium">{email}</span>
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  type="submit"
                  variant="default"
                  className="w-full h-12 bg-gradient-to-r from-[rgb(var(--theme-500))] to-[rgb(var(--theme-600))] hover:from-[rgb(var(--theme-600))] hover:to-[rgb(var(--theme-700))] text-white font-medium transition-all duration-200 shadow-lg shadow-[rgb(var(--theme-500))]/20"
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-11 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Change Email
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
