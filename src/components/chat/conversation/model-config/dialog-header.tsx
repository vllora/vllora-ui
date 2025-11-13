import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings2, Sparkles } from "lucide-react";

interface EnhancedDialogHeaderProps {
  title: string;
  description: string;
}

export function ModelConfigDialogHeader({ title, description }: EnhancedDialogHeaderProps) {

  return (
    <DialogHeader className="space-y-4 pb-4 border-b border-border">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(var(--theme-500))]/10 border border-border">
          <Settings2 className="h-5 w-5 text-[rgb(var(--theme-500))]" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              {title}
              <Sparkles className="h-4 w-4 text-[rgb(var(--theme-500))]" />
            </DialogTitle>
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
