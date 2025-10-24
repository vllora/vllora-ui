import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { AuthConsumer } from '@/contexts/AuthContext';

interface OTPFormProps {
  email: string;
  session: string;
  onChangeEmail: () => void;
}

export function OTPForm({ email, session, onChangeEmail }: OTPFormProps) {
  const navigate = useNavigate();
  const { setUserEmail } = AuthConsumer();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const apiUrl = import.meta.env.VITE_LANGDB_API_URL;

  const handleChange = (index: number, value: string) => {
    // Only allow single digit
    if (value.length > 1) {
      value = value.slice(-1);
    }

    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError(null); // Clear error on input

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // If current is empty, go back and clear previous
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      } else {
        // Clear current
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];

    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }

    setOtp(newOtp);

    // Focus the next empty input or the last one
    const nextEmptyIndex = Math.min(pastedData.length, 5);
    inputRefs.current[nextEmptyIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const otpCode = otp.join('');

    try {
      // Verify OTP with backend
      const response = await fetch(`${apiUrl}/session/otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code: otpCode,
          session
        }),
      });

      if (!response.ok) {
        throw new Error('Invalid OTP. Please try again.');
      }

      // Store email in localStorage
      setUserEmail(email);

      toast.success('Login successful!');
      // Redirect to home page
      navigate('/');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
      // Clear OTP on error
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const isComplete = otp.every(digit => digit !== '');

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-center gap-2 sm:gap-3">
          {otp.map((digit, index) => (
            <Input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={loading}
              className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl sm:text-3xl font-bold bg-background/50 border-2 border-border/60 focus:border-[rgb(var(--theme-500))] focus:ring-2 focus:ring-[rgb(var(--theme-500))]/20 transition-all rounded-lg"
              autoComplete="off"
            />
          ))}
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Code sent to <span className="text-foreground/80 font-medium">{email}</span>
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        <Button
          type="submit"
          variant="default"
          className="w-full h-12 bg-gradient-to-r from-[rgb(var(--theme-500))] to-[rgb(var(--theme-600))] hover:from-[rgb(var(--theme-600))] hover:to-[rgb(var(--theme-700))] text-white font-medium transition-all duration-200 shadow-lg shadow-[rgb(var(--theme-500))]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading || !isComplete}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Verifying...</span>
            </div>
          ) : (
            'Verify Code'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 border-border/60 hover:bg-muted/30 hover:border-border transition-colors"
          onClick={onChangeEmail}
          disabled={loading}
        >
          Change Email
        </Button>
      </div>
    </form>
  );
}
