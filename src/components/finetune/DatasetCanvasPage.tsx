import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useFinetuneContext } from './FinetuneContext';
import { PipelineCanvas } from './canvas';
import { DetailPanel } from './DetailPanel';
import { HealthIndicator } from './HealthIndicator';
import { RecordsOverlay } from './RecordsOverlay';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  HelpCircle,
  FileText,
  Download,
  Upload,
  FolderTree,
  Loader2,
  ChevronDown,
} from 'lucide-react';

// Data menu dropdown
function DataMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          Data
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="gap-2">
          <Download className="w-4 h-4 text-zinc-500" />
          <div>
            <div className="font-medium">Import Data</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 pl-8">
          Append Records...
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 pl-8">
          Replace All Records...
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2">
          <Upload className="w-4 h-4 text-zinc-500" />
          <div>
            <div className="font-medium">Export Data</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 pl-8">
          Download Records
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 pl-8">
          Download Topics
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2">
          <FolderTree className="w-4 h-4 text-zinc-500" />
          Import Topics...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DatasetCanvasPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    currentDataset,
    loadingCurrentDataset,
    setCurrentDatasetId,
    openRecordsOverlay,
  } = useFinetuneContext();

  // Load dataset on mount
  useEffect(() => {
    if (id) {
      setCurrentDatasetId(id);
    }
    return () => {
      setCurrentDatasetId(null);
    };
  }, [id, setCurrentDatasetId]);

  // Loading state
  if (loadingCurrentDataset) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">Loading dataset...</p>
        </div>
      </div>
    );
  }

  // Not found state
  if (!currentDataset) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <p className="text-zinc-400">Dataset not found</p>
          <Button variant="outline" onClick={() => navigate('/optimization')}>
            Back to Datasets
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/optimization')}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Model Optimization</span>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
            <span className="text-zinc-100 font-medium">{currentDataset.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openRecordsOverlay()}
            className="gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            Records
          </Button>
          <DataMenu />
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400 hover:text-zinc-200"
            onClick={() => navigate(`/optimization/${id}/settings`)}
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400 hover:text-zinc-200"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Health Indicator */}
      <HealthIndicator />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <PipelineCanvas className="flex-1" />
        <DetailPanel />
      </div>

      {/* Records Overlay */}
      <RecordsOverlay />
    </div>
  );
}
