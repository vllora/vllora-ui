export const TRACE_PANEL_WIDTH = 500;

export const CONTROL_PANEL_WIDTH = 40;

export const TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR = 220
export const TIMELINE_DYNAMIC_TITLE_WIDTH_FULL_SIZE = 300
export const TIMELINE_INDENTATION = 8
export const TIMELINE_MAX_TITLE_WIDTH = 100
export const TIMELINE_OPERATION_ICON_WIDTH = 26

export const TIMELINE_DURATION_WIDTH = 20
export const getTimelineTitleWidth = (props: {
    level?: number,
}) => {
    const { level = 0 } = props
    return TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR - level * TIMELINE_INDENTATION - TIMELINE_OPERATION_ICON_WIDTH - TIMELINE_DURATION_WIDTH - 55
}
    