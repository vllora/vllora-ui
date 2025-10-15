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
    <div className="flex items-center justify-center px-6 py-2.5 border-b border-border bg-[#0a0a0a]/80 backdrop-blur-sm relative">
      {/* Left side - Project Dropdown (absolute positioned) */}
      <div className="absolute left-4 flex items-center">
        <div className="scale-90 origin-left">
          <ProjectDropdown onProjectChange={onProjectChange} />
        </div>
      </div>

      {/* Center - Tab Toggle */}
      <div className="inline-flex items-center gap-0.5 bg-[#1a1a1a] rounded-lg p-0.5 border border-border/40 shadow-sm">
        <button
          onClick={() => handleTabChange("threads")}
          className={`
            flex items-center gap-1.5 px-5 py-1.5 rounded-md text-sm font-medium transition-all
            ${currentTab === "threads"
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }
          `}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Threads</span>
        </button>
        <button
          onClick={() => handleTabChange("debug")}
          className={`
            flex items-center gap-1.5 px-5 py-1.5 rounded-md text-sm font-medium transition-all
            ${currentTab === "debug"
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }
          `}
        >
          <Bug className="h-3.5 w-3.5" />
          <span>Debug</span>
        </button>
      </div>
    </div>
  );
}
