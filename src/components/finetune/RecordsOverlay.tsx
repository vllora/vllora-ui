import { useState, useMemo } from 'react';
import { useFinetuneContext } from './FinetuneContext';
import { DatasetRecord } from './types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Search,
  X,
  Plus,
  Sparkles,
  Zap,
  Trash2,
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Copy,
  Tag,
} from 'lucide-react';

// Role badge component
function RoleBadge({ role }: { role: string }) {
  const config = {
    system: { label: 'SYS', className: 'bg-zinc-600 text-zinc-200' },
    user: { label: 'USR', className: 'bg-blue-600 text-blue-100' },
    assistant: { label: 'AST', className: 'bg-green-600 text-green-100' },
    tool: { label: 'TOOL', className: 'bg-purple-600 text-purple-100' },
  }[role] || { label: role.toUpperCase().slice(0, 3), className: 'bg-zinc-600 text-zinc-200' };

  return (
    <span className={cn("px-1.5 py-0.5 text-[10px] font-medium rounded", config.className)}>
      {config.label}
    </span>
  );
}

// Message preview component
function MessagePreview({ record }: { record: DatasetRecord }) {
  const displayMessages = record.messages.slice(0, 3);
  const remainingCount = record.messages.length - 3;

  if (!record.isValid && record.invalidReason) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <RoleBadge role={record.messages[0]?.role || 'system'} />
          <span className="text-sm text-zinc-400 truncate">
            {record.messages[0]?.content?.slice(0, 40)}...
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-yellow-500 text-xs">
          <AlertTriangle className="w-3 h-3" />
          {record.invalidReason}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {displayMessages.map((msg, i) => (
        <div key={i} className="flex items-center gap-2">
          <RoleBadge role={msg.role} />
          <span className="text-sm text-zinc-400 truncate max-w-[300px]">
            {msg.content?.slice(0, 50)}{msg.content && msg.content.length > 50 ? '...' : ''}
          </span>
        </div>
      ))}
      {remainingCount > 0 && (
        <span className="text-xs text-zinc-500">+{remainingCount} more messages</span>
      )}
    </div>
  );
}

// Record row actions menu
function RecordActions({ onView, onEdit, onDelete }: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-300">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onView}>
          <Eye className="w-4 h-4 mr-2" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Copy className="w-4 h-4 mr-2" />
          Generate Variations
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Tag className="w-4 h-4 mr-2" />
          Assign Topic
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Context bar for filtered views
function ContextBar({ filter, onClear }: { filter: string; onClear: () => void }) {
  const filterLabels: Record<string, string> = {
    invalid: 'Invalid records',
    gaps: 'Under-represented topics',
    'low-confidence': 'Low confidence records (from Step 2: Topics & Categorization)',
  };

  const label = filterLabels[filter] || filter;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-zinc-700">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Showing:</span>
        <span className="text-zinc-300">{label}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear} className="text-zinc-400 hover:text-zinc-200 gap-1.5">
        Clear Filter
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

export function RecordsOverlay() {
  const {
    currentDataset,
    isRecordsOverlayOpen,
    recordsFilter,
    closeRecordsOverlay,
  } = useFinetuneContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('all');
  const [validFilter, setValidFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  if (!currentDataset) return null;

  // Apply filters
  const filteredRecords = useMemo(() => {
    let records = currentDataset.records;

    // Apply context filter
    if (recordsFilter === 'invalid') {
      records = records.filter(r => !r.isValid);
    } else if (recordsFilter === 'low-confidence') {
      records = records.filter(r => (r.topicConfidence || 1) < 0.7);
    }

    // Apply user filters
    if (topicFilter !== 'all') {
      records = records.filter(r => r.topic === topicFilter);
    }
    if (validFilter === 'valid') {
      records = records.filter(r => r.isValid);
    } else if (validFilter === 'invalid') {
      records = records.filter(r => !r.isValid);
    }
    if (sourceFilter === 'generated') {
      records = records.filter(r => r.isGenerated);
    } else if (sourceFilter === 'original') {
      records = records.filter(r => !r.isGenerated);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      records = records.filter(r =>
        r.messages.some(m => m.content?.toLowerCase().includes(query))
      );
    }

    return records;
  }, [currentDataset.records, recordsFilter, topicFilter, validFilter, sourceFilter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Get unique topics for filter
  const uniqueTopics = useMemo(() => {
    const topics = new Set(currentDataset.records.map(r => r.topic).filter(Boolean));
    return Array.from(topics) as string[];
  }, [currentDataset.records]);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === paginatedRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedRecords.map(r => r.id)));
    }
  };

  const handleSelectRecord = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleClearFilter = () => {
    closeRecordsOverlay();
  };

  return (
    <Dialog open={isRecordsOverlayOpen} onOpenChange={(open) => !open && closeRecordsOverlay()}>
      <DialogContent className="max-w-[90vw] w-[1200px] h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold text-zinc-100">
            Records
          </DialogTitle>
        </DialogHeader>

        {/* Context Bar */}
        {recordsFilter && (
          <ContextBar filter={recordsFilter} onClear={handleClearFilter} />
        )}

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {uniqueTopics.map(topic => (
                  <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={validFilter} onValueChange={setValidFilter}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="Valid" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="invalid">Invalid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="generated">Generated</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-zinc-500 ml-auto">
              {filteredRecords.length.toLocaleString()} records
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add Data
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Generate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={selectedIds.size === 0}
            >
              <Zap className="w-3.5 h-3.5" />
              Evaluate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-400 hover:text-red-300"
              disabled={selectedIds.size === 0}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-zinc-900 z-10">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedIds.size === paginatedRecords.length && paginatedRecords.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="min-w-[400px]">Messages</TableHead>
                <TableHead className="w-28">Topic</TableHead>
                <TableHead className="w-20">Valid</TableHead>
                <TableHead className="w-20">Score</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRecords.map((record) => (
                <TableRow
                  key={record.id}
                  className={cn(
                    "border-zinc-800",
                    selectedIds.has(record.id) && "bg-blue-500/5"
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(record.id)}
                      onCheckedChange={() => handleSelectRecord(record.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <MessagePreview record={record} />
                  </TableCell>
                  <TableCell>
                    {record.topic ? (
                      <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
                        {record.topic}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {record.isValid ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    {record.score !== undefined ? (
                      <span className="text-sm text-zinc-300">
                        {record.score.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RecordActions
                      onView={() => {}}
                      onEdit={() => {}}
                      onDelete={() => {}}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-zinc-500">
            Selected: {selectedIds.size} &bull; Total: {filteredRecords.length.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
