import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { Message, MessageRole } from "./types";

interface SingleMessageProps {
  message: Message;
  onUpdate: (message: Message) => void;
  onDelete: () => void;
}

export function SingleMessage({
  message,
  onUpdate,
  onDelete,
}: SingleMessageProps) {
  const handleRoleChange = (role: MessageRole) => {
    onUpdate({ ...message, role });
  };

  const handleContentChange = (content: string) => {
    onUpdate({ ...message, content });
  };

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-md border border-border/50">
      {/* Header: Role Selector and Delete Button */}
      <div className="flex items-center justify-between gap-2">
        <Select value={message.role} onValueChange={handleRoleChange}>
          <SelectTrigger className="h-7 w-[100px] text-xs border-0 bg-muted/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system" className="text-xs">
              System
            </SelectItem>
            <SelectItem value="user" className="text-xs">
              User
            </SelectItem>
            <SelectItem value="assistant" className="text-xs">
              Assistant
            </SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content Textarea */}
      <Textarea
        value={message.content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder={`Enter ${message.role} message content... (Use {{variable}} for variables)`}
        className="min-h-[70px] text-xs resize-y border-0 bg-muted/50 focus-visible:ring-1"
      />
    </div>
  );
}
