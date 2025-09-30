import { ProjectDropdown } from './ProjectDropdown';
import { useLocation } from 'react-router-dom';

interface HeaderProps {
  currentProjectId?: string;
  onProjectChange?: (projectId: string) => void;
}

export function Header({ currentProjectId, onProjectChange }: HeaderProps) {
  const location = useLocation();
  const isProjectsPage = location.pathname === '/projects';

  // Hide header completely on projects page
  if (isProjectsPage) {
    return null;
  }

  return (
    <header className="h-16 border-b border-border bg-card/95 backdrop-blur-xl sticky top-0 z-50">
      <div className="h-full flex items-center justify-between px-4 gap-4">
        {/* Left: Project Dropdown */}
        <div className="flex items-center gap-3">
          <ProjectDropdown
            currentProjectId={currentProjectId}
            onProjectChange={onProjectChange}
          />
        </div>
      </div>
    </header>
  );
}