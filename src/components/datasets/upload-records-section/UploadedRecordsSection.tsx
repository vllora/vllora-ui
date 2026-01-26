/**
 * UploadedRecordsSection
 *
 * Displays uploaded file info header, search toolbar, records table, and pagination.
 * Used in the Upload File tab of the dataset creation flow.
 * Matches the structure of SpansSelectTable.
 */

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileJson, X, ChevronLeft, ChevronRight, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { UploadedRecordsList, type UploadedRecord } from "./UploadedRecordsList";

const PAGE_SIZE = 100;

export interface UploadedRecordsSectionProps {
  fileName: string;
  records: UploadedRecord[];
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelection: (id: string) => void;
  onClear: () => void;
}

export function UploadedRecordsSection({
  fileName,
  records,
  selectedIds,
  onToggleSelectAll,
  onToggleSelection,
  onClear,
}: UploadedRecordsSectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter records by search query
  const filteredRecords = useMemo(() => {
    if (!debouncedSearch.trim()) return records;

    const query = debouncedSearch.toLowerCase();
    return records.filter((record) => {
      // Search in messages content
      const inputMessages = record.data.input?.messages;
      const outputMessages = record.data.output?.messages;

      const searchInMessages = (messages: unknown): boolean => {
        if (!messages) return false;
        const str = JSON.stringify(messages).toLowerCase();
        return str.includes(query);
      };

      return searchInMessages(inputMessages) || searchInMessages(outputMessages);
    });
  }, [records, debouncedSearch]);

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Paginated records for current page
  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(offset, offset + PAGE_SIZE);
  }, [filteredRecords, offset]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Export selected records as JSONL
  const handleExport = () => {
    const selectedRecords = records.filter((r) => selectedIds.has(r.id));
    if (selectedRecords.length === 0) {
      toast.error("No records selected");
      return;
    }

    try {
      const jsonlContent = selectedRecords
        .map((record) => {
          const inputMessages = (record.data.input?.messages as unknown[]) || [];
          const outputMessage = record.data.output?.messages;
          const messages = outputMessage
            ? [...inputMessages, outputMessage]
            : inputMessages;
          const tools = (record.data.input?.tools as unknown[]) || [];

          return JSON.stringify({ messages, tools });
        })
        .join("\n");

      const blob = new Blob([jsonlContent], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `records-export-${new Date().toISOString().split("T")[0]}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${selectedRecords.length} record${selectedRecords.length !== 1 ? "s" : ""} as JSONL`);
    } catch (err) {
      console.error("Failed to export records:", err);
      toast.error("Failed to export records");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* File info header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{fileName}</span>
          <span className="text-sm text-muted-foreground">
            ({records.length} records)
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>

      {/* Search toolbar - matches SpansFilterToolbar style */}
      <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Search results info */}
        {debouncedSearch && (
          <span className="text-sm text-muted-foreground">
            {filteredRecords.length} of {records.length} records match
          </span>
        )}

        {/* Export Button - shows when records are selected */}
        {selectedIds.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2 ml-auto"
          >
            <Download className="h-4 w-4" />
            Export {selectedIds.size} record{selectedIds.size !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Records table */}
      <UploadedRecordsList
        records={paginatedRecords}
        selectedIds={selectedIds}
        onToggleSelectAll={onToggleSelectAll}
        onToggleSelection={onToggleSelection}
        pageOffset={offset}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 flex-shrink-0">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, filteredRecords.length)} of{" "}
            {filteredRecords.length}
            {debouncedSearch && ` (filtered from ${records.length})`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
