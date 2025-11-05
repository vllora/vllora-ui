import { ProjectDropdown } from './ProjectDropdown';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { DebugControl } from './DebugControl';
import { GitHubLink } from './GitHubLink';
import { BackendUrlInfo } from './BackendUrlInfo';
import { SlackLink } from './SlackLink';

interface TabSelectionHeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onProjectChange?: (projectId: string) => void;
}

export function TabSelectionHeader({
  currentTab,
  onTabChange,
  onProjectChange,
}: TabSelectionHeaderProps) {
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
    <div className="flex h-16 justify-between items-center px-6 py-3 border-b border-border backdrop-blur-sm relative">
      <div className="flex items-center gap-4">
        {/* Left side - Project Dropdown */}
        <div className="flex items-center">
          <ProjectDropdown onProjectChange={onProjectChange} />
        </div>

        {/* Tab Toggle */}
        <div className="inline-flex items-center gap-1 bg-[#151515] rounded-lg p-1 border border-border/30 shadow-sm">
          <button
            onClick={() => handleTabChange("threads")}
            className={`
              relative flex items-center gap-2 h-10 px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-200
              ${currentTab === "threads"
                ? 'bg-[rgb(var(--theme-500))] text-white shadow-md shadow-[rgb(var(--theme-500))]/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
              }
            `}
          >
            <span>Threads</span>
          </button>
          <button
            onClick={() => handleTabChange("traces")}
            className={`
              relative flex items-center gap-2 h-10 px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-200
              ${currentTab === "traces"
                ? 'bg-[rgb(var(--theme-500))] text-white shadow-md shadow-[rgb(var(--theme-500))]/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
              }
            `}
          >
            <span>Traces</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Backend URL info */}
        <BackendUrlInfo />

        {/* GitHub link */}
        <GitHubLink />

        {/* Slack link */}
        <SlackLink />
        
        {/* Debug control: Pause/Resume */}
        <DebugControl />
      </div>
    </div>
  );
}

