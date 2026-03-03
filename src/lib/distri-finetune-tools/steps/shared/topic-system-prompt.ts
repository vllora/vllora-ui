/**
 * Topic System Prompt Builder
 *
 * Constructs a shared system prompt for all records within a topic,
 * derived from the topic's position in the hierarchy tree.
 *
 * Key principle: ONE system prompt per topic, variation lives in user messages.
 * Child topic prompts INHERIT parent context — the full hierarchy path
 * is expressed as progressively narrowing sentences that read naturally.
 *
 * The path is grouped into pairs, each pair forming one sentence with
 * varied connectors ("particularly", "especially", "specifically").
 * This keeps every sentence short while showing the full structure.
 *
 * Examples:
 *   Depth 2: "You are a chess tutor. You specialize in chess fundamentals,
 *             particularly openings. Provide clear explanations..."
 *
 *   Depth 4: "You are a chess tutor. You specialize in chess, particularly
 *             openings. Your focus is on indian defense, especially kings
 *             indian. Provide clear explanations..."
 *
 *   Depth 6: "You are a chess tutor. You specialize in chess, particularly
 *             openings. Your focus is on indian defense, especially kings
 *             indian. Your primary expertise is in classical, specifically
 *             petrosian. Provide clear explanations..."
 *
 * Inheritance: deeper prompts contain shallower prompts as a prefix —
 * e.g. the depth-4 prompt is the first two sentences of the depth-6 prompt.
 */

/**
 * Convert a snake_case topic name to human-readable text.
 * e.g. "progressive_chess_rules" → "progressive chess rules"
 */
function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

/** Sentence starters that progressively narrow the scope */
const PAIR_PREFIXES = [
  'You specialize in',
  'Your focus is on',
  'Your primary expertise is in',
];

/** Connectors within each pair that vary to avoid repetition */
const PAIR_CONNECTORS = [
  ', particularly ',
  ', especially ',
  ', specifically ',
];

/**
 * Build a shared system prompt for a specific topic based on its
 * position in the hierarchy and the dataset's training objective.
 *
 * The hierarchy path is expressed as progressively narrowing sentences,
 * so child prompts naturally contain all parent context as a prefix.
 *
 * @param topicPath - Full path from root to leaf topic (snake_case names)
 * @param trainingObjective - The dataset's training objective text
 * @param descriptions - Optional descriptions for each topic in the path (parallel array)
 * @returns A system prompt string shared by all records in this topic
 */
export function buildTopicSystemPrompt(
  topicPath: string[],
  trainingObjective: string,
  descriptions?: (string | undefined)[],
): string {
  const path = topicPath.map(humanize);

  // Normalize the objective into a "You are ..." prefix
  const trimmed = trainingObjective.trim().replace(/\.$/, '');
  const role = trimmed.toLowerCase().startsWith('you are')
    ? trimmed
    : `You are ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;

  // Helper: get description suffix for a topic at given index
  const descSuffix = (idx: number) => {
    const desc = descriptions?.[idx];
    return desc ? ` — ${desc.replace(/\.$/, '')}` : '';
  };

  // Group path into pairs → each pair becomes one narrowing sentence
  const sentences: string[] = [`${role}.`];

  for (let i = 0; i < path.length; i += 2) {
    const pairIdx = Math.floor(i / 2);
    const prefix = PAIR_PREFIXES[pairIdx % PAIR_PREFIXES.length];
    const connector = PAIR_CONNECTORS[pairIdx % PAIR_CONNECTORS.length];
    const first = path[i] + descSuffix(i);

    if (i + 1 < path.length) {
      // Full pair: "You specialize in X, particularly Y."
      sentences.push(`${prefix} ${first}${connector}${path[i + 1]}${descSuffix(i + 1)}.`);
    } else {
      // Odd one out: "Your focus is on X."
      sentences.push(`${prefix} ${first}.`);
    }
  }

  sentences.push('Provide clear explanations, relevant examples, and practical guidance.');
  return sentences.join(' ');
}

/**
 * Get the system prompt "segment" that a single topic node contributes.
 *
 * Used in the canvas view to show how the full prompt builds up
 * incrementally as you traverse the hierarchy from root to leaf.
 *
 * @param nodeName - The snake_case name of this topic node
 * @param depth - 0-based depth in the hierarchy (0 = top-level topic)
 * @returns The text fragment this node contributes to the cumulative prompt
 *
 * @example
 *   // depth 0 (top-level): pair start
 *   getTopicPromptSegment('culinary_fundamentals', 0)
 *   // → 'You specialize in culinary fundamentals'
 *
 *   // depth 1 (second level): pair connector
 *   getTopicPromptSegment('knife_skills', 1)
 *   // → 'particularly knife skills.'
 *
 *   // depth 2 (third level): new pair start
 *   getTopicPromptSegment('julienne_technique', 2)
 *   // → 'Your focus is on julienne technique'
 */
export function getTopicPromptSegment(
  nodeName: string,
  depth: number,
): string {
  const name = humanize(nodeName);
  const pairIdx = Math.floor(depth / 2);
  const isSecondInPair = depth % 2 === 1;

  if (isSecondInPair) {
    // This node is the second in a pair — returns the connector fragment
    const connector = PAIR_CONNECTORS[pairIdx % PAIR_CONNECTORS.length];
    return `${connector.trimStart()}${name}.`;
  } else {
    // This node starts a new pair — returns the prefix fragment
    const prefix = PAIR_PREFIXES[pairIdx % PAIR_PREFIXES.length];
    return `${prefix} ${name}`;
  }
}

/**
 * Get the role sentence derived from the training objective.
 * Used on root/dataset nodes in the canvas to show what "You are ..." resolves to.
 *
 * @param trainingObjective - The dataset's training objective text
 * @returns The normalized role sentence (e.g. "You are a cooking instructor.")
 */
export function getRoleSentence(trainingObjective: string): string {
  const trimmed = trainingObjective.trim().replace(/\.$/, '');
  const role = trimmed.toLowerCase().startsWith('you are')
    ? trimmed
    : `You are ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  return `${role}.`;
}

// ─── Structured segment types (for "sentence grammar" visualization) ───

/** Structured parts of a single node's prompt segment (template + variable name) */
export interface PromptSegmentParts {
  template: string;   // e.g., "You specialize in " or ", particularly "
  topicName: string;  // e.g., "culinary fundamentals" or "knife skills"
  suffix: string;     // e.g., "" or "."
}

/** Semantic section that a prompt segment belongs to */
export type PromptSemanticSection = 'role' | 'specialization' | 'instruction';

/** A tagged piece of the full accumulated prompt (for color-coded rendering) */
export interface PromptTextSegment {
  text: string;
  type: 'template' | 'topicName' | 'currentTopicName' | 'goal';
  /** Optional semantic section for annotated visualization */
  semantic?: PromptSemanticSection;
  /** For topic names: 0-based index in the topic path (for hierarchy visualization) */
  topicDepth?: number;
}

/**
 * Get the structured parts of a single node's prompt segment.
 * Used for color-coded rendering: template in dim gray, topic name in accent color.
 *
 * @param nodeName - The snake_case name of this topic node
 * @param depth - 0-based depth in the hierarchy
 * @returns Structured parts: { template, topicName, suffix }
 */
export function getTopicPromptSegmentParts(
  nodeName: string,
  depth: number,
): PromptSegmentParts {
  const name = humanize(nodeName);
  const pairIdx = Math.floor(depth / 2);
  const isSecondInPair = depth % 2 === 1;

  if (isSecondInPair) {
    const connector = PAIR_CONNECTORS[pairIdx % PAIR_CONNECTORS.length];
    return { template: connector.trimStart(), topicName: name, suffix: '.' };
  } else {
    const prefix = PAIR_PREFIXES[pairIdx % PAIR_PREFIXES.length];
    return { template: `${prefix} `, topicName: name, suffix: '' };
  }
}

/**
 * Get the structured parts of the role sentence (for root/dataset nodes).
 * Used for color-coded rendering: "You are" in dim, role description in accent.
 *
 * @param trainingObjective - The dataset's training objective text
 * @returns Structured parts: { template: "You are ", topicName: "...", suffix: "." }
 */
export function getRoleSentenceParts(trainingObjective: string): PromptSegmentParts {
  const trimmed = trainingObjective.trim().replace(/\.$/, '');
  if (trimmed.toLowerCase().startsWith('you are')) {
    return { template: 'You are ', topicName: trimmed.slice(8), suffix: '.' };
  }
  return {
    template: 'You are ',
    topicName: `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`,
    suffix: '.',
  };
}

/**
 * Build the full accumulated prompt as structured segments for color-coded rendering.
 * Each topic name is tagged so it can be highlighted, with the current node's name
 * getting extra emphasis via the 'currentTopicName' type. The training objective is
 * tagged as 'goal' so the UI can highlight it distinctly.
 *
 * @param topicPath - Full path from root to current topic (snake_case names)
 * @param currentNodeName - The current node's snake_case name (for emphasis)
 * @param trainingObjective - The dataset's training objective text
 * @param descriptions - Optional descriptions for each topic in the path (parallel array)
 * @returns Array of tagged text segments
 */
export function buildAccumulatedPromptSegments(
  topicPath: string[],
  currentNodeName: string,
  trainingObjective: string,
  descriptions?: (string | undefined)[],
): PromptTextSegment[] {
  const path = topicPath.map(humanize);
  const currentName = humanize(currentNodeName);
  const segments: PromptTextSegment[] = [];

  // Helper: get description suffix for a topic at given index
  const descSuffix = (idx: number) => {
    const desc = descriptions?.[idx];
    return desc ? ` — ${desc.replace(/\.$/, '')}` : '';
  };

  // Role sentence: "You are [goal/training objective]."
  const roleParts = getRoleSentenceParts(trainingObjective);
  segments.push({ text: roleParts.template, type: 'template', semantic: 'role' });
  segments.push({ text: roleParts.topicName, type: 'goal', semantic: 'role' });
  segments.push({ text: `${roleParts.suffix} `, type: 'template', semantic: 'role' });

  // Topic sentences — grouped into pairs
  for (let i = 0; i < path.length; i += 2) {
    const pairIdx = Math.floor(i / 2);
    const prefix = PAIR_PREFIXES[pairIdx % PAIR_PREFIXES.length];
    const connector = PAIR_CONNECTORS[pairIdx % PAIR_CONNECTORS.length];
    const first = path[i] + descSuffix(i);

    // Prefix: "You specialize in "
    segments.push({ text: `${prefix} `, type: 'template', semantic: 'specialization' });
    // First topic name + description (tagged with its depth in the hierarchy)
    segments.push({
      text: first,
      type: path[i] === currentName ? 'currentTopicName' : 'topicName',
      semantic: 'specialization',
      topicDepth: i,
    });

    if (i + 1 < path.length) {
      // Connector + second topic: ", particularly [name — desc]."
      segments.push({ text: connector, type: 'template', semantic: 'specialization' });
      segments.push({
        text: path[i + 1] + descSuffix(i + 1),
        type: path[i + 1] === currentName ? 'currentTopicName' : 'topicName',
        semantic: 'specialization',
        topicDepth: i + 1,
      });
      segments.push({ text: '. ', type: 'template', semantic: 'specialization' });
    } else {
      // Odd one out — already has description appended above
      segments.push({ text: '. ', type: 'template', semantic: 'specialization' });
    }
  }

  // Closing instruction sentence
  segments.push({
    text: 'Provide clear explanations, relevant examples, and practical guidance.',
    type: 'template',
    semantic: 'instruction',
  });

  return segments;
}

/**
 * Build a generic system prompt when no topic hierarchy is available.
 *
 * @param trainingObjective - The dataset's training objective text
 * @returns A generic system prompt string
 */
export function buildGenericSystemPrompt(trainingObjective: string): string {
  const trimmed = trainingObjective.trim().replace(/\.$/, '');
  const role = trimmed.toLowerCase().startsWith('you are')
    ? trimmed
    : `You are ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  return `${role}. Provide clear, helpful, and accurate responses.`;
}
