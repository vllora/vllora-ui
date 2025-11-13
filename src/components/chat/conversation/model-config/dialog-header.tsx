import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings2, Sparkles, Code2, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EnhancedDialogHeaderProps {
  title: string;
  description: string;
  mode: 'basic' | 'advanced';
  onModeChange: (mode: 'basic' | 'advanced') => void;
  hideToggle?: boolean;
}

export function ModelConfigDialogHeader({ title, description, mode, onModeChange, hideToggle = false }: EnhancedDialogHeaderProps) {

  return (
    <DialogHeader className="space-y-4 pb-4 border-b border-border">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(var(--theme-500))]/10 border border-border">
          <Settings2 className="h-5 w-5 text-[rgb(var(--theme-500))]" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              {title}
              <Sparkles className="h-4 w-4 text-[rgb(var(--theme-500))]" />
            </DialogTitle>

            {/* Mode Toggle Button */}
            {!hideToggle && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onModeChange(mode === 'basic' ? 'advanced' : 'basic')}
                className="flex items-center gap-1.5 h-8 px-3 text-xs"
              >
                {mode === 'basic' ? (
                  <>
                    <Code2 className="h-3.5 w-3.5" />
                    <span>Advanced</span>
                  </>
                ) : (
                  <>
                    <Sliders className="h-3.5 w-3.5" />
                    <span>Basic</span>
                  </>
                )}
              </Button>
            )}
          </div>
          <DialogDescription className="text-sm">
            <span className="text-muted-foreground">
              {description}
            </span>
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}
