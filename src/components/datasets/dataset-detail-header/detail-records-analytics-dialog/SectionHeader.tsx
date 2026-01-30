/**
 * SectionHeader
 *
 * Styled section header for analytics sections.
 */

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
      {children}
    </h3>
  );
}
