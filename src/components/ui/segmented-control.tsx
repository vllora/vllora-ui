interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "default";
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "default",
}: SegmentedControlProps<T>) {
  const paddingClass = size === "sm" ? "p-0.5" : "p-1";
  const buttonPaddingClass = size === "sm" ? "px-2 py-0.5" : "px-3 py-1";

  return (
    <div className={`flex items-center bg-muted rounded-md ${paddingClass}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`${buttonPaddingClass} text-xs rounded transition-colors ${
            value === option.value
              ? "bg-background shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
