import { defaultSchema } from 'rehype-sanitize';

// We need to extend the default schema because:
// 1. defaultSchema blocks unknown tags like <task>, <think>, etc. (GOOD!)
// 2. BUT it also blocks SVG elements like <svg>, <path>, <circle> (BAD - we need these!)
// 3. So we add SVG elements to the allowed list
export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse',
    'g', 'defs', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient',
    'stop', 'text', 'tspan', 'use', 'symbol', 'marker'
  ],
  attributes: {
    ...defaultSchema.attributes,
    svg: ['xmlns', 'viewBox', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'className', 'class'],
    path: ['d', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'className', 'class'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth', 'className', 'class'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'className', 'class'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'className', 'class'],
    polygon: ['points', 'fill', 'stroke', 'strokeWidth', 'className', 'class'],
    polyline: ['points', 'fill', 'stroke', 'strokeWidth', 'className', 'class'],
    ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'className', 'class'],
    g: ['fill', 'stroke', 'strokeWidth', 'transform', 'className', 'class'],
    text: ['x', 'y', 'fill', 'fontSize', 'fontFamily', 'textAnchor', 'className', 'class'],
    tspan: ['x', 'y', 'dx', 'dy', 'className', 'class'],
    use: ['href', 'xlinkHref', 'x', 'y', 'width', 'height', 'className', 'class'],
    defs: ['className', 'class'],
    clipPath: ['id', 'className', 'class'],
    mask: ['id', 'className', 'class'],
    pattern: ['id', 'x', 'y', 'width', 'height', 'patternUnits', 'className', 'class'],
    linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'className', 'class'],
    radialGradient: ['id', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'className', 'class'],
    stop: ['offset', 'stopColor', 'stopOpacity', 'className', 'class'],
    symbol: ['id', 'viewBox', 'className', 'class'],
    marker: ['id', 'viewBox', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'className', 'class']
  }
};
