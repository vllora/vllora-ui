import { MessageSquare, Bug } from 'lucide-react';
import { ProjectDropdown } from './ProjectDropdown';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';

interface TabSelectionHeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onProjectChange?: (projectId: string) => void;
}

export function TabSelectionHeader({ currentTab, onTabChange, onProjectChange }: TabSelectionHeaderProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const handleTabChange = (tab: string) => {
    // Update URL with tab query parameter
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    navigate(`${location.pathname}?${params.toString()}`);

    // Call the parent callback
    onTabChange(tab);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[#0f0f0f]">
      {/* Left side - Project Dropdown */}
      <div className="flex items-center gap-3">
        <ProjectDropdown onProjectChange={onProjectChange} />
      </div>

      {/* Center - Tab Toggle */}
      <div className="inline-flex items-center gap-1 bg-[#1a1a1a] rounded-lg p-1 border border-border/40">
        <button
          onClick={() => handleTabChange("threads")}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
            ${currentTab === "threads"
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }
          `}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Threads</span>
        </button>
        <button
          onClick={() => handleTabChange("debug")}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
            ${currentTab === "debug"
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }
          `}
        >
          <Bug className="h-4 w-4" />
          <span>Debug</span>
        </button>
      </div>

      {/* Right side - Empty for balance */}
      <div className="w-[240px]"></div>
    </div>
  );
}
