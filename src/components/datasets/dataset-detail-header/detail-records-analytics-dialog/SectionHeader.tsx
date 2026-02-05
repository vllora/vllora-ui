/**
 * SectionHeader
 *
 * Styled section header for analytics sections.
 * Matches the Overview Chart label style.
 */

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs text-muted-foreground mb-1.5">
      {children}
    </h3>
  );
}
