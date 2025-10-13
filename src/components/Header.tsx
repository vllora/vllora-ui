import { ProjectDropdown } from './ProjectDropdown';
import { useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onProjectChange?: (projectId: string) => void;
}

export function Header({ onProjectChange }: HeaderProps) {
  const location = useLocation();
  const isProjectsPage = location.pathname === '/projects';
  const isChatPage = location.pathname.includes('/chat');
  const isSettingsPage = location.pathname === '/settings';

  // Hide header on projects page and chat page
  if (isProjectsPage || isChatPage) {
    return null;
  }

  return (
    <header className="h-16 border-b border-border bg-card/95 backdrop-blur-xl sticky top-0 z-50">
      <div className="h-full flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-3">
          <ProjectDropdown onProjectChange={onProjectChange} />
          {isSettingsPage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-2 hover:bg-accent transition-colors"
            >
              <Home className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}