import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Plus } from "lucide-react";
import { Message, generateMessageId, DEFAULT_MESSAGE_CONTENT } from "./types";
import { SingleMessage } from "./single-message";

interface MessagesSectionProps {
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
}

export function MessagesSection({
  messages,
  onMessagesChange,
}: MessagesSectionProps) {
  const messagesEnabled = messages && messages.length > 0;

  const toggleMessages = () => {
    if (messagesEnabled) {
      // Disable: clear all messages
      onMessagesChange([]);
    } else {
      // Enable: add first message
      handleAddMessage();
    }
  };

  const handleAddMessage = () => {
    const newMessage: Message = {
      id: generateMessageId(),
      role: 'system',
      content: DEFAULT_MESSAGE_CONTENT,
    };
    onMessagesChange([...messages, newMessage]);
  };

  const handleUpdateMessage = (updatedMessage: Message) => {
    const updatedMessages = messages.map((msg) =>
      msg.id === updatedMessage.id ? updatedMessage : msg
    );
    onMessagesChange(updatedMessages);
  };

  const handleDeleteMessage = (messageId: string) => {
    const filteredMessages = messages.filter((msg) => msg.id !== messageId);
    onMessagesChange(filteredMessages);
  };

  return (
    <div className="space-y-3 py-2">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between space-x-2 py-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="messages_enabled" className="text-sm font-medium">
            Messages
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Add messages to define how the model should behave and interact. Use {"{{"} and {"}}"} to define variables.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          id="messages_enabled"
          checked={messagesEnabled}
          onCheckedChange={toggleMessages}
        />
      </div>

      {/* Messages - only shown when enabled */}
      {messagesEnabled && (
        <div className="space-y-2 py-1 pl-1">
          <div className="space-y-2">
            {messages.map((message) => (
              <SingleMessage
                key={message.id}
                message={message}
                onUpdate={handleUpdateMessage}
                onDelete={() => handleDeleteMessage(message.id)}
              />
            ))}
          </div>

          {/* Add Message Button */}
          <Button
            onClick={handleAddMessage}
            variant="outline"
            size="sm"
            className="w-full gap-2 border-dashed !mt-3"
          >
            <Plus className="h-4 w-4" />
            Add Message
          </Button>
        </div>
      )}
    </div>
  );
}
