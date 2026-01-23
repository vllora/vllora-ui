import { useFinetuneContext } from './FinetuneContext';
import { PipelineNode, NodeStatus } from './types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Loader2,
  XCircle,
  RefreshCw,
  FileText,
  Edit,
  Rocket,
  BarChart3,
  Sparkles,
  FlaskConical,
  ExternalLink,
  ArrowRight,
  Gauge,
} from 'lucide-react';

// Status badge component
function StatusBadge({ status }: { status: NodeStatus }) {
  const config = {
    complete: { icon: CheckCircle2, label: 'Complete', className: 'text-green-400 bg-green-500/10' },
    running: { icon: Loader2, label: 'Running', className: 'text-blue-400 bg-blue-500/10' },
    attention: { icon: AlertTriangle, label: 'Attention', className: 'text-yellow-400 bg-yellow-500/10' },
    failed: { icon: XCircle, label: 'Failed', className: 'text-red-400 bg-red-500/10' },
    waiting: { icon: Circle, label: 'Waiting', className: 'text-zinc-400 bg-zinc-500/10' },
  }[status];

  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", config.className)}>
      <Icon className={cn("w-3.5 h-3.5", status === 'running' && "animate-spin")} />
      {config.label}
    </span>
  );
}

// Step 1: Extract Records detail
function ExtractRecordsDetail({ onViewRecords, onPullNew }: {
  onViewRecords: () => void;
  onPullNew: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-300 mb-2">
        Extracted 1,042 records from gateway traces
      </p>
      <p className="text-xs text-zinc-500 mb-4">
        Source: Last 7 days &bull; Model: gpt-4o
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPullNew} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Pull New
        </Button>
        <Button variant="outline" size="sm" onClick={onViewRecords} className="gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          View Records
        </Button>
      </div>
    </div>
  );
}

// Step 2: Topics & Categorization detail
function TopicsCategoryDetail({ onEditTopics, onRegenerate, onViewLowConfidence }: {
  onEditTopics: () => void;
  onRegenerate: () => void;
  onViewLowConfidence: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-300 mb-2">
        7 topics &bull; 1,008 records categorized (100%)
      </p>
      <p className="text-xs text-zinc-500 mb-2">
        High confidence: 892 (88%) &bull; Medium: 98 (10%) &bull; Low: 18 (2%)
      </p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {['openings (234)', 'tactics (89)', 'endgames (203)', 'strategy (156)', 'analysis (178)', 'puzzles (98)', 'general (50)'].map((topic, i) => (
          <span key={i} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
            {topic}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEditTopics} className="gap-1.5">
          <Edit className="w-3.5 h-3.5" />
          Edit Topics
        </Button>
        <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerate
        </Button>
        <Button variant="outline" size="sm" onClick={onViewLowConfidence} className="gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Low Confidence
        </Button>
      </div>
    </div>
  );
}

// Step 3: Review Coverage detail
function CoverageDetail({ node, onViewDashboard, onGenerate, onViewGaps, onSkip }: {
  node: PipelineNode;
  onViewDashboard: () => void;
  onGenerate: () => void;
  onViewGaps: () => void;
  onSkip: () => void;
}) {
  const isAttention = node.status === 'attention';

  return (
    <div>
      <p className="text-sm text-zinc-300 mb-3">
        Balance Score: <span className={isAttention ? "text-yellow-400" : "text-green-400"}>
          {isAttention ? '0.35 (Poor)' : '0.72 (Good)'}
        </span>
      </p>

      {isAttention && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-zinc-400 mb-2">Topic Distribution:</p>
          {[
            { name: 'openings', current: 38, target: 25, status: 'over' },
            { name: 'tactics', current: 8, target: 20, status: 'under', needed: 120 },
            { name: 'endgames', current: 27, target: 25, status: 'ok' },
            { name: 'strategy', current: 18, target: 20, status: 'under', needed: 20 },
          ].map((topic, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-zinc-400">{topic.name}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    topic.status === 'under' ? "bg-red-500" : topic.status === 'over' ? "bg-yellow-500" : "bg-green-500"
                  )}
                  style={{ width: `${Math.min(100, (topic.current / topic.target) * 100)}%` }}
                />
              </div>
              <span className="w-12 text-right text-zinc-500">{topic.current}%</span>
              {topic.status === 'under' && (
                <span className="text-red-400">-{topic.needed}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onViewDashboard} className="gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Full Dashboard
        </Button>
        <Button variant="outline" size="sm" onClick={onGenerate} className="gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Generate
        </Button>
        <Button variant="outline" size="sm" onClick={onViewGaps} className="gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          View Gaps
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip} className="gap-1.5">
          Skip
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Step 4: Define Grader detail
function GraderDetail({ onEditGrader, onTestSample }: {
  onEditGrader: () => void;
  onTestSample: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-zinc-300 mb-2">
        Type: LLM as a Judge
      </p>
      <p className="text-xs text-zinc-500 mb-2">
        Model: gpt-4o-mini &bull; Temperature: 0
      </p>
      <p className="text-xs text-zinc-400 mb-4 line-clamp-2">
        Prompt preview: "Rate the response quality from 0 to 1..."
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEditGrader} className="gap-1.5">
          <Edit className="w-3.5 h-3.5" />
          Edit Grader
        </Button>
        <Button variant="outline" size="sm" onClick={onTestSample} className="gap-1.5">
          <FlaskConical className="w-3.5 h-3.5" />
          Test Sample
        </Button>
      </div>
    </div>
  );
}

// Step 5: Dry Run detail
function DryRunDetail({ node, onViewResults, onRerun, onStartTrain, onAdjustGrader }: {
  node: PipelineNode;
  onViewResults: () => void;
  onRerun: () => void;
  onStartTrain: () => void;
  onAdjustGrader: () => void;
}) {
  const isNoGo = node.summary?.includes('NO');

  return (
    <div>
      <p className="text-sm text-zinc-300 mb-2">
        Tested 300 samples &bull; Mean: 0.45 &bull; Std: 0.18 &bull; %&gt;0: 86% &bull; %=1: 7%
      </p>

      {/* Score distribution mini chart */}
      <div className="flex items-end gap-0.5 h-8 mb-4">
        {[5, 8, 15, 25, 35, 45, 55, 40, 30, 20, 15, 7].map((val, i) => (
          <div
            key={i}
            className="flex-1 bg-blue-500/50 rounded-t"
            style={{ height: `${(val / 55) * 100}%` }}
          />
        ))}
      </div>

      {isNoGo && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400 font-medium mb-1">Problem: Scores too low</p>
          <p className="text-xs text-zinc-400">
            Likely causes: Dataset too hard, or grader too strict
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onViewResults} className="gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Full Results
        </Button>
        {isNoGo ? (
          <Button variant="outline" size="sm" onClick={onAdjustGrader} className="gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            Adjust Grader
          </Button>
        ) : (
          <Button size="sm" onClick={onStartTrain} className="gap-1.5">
            <Rocket className="w-3.5 h-3.5" />
            Start Train
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onRerun} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Re-run
        </Button>
      </div>
    </div>
  );
}

// Step 6: Train Model detail
function TrainDetail({ node, onStartTraining, onCancel, onViewResults, onTrainAgain, onDeploy }: {
  node: PipelineNode;
  onStartTraining: () => void;
  onCancel: () => void;
  onViewResults: () => void;
  onTrainAgain: () => void;
  onDeploy: () => void;
}) {
  if (node.status === 'waiting') {
    return (
      <div>
        <p className="text-sm text-zinc-300 mb-2">Ready to start training</p>
        <p className="text-xs text-zinc-500 mb-4">
          Dataset: 1,008 valid records &bull; Grader: LLM Judge &bull; Dry Run: GO (mean: 0.45)
        </p>
        <Button size="sm" onClick={onStartTraining} className="gap-1.5 w-full">
          <Rocket className="w-4 h-4" />
          Start Training
        </Button>
      </div>
    );
  }

  if (node.status === 'running') {
    return (
      <div>
        <div className="mb-4">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span>Progress</span>
            <span>45%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: '45%' }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs mb-4">
          <div>
            <span className="text-zinc-500">Epoch:</span>
            <span className="text-zinc-300 ml-1">1 / 2</span>
          </div>
          <div>
            <span className="text-zinc-500">ETA:</span>
            <span className="text-zinc-300 ml-1">~2 hours</span>
          </div>
          <div>
            <span className="text-zinc-500">Train Reward:</span>
            <span className="text-green-400 ml-1">0.52 (+24%)</span>
          </div>
          <div>
            <span className="text-zinc-500">Valid Reward:</span>
            <span className="text-green-400 ml-1">0.48 (+14%)</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onCancel} className="gap-1.5">
          Cancel Training
        </Button>
      </div>
    );
  }

  // Complete state
  return (
    <div>
      <p className="text-sm text-zinc-300 mb-2">Training completed in 2h 45m</p>
      <p className="text-xs text-zinc-400 mb-2">
        Model: ft:gpt-4o:chess-tutor:abc123
      </p>
      <p className="text-sm text-green-400 mb-4">
        Improvement: 0.45 → 0.67 (+49%)
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onViewResults} className="gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          View Results
        </Button>
        <Button variant="outline" size="sm" onClick={onTrainAgain} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Train Again
        </Button>
        <Button size="sm" onClick={onDeploy} className="gap-1.5">
          <Rocket className="w-3.5 h-3.5" />
          Deploy
        </Button>
      </div>
    </div>
  );
}

// Step 7: Deploy detail
function DeployDetail({ node, onRunBenchmarks, onTestPlayground, onDeploy }: {
  node: PipelineNode;
  onRunBenchmarks: () => void;
  onTestPlayground: () => void;
  onDeploy: () => void;
}) {
  if (node.status === 'complete') {
    return (
      <div>
        <p className="text-sm text-green-400 mb-2">
          Model deployed successfully
        </p>
        <p className="text-xs text-zinc-400 mb-4">
          Model ID: ft:gpt-4o:chess-tutor:abc123
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onTestPlayground} className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            Test in Playground
          </Button>
          <Button variant="outline" size="sm" onClick={onRunBenchmarks} className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Run Benchmarks
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-zinc-300 mb-2">
        Model ready to deploy: ft:gpt-4o:chess-tutor:abc123
      </p>
      <p className="text-xs text-zinc-500 mb-4">
        Improvement: +49%
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRunBenchmarks} className="gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Run Benchmarks
        </Button>
        <Button variant="outline" size="sm" onClick={onTestPlayground} className="gap-1.5">
          <FlaskConical className="w-3.5 h-3.5" />
          Test Playground
        </Button>
        <Button size="sm" onClick={onDeploy} className="gap-1.5">
          <Rocket className="w-3.5 h-3.5" />
          Deploy
        </Button>
      </div>
    </div>
  );
}

// Empty state when no node is selected
function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
      Click a step to view details and actions
    </div>
  );
}

export function DetailPanel() {
  const {
    currentDataset,
    selectedNodeId,
    isDetailPanelCollapsed,
    toggleDetailPanel,
    openRecordsOverlay,
    runStep,
  } = useFinetuneContext();

  if (!currentDataset) return null;

  const selectedNode = selectedNodeId
    ? currentDataset.pipelineNodes.find(n => n.id === selectedNodeId)
    : null;

  // Mock handlers
  const handleViewRecords = () => openRecordsOverlay();
  const handleViewGaps = () => openRecordsOverlay('gaps');
  const handleViewLowConfidence = () => openRecordsOverlay('low-confidence');
  const handleRunStep = () => {
    if (selectedNodeId) runStep(selectedNodeId);
  };

  // Render step-specific content
  const renderStepContent = (node: PipelineNode) => {
    switch (node.id) {
      case 1:
        return (
          <ExtractRecordsDetail
            onViewRecords={handleViewRecords}
            onPullNew={handleRunStep}
          />
        );
      case 2:
        return (
          <TopicsCategoryDetail
            onEditTopics={() => {}}
            onRegenerate={handleRunStep}
            onViewLowConfidence={handleViewLowConfidence}
          />
        );
      case 3:
        return (
          <CoverageDetail
            node={node}
            onViewDashboard={() => {}}
            onGenerate={() => {}}
            onViewGaps={handleViewGaps}
            onSkip={handleRunStep}
          />
        );
      case 4:
        return (
          <GraderDetail
            onEditGrader={() => {}}
            onTestSample={() => {}}
          />
        );
      case 5:
        return (
          <DryRunDetail
            node={node}
            onViewResults={() => {}}
            onRerun={handleRunStep}
            onStartTrain={handleRunStep}
            onAdjustGrader={() => {}}
          />
        );
      case 6:
        return (
          <TrainDetail
            node={node}
            onStartTraining={handleRunStep}
            onCancel={() => {}}
            onViewResults={() => {}}
            onTrainAgain={handleRunStep}
            onDeploy={handleRunStep}
          />
        );
      case 7:
        return (
          <DeployDetail
            node={node}
            onRunBenchmarks={() => {}}
            onTestPlayground={() => {}}
            onDeploy={handleRunStep}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn(
      "border-t border-zinc-800 bg-zinc-900/50 transition-all",
      isDetailPanelCollapsed ? "h-10" : "h-[200px]"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-zinc-800/50">
        {selectedNode ? (
          <>
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-zinc-200">
                {selectedNode.id}. {selectedNode.name}
              </h3>
              <StatusBadge status={selectedNode.status} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
              onClick={toggleDetailPanel}
            >
              {isDetailPanelCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </>
        ) : (
          <span className="text-sm text-zinc-500">Select a step to view details</span>
        )}
      </div>

      {/* Content */}
      {!isDetailPanelCollapsed && (
        <div className="p-4 h-[calc(200px-40px)] overflow-auto">
          {selectedNode ? renderStepContent(selectedNode) : <EmptyState />}
        </div>
      )}
    </div>
  );
}
