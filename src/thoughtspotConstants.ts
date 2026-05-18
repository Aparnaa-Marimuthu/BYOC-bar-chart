export const THOUGHTSPOT_COLUMN_TYPE = {
    MEASURE: 1,
    ATTRIBUTE: 2,
} as const;

export const THOUGHTSPOT_DATA_TYPE = {
    CHAR: 2,
    DOUBLE: 6,
    DATE: 7,
} as const;

export const THOUGHTSPOT_EVENT = {
    OPEN_CONTEXT_MENU: 'OpenContextMenu',
    CLOSE_CONTEXT_MENU: 'CloseContextMenu',
} as const;
