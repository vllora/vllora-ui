import { X, Database, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface FloatingActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onAddToDataset: () => void;
  onDelete?: () => void;
  isVisible: boolean;
}

export const FloatingActionBar = ({
  selectedCount,
  onClearSelection,
  onAddToDataset,
  onDelete,
  isVisible,
}: FloatingActionBarProps) => {
  return (
    <AnimatePresence>
      {isVisible && selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "absolute bottom-6 left-4 right-4 z-50 mx-auto w-fit max-w-[calc(100%-2rem)]",
            "flex items-center gap-3 px-4 py-2.5",
            "bg-[#1a1a1a] border border-border/50 rounded-full shadow-2xl",
            "backdrop-blur-xl"
          )}
        >
          {/* Count badge and text */}
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[rgb(var(--theme-500))]/20 text-[rgb(var(--theme-500))] text-xs font-medium">
              {selectedCount}
            </span>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              spans selected
            </span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-border/50" />

          {/* Add to Dataset button */}
          <Button
            variant="default"
            size="sm"
            onClick={onAddToDataset}
            className="gap-2 rounded-full bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white whitespace-nowrap"
          >
            <Database className="h-4 w-4" />
            Add to Dataset
          </Button>

          {/* Delete button */}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearSelection}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
