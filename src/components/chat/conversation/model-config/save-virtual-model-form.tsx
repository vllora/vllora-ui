import { useState, forwardRef, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaveVirtualModelFormProps {
  onSave: (data: { name: string }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export interface SaveVirtualModelFormRef {
  submit: () => void;
}

export const SaveVirtualModelForm = forwardRef<SaveVirtualModelFormRef, SaveVirtualModelFormProps>(({
  onSave,
  onCancel,
  isSaving = false,
}, ref) => {
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<{ name?: string }>({});

  const validateForm = (): boolean => {
    const newErrors: { name?: string } = {};

    // Name validation
    if (!name.trim()) {
      newErrors.name = "Name is required";
    } else if (name.trim().length < 3) {
      newErrors.name = "Name must be at least 3 characters";
    } else if (name.trim().length > 50) {
      newErrors.name = "Name must not exceed 50 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSave({
        name: name.trim(),
      });
    }
  };

  // Expose submit method to parent via ref
  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
  }));

  return (
    <div className="space-y-4">
      {/* Name Field */}
      <div className="space-y-1.5">
        <Label htmlFor="vm-name" className="text-xs">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="vm-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Customer Support Agent"
          className="text-sm"
          disabled={isSaving}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name}</p>
        )}
      </div>
    </div>
  );
});

SaveVirtualModelForm.displayName = "SaveVirtualModelForm";
