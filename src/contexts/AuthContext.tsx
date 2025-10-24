import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth';

interface User {
  email: string;
  sub: string;
  username?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to decode JWT token
function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (idToken) {
        const payload = parseJwt(idToken);
        if (payload) {
          setUser({
            email: payload.email,
            sub: payload.sub,
            username: payload['cognito:username'],
          });
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const signOut = async () => {
    try {
      await amplifySignOut();
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const refreshAuth = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        signOut,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthConsumer() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('AuthConsumer must be used within an AuthProvider');
  }
  return context;
}

// Hook to get auth tokens
export async function getAuthTokens() {
  try {
    const session = await fetchAuthSession();
    return {
      idToken: session.tokens?.idToken?.toString(),
      accessToken: session.tokens?.accessToken?.toString(),
    };
  } catch (error) {
    console.error('Error getting auth tokens:', error);
    return null;
  }
}
