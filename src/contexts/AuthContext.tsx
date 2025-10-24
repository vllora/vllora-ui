import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const STORAGE_KEY = 'vlora_user_email';

interface User {
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => void;
  setUserEmail: (email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = () => {
    const email = localStorage.getItem(STORAGE_KEY);
    if (email) {
      setUser({ email });
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const setUserEmail = (email: string) => {
    localStorage.setItem(STORAGE_KEY, email);
    setUser({ email });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        signOut,
        setUserEmail,
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
