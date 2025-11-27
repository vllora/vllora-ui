import type { Message } from "@/hooks/useExperiment";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS: { value: Message["role"]; label: string; color: string }[] = [
  { value: "system", label: "System", color: "text-purple-500" },
  { value: "user", label: "User", color: "text-blue-500" },
  { value: "assistant", label: "Assistant", color: "text-green-500" },
  { value: "tool", label: "Tool", color: "text-orange-500" },
];

interface RoleSelectorProps {
  value: Message["role"];
  onChange: (role: Message["role"]) => void;
  size?: "sm" | "default";
}

export function RoleSelector({ value, onChange, size = "default" }: RoleSelectorProps) {
  const currentRole = ROLE_OPTIONS.find((r) => r.value === value) || ROLE_OPTIONS[1];

  return (
    <Select value={value} onValueChange={(val) => onChange(val as Message["role"])}>
      <SelectTrigger
        className={`
          ${size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-3 text-sm"}
          w-auto gap-1 border-none bg-transparent font-semibold uppercase
          focus:ring-0 focus:ring-offset-0
          ${currentRole.color}
        `}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((role) => (
          <SelectItem
            key={role.value}
            value={role.value}
            className={`font-semibold uppercase ${role.color}`}
          >
            {role.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
