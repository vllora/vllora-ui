import { ProjectDropdown } from './ProjectDropdown';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { DebugControl } from './DebugControl';

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
    <div className="flex justify-between items-center px-6 py-2.5 border-b border-border bg-[#0a0a0a]/80 backdrop-blur-sm relative">
     <div className="flex items-center gap-2">
      {/* Left side - Project Dropdown (absolute positioned) */}
      <div className="flex items-center">
        <div className="scale-90 origin-left">
          <ProjectDropdown onProjectChange={onProjectChange} />
        </div>
      </div>

      {/* Tab Toggle */}
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
          <span>Threads</span>
        </button>
        <button
          onClick={() => handleTabChange("traces")}
          className={`
            flex items-center gap-1.5 px-5 py-1.5 rounded-md text-sm font-medium transition-all
            ${currentTab === "traces"
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }
          `}
        >
          <span>Traces</span>
        </button>
      </div>
     </div>
     <div className="flex items-center gap-2">
      {/* Debug control: Pause/Resume */}
      <DebugControl />
     </div>
    </div>
  );
}

