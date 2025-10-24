import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, LogIn, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface EmailFormProps {
  onSuccess: (email: string, session: string) => void;
}

export function EmailForm({ onSuccess }: EmailFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_LANGDB_API_URL;

  const handleSubmit = async (e: React.FormEvent) => {
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
      toast.success('OTP sent to your email');
      onSuccess(email, data.session);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
  );
}
