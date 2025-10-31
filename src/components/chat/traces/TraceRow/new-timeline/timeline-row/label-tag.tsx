// Predefined color palette (100 harmonious colors for dark theme)
const COLOR_PALETTE = [
    // Blues (0-14)
    { bg: '#3b82f6', text: '#f0f9ff' }, { bg: '#2563eb', text: '#eff6ff' }, { bg: '#1d4ed8', text: '#dbeafe' },
    { bg: '#1e40af', text: '#dbeafe' }, { bg: '#60a5fa', text: '#1e3a8a' }, { bg: '#3b5998', text: '#e0f2fe' },
    { bg: '#4a5568', text: '#e0f2fe' }, { bg: '#0ea5e9', text: '#f0f9ff' }, { bg: '#0284c7', text: '#e0f2fe' },
    { bg: '#0369a1', text: '#e0f2fe' }, { bg: '#075985', text: '#dbeafe' }, { bg: '#38bdf8', text: '#082f49' },
    { bg: '#0891b2', text: '#ecfeff' }, { bg: '#0e7490', text: '#cffafe' }, { bg: '#155e75', text: '#cffafe' },

    // Cyans & Teals (15-29)
    { bg: '#06b6d4', text: '#ecfeff' }, { bg: '#0891b2', text: '#cffafe' }, { bg: '#0e7490', text: '#cffafe' },
    { bg: '#14b8a6', text: '#f0fdfa' }, { bg: '#0d9488', text: '#ccfbf1' }, { bg: '#0f766e', text: '#ccfbf1' },
    { bg: '#115e59', text: '#ccfbf1' }, { bg: '#2dd4bf', text: '#134e4a' }, { bg: '#5eead4', text: '#134e4a' },
    { bg: '#22d3ee', text: '#164e63' }, { bg: '#06b6d4', text: '#ecfeff' }, { bg: '#0891b2', text: '#cffafe' },
    { bg: '#047857', text: '#d1fae5' }, { bg: '#059669', text: '#d1fae5' }, { bg: '#10b981', text: '#064e3b' },

    // Greens (30-44)
    { bg: '#16a34a', text: '#dcfce7' }, { bg: '#15803d', text: '#dcfce7' }, { bg: '#166534', text: '#dcfce7' },
    { bg: '#14532d', text: '#dcfce7' }, { bg: '#22c55e', text: '#052e16' }, { bg: '#4ade80', text: '#14532d' },
    { bg: '#84cc16', text: '#1a2e05' }, { bg: '#65a30d', text: '#ecfccb' }, { bg: '#4d7c0f', text: '#ecfccb' },
    { bg: '#3f6212', text: '#ecfccb' }, { bg: '#365314', text: '#ecfccb' }, { bg: '#a3e635', text: '#1a2e05' },
    { bg: '#86efac', text: '#14532d' }, { bg: '#6ee7b7', text: '#064e3b' }, { bg: '#34d399', text: '#064e3b' },

    // Yellows & Ambers (45-59)
    { bg: '#eab308', text: '#713f12' }, { bg: '#ca8a04', text: '#fef9c3' }, { bg: '#a16207', text: '#fef9c3' },
    { bg: '#854d0e', text: '#fef9c3' }, { bg: '#facc15', text: '#422006' }, { bg: '#fde047', text: '#422006' },
    { bg: '#f59e0b', text: '#78350f' }, { bg: '#d97706', text: '#fef3c7' }, { bg: '#b45309', text: '#fef3c7' },
    { bg: '#92400e', text: '#fef3c7' }, { bg: '#78350f', text: '#fef3c7' }, { bg: '#fbbf24', text: '#451a03' },
    { bg: '#fcd34d', text: '#451a03' }, { bg: '#fde68a', text: '#78350f' }, { bg: '#fb923c', text: '#7c2d12' },

    // Oranges & Reds (60-74)
    { bg: '#f97316', text: '#7c2d12' }, { bg: '#ea580c', text: '#ffedd5' }, { bg: '#c2410c', text: '#ffedd5' },
    { bg: '#9a3412', text: '#ffedd5' }, { bg: '#7c2d12', text: '#ffedd5' }, { bg: '#fb923c', text: '#431407' },
    { bg: '#ef4444', text: '#7f1d1d' }, { bg: '#dc2626', text: '#fef2f2' }, { bg: '#b91c1c', text: '#fee2e2' },
    { bg: '#991b1b', text: '#fee2e2' }, { bg: '#7f1d1d', text: '#fee2e2' }, { bg: '#f87171', text: '#450a0a' },
    { bg: '#fca5a5', text: '#7f1d1d' }, { bg: '#e11d48', text: '#fff1f2' }, { bg: '#be123c', text: '#ffe4e6' },

    // Pinks & Magentas (75-89)
    { bg: '#db2777', text: '#fce7f3' }, { bg: '#ec4899', text: '#500724' }, { bg: '#f472b6', text: '#500724' },
    { bg: '#f9a8d4', text: '#831843' }, { bg: '#be185d', text: '#fce7f3' }, { bg: '#9d174d', text: '#fce7f3' },
    { bg: '#831843', text: '#fce7f3' }, { bg: '#d946ef', text: '#4a044e' }, { bg: '#c026d3', text: '#fae8ff' },
    { bg: '#a21caf', text: '#fae8ff' }, { bg: '#86198f', text: '#fae8ff' }, { bg: '#701a75', text: '#fae8ff' },
    { bg: '#e879f9', text: '#3b0764' }, { bg: '#f0abfc', text: '#581c87' }, { bg: '#f5d0fe', text: '#701a75' },

    // Purples & Violets (90-99)
    { bg: '#a855f7', text: '#faf5ff' }, { bg: '#9333ea', text: '#faf5ff' }, { bg: '#7e22ce', text: '#f3e8ff' },
    { bg: '#6b21a8', text: '#f3e8ff' }, { bg: '#581c87', text: '#f3e8ff' }, { bg: '#c084fc', text: '#3b0764' },
    { bg: '#8b5cf6', text: '#f5f3ff' }, { bg: '#7c3aed', text: '#ede9fe' }, { bg: '#6d28d9', text: '#ede9fe' },
    { bg: '#5b21b6', text: '#ede9fe' }
];

// Generate consistent color from string hash
const getColorFromLabel = (label: string) => {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Map hash to color palette index
    const index = Math.abs(hash) % COLOR_PALETTE.length;
    const color = COLOR_PALETTE[index];

    return {
        background: color.bg,
        text: color.text
    };
};

// Label Tag Component
interface LabelTagProps {
    label: string;
    maxWidth?: number; // Maximum width in pixels before truncation
}

export const LabelTag = ({ label, maxWidth = 80 }: LabelTagProps) => {
    const colors = getColorFromLabel(label);
    return (
        <span
            className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 inline-block truncate"
            style={{
                backgroundColor: colors.background,
                color: colors.text,
                maxWidth: `${maxWidth}px`,
                lineHeight: '1',
               
            }}
            title={label} // Native browser tooltip for full text
        >
            {label}
        </span>
    );
};
