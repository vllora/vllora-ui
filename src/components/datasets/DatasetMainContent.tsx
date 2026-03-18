/**
 * DatasetMainContent
 *
 * Main content area for displaying dataset records.
 * Includes DataFlowBanner, header with stats, and switches between Canvas/Sources/Table views.
 * Note: Evaluator is now a separate section, not handled here.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import type { ViewMode } from "./dataset-detail-header/ViewModeToggle";
import type { CoverageStats, DatasetRecord, TopicHierarchyNode } from "@/types/dataset-types";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { AvailableTopic } from "./record-utils";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { resolveAndGroupBySource } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import { RecordsSectionHeader } from "./dataset-detail-header/RecordsSectionHeader";
import { TopicHierarchyCanvas } from "./dataset-canvas/TopicHierarchyCanvas";
import { RecordsTable } from "./records-table/RecordsTable";
import { RecordDetailSidebar } from "./records-table/RecordDetailSidebar";
import { SourcesView } from "./sources-view/SourcesView";
import { EmptyRecordsState } from "./EmptyRecordsState";
import { TopicDetailView, LinkedSourcesTabContent, collectAllRefs } from "./TopicDetailView";
import { filterRecords, type StatFilter, type RecordRole } from "./record-filters";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { useJobScoreColumns } from "@/hooks/useJobScoreColumns";

type AllTopicsTab = "canvas" | "records" | "linked-sources";

/** Recursively find a topic node by name anywhere in the hierarchy, returning it and its parent path */
function findTopicByName(
  nodes: TopicHierarchyNode[],
  name: string,
  path: string[] = [],
  nodePath: TopicHierarchyNode[] = [],
): { node: TopicHierarchyNode; breadcrumb: string[]; nodePath: TopicHierarchyNode[] } | null {
  for (const node of nodes) {
    if (node.name === name) return { node, breadcrumb: path, nodePath };
    if (node.children) {
      const found = findTopicByName(node.children, name, [...path, node.name], [...nodePath, node]);
      if (found) return found;
    }
  }
  return null;
}

export interface DatasetMainContentProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onExport: () => void;
  workflowId: string;
  records: DatasetRecord[];
  topicHierarchy?: TopicHierarchyNode[];
  coverageStats?: CoverageStats;
  availableTopics: AvailableTopic[];

  /** Filter records to a specific topic and its descendants (from Explorer path) */
  topicFilter?: string;

  // Import + docs handlers (for empty state)
  onImportClick: () => void;
  onDocsClick?: () => void;

  // Canvas state
  selectedTopic: string | null;
  onSelectTopic: (topic: string | null) => void;

  // Table state
  selectedRecord: DatasetRecord | null;
  selectedRecordId: string | null;
  onSelectRecordId: (id: string | null) => void;

  // Handlers
  onAddTopic: (parentTopicName: string | null) => void;
  onRenameTopic: (oldName: string, newName: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onUpdateRecordTopic: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  onDeleteRecord: (recordId: string) => void;
  onSaveRecord: (recordId: string, data: unknown) => Promise<void>;
  onCreateChildTopic: (parentTopicName: string | null, childTopicName: string) => Promise<void>;
  onGenerateForTopic: (topicName: string) => void;
  onGenerateSubtopics: (topicId: string | null) => void;

  // Empty state
  datasetObjective?: string;
  normalizedObjective?: string;

  // Docs processing state
  docsProcessing?: boolean;
  docsProcessingCount?: number;
  docsTotal?: number;

  // Source document filter (from context)
  sourceDocumentFilterName?: string | null;
  onClearSourceDocumentFilter?: () => void;

  /** Handler for updating a topic's custom prompt template */
  onUpdatePromptTemplate?: (topicId: string, template: string | undefined) => void;

  /** Per-topic quality scores for canvas node display */
  topicQualityScores?: Record<string, { avg: number; count: number; evaluated: number }>;

  // Data flow banner counts
  /** Number of knowledge source documents */
  documentCount?: number;
  /** Number of extracted parts across all sources */
  partCount?: number;
}

export function DatasetMainContent({
  viewMode,
  onViewModeChange,
  onExport,
  workflowId,
  records,
  topicHierarchy,
  coverageStats,
  availableTopics,
  topicFilter,
  onImportClick,
  onDocsClick,
  selectedTopic,
  onSelectTopic,
  selectedRecord,
  selectedRecordId,
  onSelectRecordId,
  onAddTopic,
  onRenameTopic,
  onDeleteTopic,
  onUpdateRecordTopic,
  onDeleteRecord,
  onSaveRecord,
  onCreateChildTopic,
  onGenerateForTopic,
  onGenerateSubtopics,
  datasetObjective,
  normalizedObjective,
  docsProcessing,
  docsProcessingCount,
  docsTotal,
  sourceDocumentFilterName,
  onClearSourceDocumentFilter,
  topicQualityScores,
}: DatasetMainContentProps) {
  // Job score columns for record detail sidebar
  const finetuneCtx = FinetuneJobsConsumer();
  const { columns: jobColumns, getScoresForRecord } = useJobScoreColumns(finetuneCtx);

  // Keyboard shortcuts: 1/2/3 switch views, Esc closes record detail
  useKeyboardShortcuts({
    onViewModeChange,
    onEscape: () => onSelectRecordId(null),
  });

  // Selected source ID for sources view (driven by explorer sidebar)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  // Focus a specific part when navigating from record table Source column
  const [focusPartId, setFocusPartId] = useState<string | null>(null);
  // "Back to record" state — stores the previous view + record context
  const [backTo, setBackTo] = useState<{ viewMode: ViewMode; topicFilter?: string; recordId?: string } | null>(null);

  // Listen for view switch events from explorer sidebar (e.g., "All Sources" click)
  useEffect(() => {
    const handleSwitchView = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.viewMode) {
        // If ifCurrently is set, only switch if current view matches
        if (detail.ifCurrently && viewMode !== detail.ifCurrently) return;

        onViewModeChange(detail.viewMode);
        // Reset to Canvas tab when switching to canvas view mode
        if (detail.viewMode === "canvas") {
          setAllTopicsTab("canvas");
        }
        // If switching to sources with a specific sourceId, set it
        if (detail.sourceId !== undefined) {
          setSelectedSourceId(detail.sourceId);
        } else if (detail.viewMode === "sources") {
          setSelectedSourceId(null); // All Sources
        }
        // Clear focus/back state on manual view switches
        setFocusPartId(null);
        setBackTo(null);
      }
    };
    window.addEventListener("vllora_switch_view", handleSwitchView);
    return () => window.removeEventListener("vllora_switch_view", handleSwitchView);
  }, [onViewModeChange, viewMode]);

  // Listen for "navigate to source" events from record table Source column clicks
  useEffect(() => {
    const handleNavigateToSource = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.sourceId) return;

      // Save current view state for "back" navigation
      setBackTo({ viewMode, topicFilter, recordId: selectedRecordId ?? undefined });
      // Switch to sources view with the target source + part
      setSelectedSourceId(detail.sourceId);
      setFocusPartId(detail.partId ?? null);
      onViewModeChange("sources");
    };
    window.addEventListener("vllora_navigate_to_source", handleNavigateToSource);
    return () => window.removeEventListener("vllora_navigate_to_source", handleNavigateToSource);
  }, [viewMode, topicFilter, selectedRecordId, onViewModeChange]);

  // Handle "back to record" from Sources view
  const handleBackToRecord = useCallback(() => {
    if (!backTo) return;
    onViewModeChange(backTo.viewMode);
    setBackTo(null);
    setFocusPartId(null);
  }, [backTo, onViewModeChange]);

  // P0-19: Stat filter state for RecordsSectionHeader clickable chips
  const [activeStatFilter, setActiveStatFilter] = useState<StatFilter>("all");
  // P0-9: Role filter state (currently always "all" — no UI to change it in tabbed layout)
  const [roleFilter] = useState<RecordRole>("all");
  // Search query state
  const [searchQuery, setSearchQuery] = useState("");

  // When a topic is selected from Explorer, filter records to that subtree
  const topicFilteredRecords = useMemo(() => {
    if (!topicFilter || !topicHierarchy) return records;

    const match = findTopicByName(topicHierarchy, topicFilter);
    if (!match) return records;

    // Collect all topic names and IDs under this node (including itself)
    const names = new Set<string>();
    const collect = (node: TopicHierarchyNode) => {
      if (node.id) names.add(node.id);
      names.add(node.name);
      node.children?.forEach(collect);
    };
    collect(match.node);

    return records.filter((r) => {
      if (!r.topic) return false;
      if (names.has(r.topic)) return true;
      const leaf = r.topic.includes("/") ? r.topic.split("/").pop() : undefined;
      if (leaf && names.has(leaf)) return true;
      const metaPath = r.metadata?.topic_path;
      if (typeof metaPath === "string") {
        const metaLeaf = metaPath.split(" > ").pop()?.trim();
        if (metaLeaf && names.has(metaLeaf)) return true;
      }
      return false;
    });
  }, [records, topicFilter, topicHierarchy]);

  // Apply stat filter, role filter, and search to records
  const filteredRecords = useMemo(() => {
    const hasStatFilter = activeStatFilter !== "all";
    const hasRoleFilter = roleFilter !== "all";
    const hasSearch = searchQuery.trim().length > 0;
    if (!hasStatFilter && !hasRoleFilter && !hasSearch) return topicFilteredRecords;
    return filterRecords(topicFilteredRecords, {
      statFilter: hasStatFilter ? activeStatFilter : undefined,
      role: hasRoleFilter ? roleFilter : undefined,
      search: hasSearch ? searchQuery : undefined,
    });
  }, [topicFilteredRecords, activeStatFilter, roleFilter, searchQuery]);

  // When filtering by topic, narrow the hierarchy to just the matched subtree
  const displayHierarchy = useMemo(() => {
    if (!topicFilter || !topicHierarchy) return topicHierarchy;

    const match = findTopicByName(topicHierarchy, topicFilter);
    return match ? [match.node] : topicHierarchy;
  }, [topicFilter, topicHierarchy]);

  // Resolve matched topic node + breadcrumb for TopicDetailView
  const topicDetail = useMemo(() => {
    if (!topicFilter || !topicHierarchy) return null;
    return findTopicByName(topicHierarchy, topicFilter);
  }, [topicFilter, topicHierarchy]);

  const hasTopics = displayHierarchy && displayHierarchy.length > 0;

  // All Topics tab state (canvas | records | linked-sources)
  const [allTopicsTab, setAllTopicsTab] = useState<AllTopicsTab>("canvas");

  // Reset to Canvas tab when navigating to a different topic or "All Topics"
  useEffect(() => {
    setAllTopicsTab("canvas");
  }, [topicFilter]);

  // Collect all source refs from entire hierarchy for "Linked Sources" tab
  const { sources } = KnowledgeSourcesConsumer();
  const allHierarchyRefs = useMemo(() => {
    if (!displayHierarchy) return [];
    const refs: string[] = [];
    for (const node of displayHierarchy) {
      refs.push(...collectAllRefs(node));
    }
    return [...new Set(refs)];
  }, [displayHierarchy]);
  const allGroupedSources = useMemo(
    () => resolveAndGroupBySource(allHierarchyRefs, sources),
    [allHierarchyRefs, sources],
  );

  // "View in Table" from canvas — switch to records tab (All Topics) or table view (topic detail)
  const handleViewInTable = useCallback((topicId: string) => {
    if (!topicDetail) {
      setAllTopicsTab("records");
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("vllora_focus_topic", {
          detail: { topicId, topicName: topicId },
        }));
      }, 100);
    } else {
      onViewModeChange("table");
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("vllora_focus_topic", {
          detail: { topicId, topicName: topicId },
        }));
      }, 100);
    }
  }, [topicDetail, onViewModeChange]);

  // Sources view takes priority — always render when viewMode is "sources",
  // even if records/topics are empty (sources exist independently of records).
  if (viewMode === "sources") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <SourcesView
            selectedSourceId={selectedSourceId}
            focusPartId={focusPartId}
            backTo={backTo}
            onBackToRecord={handleBackToRecord}
            onSelectSource={(sourceId) => {
              setSelectedSourceId(sourceId);
              setFocusPartId(null);
              setBackTo(null);
              window.dispatchEvent(new CustomEvent("vllora_switch_view", {
                detail: { viewMode: "sources", sourceId },
              }));
            }}
          />
        </div>
        <RecordDetailSidebar
          record={selectedRecord}
          onClose={() => onSelectRecordId(null)}
          availableTopics={availableTopics}
          onUpdateTopic={onUpdateRecordTopic}
          onDelete={(recordId) => {
            onDeleteRecord(recordId);
            onSelectRecordId(null);
          }}
          onSave={onSaveRecord}
          records={filteredRecords}
          onNavigate={onSelectRecordId}
          jobColumns={jobColumns}
          getScoresForRecord={getScoresForRecord}
          topicHierarchy={topicHierarchy}
          normalizedObjective={normalizedObjective}
        />
      </div>
    );
  }

  // Show empty state only when no records AND no topic hierarchy
  // If topics exist, show the table/canvas with empty topic groups
  if (records.length === 0 && !hasTopics) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <EmptyRecordsState
          workflowId={workflowId}
          datasetObjective={datasetObjective}
          hasTopicHierarchy={false}
          onImportClick={onImportClick}
          onDocsClick={onDocsClick}
          docsProcessing={docsProcessing}
          docsProcessingCount={docsProcessingCount}
          docsTotal={docsTotal}
        />
      </div>
    );
  }

  // ── Leaf topic detail view (existing TopicDetailView) ──
  // Parent topics (with children) fall through to the "All Topics" tabbed layout
  // which already scopes displayHierarchy and filteredRecords to the selected subtree.
  const isLeafTopic = topicDetail && (!topicDetail.node.children || topicDetail.node.children.length === 0);
  if (isLeafTopic) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-border shrink-0 bg-background">
          <RecordsSectionHeader
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            onExport={onExport}
            records={topicFilteredRecords}
            workflowId={workflowId}
            activeStatFilter={activeStatFilter}
            onStatFilterChange={setActiveStatFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sourceDocumentFilterName={sourceDocumentFilterName}
            onClearSourceDocumentFilter={onClearSourceDocumentFilter}
            hideViewToggle
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <TopicDetailView
            topicNode={topicDetail.node}
            ancestorNodes={topicDetail.nodePath}
            records={filteredRecords}
            onSelectRecord={onSelectRecordId}
            normalizedObjective={normalizedObjective}
          />
        </div>
        <RecordDetailSidebar
          record={selectedRecord}
          onClose={() => onSelectRecordId(null)}
          availableTopics={availableTopics}
          onUpdateTopic={onUpdateRecordTopic}
          onDelete={(recordId) => {
            onDeleteRecord(recordId);
            onSelectRecordId(null);
          }}
          onSave={onSaveRecord}
          records={filteredRecords}
          onNavigate={onSelectRecordId}
          jobColumns={jobColumns}
          getScoresForRecord={getScoresForRecord}
          topicHierarchy={topicHierarchy}
          normalizedObjective={normalizedObjective}
        />
      </div>
    );
  }

  // ── All Topics view with tabbed layout ──
  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Stats bar — always hide view toggle for All Topics (tabs handle switching) */}
      <div className="px-4 py-2 border-b border-border shrink-0 bg-background">
        <RecordsSectionHeader
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onExport={onExport}
          records={topicFilteredRecords}
          workflowId={workflowId}
          activeStatFilter={activeStatFilter}
          onStatFilterChange={setActiveStatFilter}
          sourceDocumentFilterName={sourceDocumentFilterName}
          onClearSourceDocumentFilter={onClearSourceDocumentFilter}
          hideViewToggle
        />
      </div>

      {/* Tab bar: Canvas | Records | Linked Sources */}
      <div className="px-4 shrink-0 border-b border-border">
        <div className="flex items-center gap-0">
          <AllTopicsTabButton
            active={allTopicsTab === "canvas"}
            label="Canvas"
            onClick={() => setAllTopicsTab("canvas")}
          />
          <AllTopicsTabButton
            active={allTopicsTab === "records"}
            label={`Records (${filteredRecords.length})`}
            onClick={() => setAllTopicsTab("records")}
          />
          <AllTopicsTabButton
            active={allTopicsTab === "linked-sources"}
            label={`Linked Sources (${allGroupedSources.size})`}
            onClick={() => setAllTopicsTab("linked-sources")}
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {allTopicsTab === "canvas" && (
          <TopicHierarchyCanvas
            hierarchy={displayHierarchy}
            records={filteredRecords}
            workflowId={workflowId}
            coverageStats={coverageStats}
            onSelectTopic={onSelectTopic}
            selectedTopic={selectedTopic}
            onAddTopic={onAddTopic}
            onRenameTopic={onRenameTopic}
            onDeleteTopic={onDeleteTopic}
            onUpdateRecordTopic={onUpdateRecordTopic}
            onDeleteRecord={onDeleteRecord}
            onSaveRecord={onSaveRecord}
            onCreateChildTopic={onCreateChildTopic}
            onGenerateForTopic={onGenerateForTopic}
            onGenerateSubtopics={onGenerateSubtopics}
            onSelectRecordId={onSelectRecordId}
            onViewInTable={handleViewInTable}
            datasetObjective={datasetObjective}
            normalizedObjective={normalizedObjective}
            topicQualityScores={topicQualityScores}
          />
        )}
        {allTopicsTab === "records" && (
          <div className="flex-1 overflow-y-auto">
            <RecordsTable
              records={filteredRecords}
              workflowId={workflowId}
              showHeader={true}
              showFooter={false}
              height="auto"
              groupByTopic={true}
              topicHierarchy={displayHierarchy}
              availableTopics={availableTopics}
              onUpdateTopic={onUpdateRecordTopic}
              onDelete={onDeleteRecord}
              onSave={onSaveRecord}
              onExpand={(record) => onSelectRecordId(record.id)}
              viewingRecordId={selectedRecordId}
              onDeleteTopic={onDeleteTopic}
              onGenerateForTopic={onGenerateForTopic}
              onGenerateSubtopics={onGenerateSubtopics}
              roleFilter={roleFilter}
              onRoleFilterChange={() => {}}
              datasetObjective={datasetObjective}
              normalizedObjective={normalizedObjective}
            />
          </div>
        )}
        {allTopicsTab === "linked-sources" && (
          <div className="flex-1 overflow-y-auto">
            <LinkedSourcesTabContent groupedSources={allGroupedSources} />
          </div>
        )}
      </div>

      {/* Record Detail Sidebar — shared across both table and canvas views (renders via portal) */}
      <RecordDetailSidebar
        record={selectedRecord}
        onClose={() => onSelectRecordId(null)}
        availableTopics={availableTopics}
        onUpdateTopic={onUpdateRecordTopic}
        onDelete={(recordId) => {
          onDeleteRecord(recordId);
          onSelectRecordId(null);
        }}
        onSave={onSaveRecord}
        records={filteredRecords}
        onNavigate={onSelectRecordId}
        jobColumns={jobColumns}
        getScoresForRecord={getScoresForRecord}
        topicHierarchy={topicHierarchy}
        normalizedObjective={normalizedObjective}
      />
    </div>
  );
}

// ─── Tab Button (matches TopicDetailView style) ───

function AllTopicsTabButton({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
        active
          ? "border-[rgb(var(--theme-500))] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
