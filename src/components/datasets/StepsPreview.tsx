/**
 * StepsPreview
 *
 * Preview component showing the dataset workflow steps.
 * Displays a horizontal stepper with connecting lines: Collect data → Organize → Fine-tune
 */

interface StepsPreviewProps {
  /** Currently active step (1-based). Defaults to 1. */
  activeStep?: number;
}

export function StepsPreview({ activeStep = 1 }: StepsPreviewProps) {
  const steps = [
    { number: 1, label: "Collect data" },
    { number: 2, label: "Organize" },
    { number: 3, label: "Fine-tune" },
  ];

  return (
    <div className="w-full pt-6 border-t border-border">
      <p className="text-xs text-muted-foreground mb-6 uppercase tracking-widest text-center">
        What happens next
      </p>

      {/* Steps with connecting lines */}
      <div className="flex items-center justify-between px-4">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            {/* Step */}
            <div className="flex items-center gap-3">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step.number <= activeStep
                    ? "bg-[rgba(var(--theme-500),0.15)] border-2 border-[rgba(var(--theme-500),0.4)] text-[rgb(var(--theme-500))]"
                    : "bg-muted border border-border text-muted-foreground"
                }`}
              >
                {step.number}
              </div>
              <span
                className={`text-sm font-medium ${
                  step.number <= activeStep
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line (except for last step) */}
            {index < steps.length - 1 && (
              <div className="flex-1 mx-6 flex items-center">
                <div
                  className={`h-px flex-1 ${
                    step.number < activeStep
                      ? "bg-[rgba(var(--theme-500),0.4)]"
                      : "bg-border"
                  }`}
                />
                <svg
                  className={`w-4 h-4 -ml-1 ${
                    step.number < activeStep
                      ? "text-[rgba(var(--theme-500),0.4)]"
                      : "text-border"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
