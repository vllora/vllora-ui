import {
  Dataset,
  DatasetSummary,
  DatasetRecord,
  PipelineNode,
  Trace,
  Topic,
  GraderConfig,
  DryRunResult,
  TrainingResult,
  DetectedPattern,
  CoverageGap,
} from './types';

// Helper to generate random IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

// Mock Traces
export const mockTraces: Trace[] = [
  {
    id: generateId(),
    systemPrompt: 'You are an expert chess tutor helping students improve their game through analysis and instruction.',
    model: 'gpt-4o',
    turns: 3,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    messages: [
      { role: 'system', content: 'You are an expert chess tutor helping students improve their game through analysis and instruction.' },
      { role: 'user', content: 'What is the best opening move for white?' },
      { role: 'assistant', content: 'The most popular and arguably strongest opening move for white is 1.e4 (moving the king\'s pawn two squares forward). This move controls the center, opens diagonals for the queen and bishop, and allows for quick development.' },
    ],
  },
  {
    id: generateId(),
    systemPrompt: 'You are an expert chess tutor helping students improve their game through analysis and instruction.',
    model: 'gpt-4o',
    turns: 5,
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
    messages: [
      { role: 'system', content: 'You are an expert chess tutor helping students improve their game through analysis and instruction.' },
      { role: 'user', content: 'Analyze this position: e4 e5 Nf3 Nc6 Bb5' },
      { role: 'assistant', content: 'This is the Ruy Lopez opening, one of the oldest and most respected chess openings. White\'s bishop on b5 puts pressure on the knight defending e5.' },
      { role: 'user', content: 'What should black play here?' },
      { role: 'assistant', content: 'Black has several good options: 1) a6 (Morphy Defense) - the most popular, challenging the bishop. 2) Nf6 (Berlin Defense) - solid and drawish. 3) f5 (Schliemann Defense) - aggressive but risky.' },
    ],
  },
  {
    id: generateId(),
    systemPrompt: 'You are an expert chess tutor helping students improve their game through analysis and instruction.',
    model: 'gpt-4o',
    turns: 2,
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    messages: [
      { role: 'system', content: 'You are an expert chess tutor helping students improve their game through analysis and instruction.' },
      { role: 'user', content: 'How do I fork pieces with a knight?' },
      { role: 'assistant', content: 'A knight fork is a tactical pattern where the knight attacks two or more pieces simultaneously. Look for squares where your knight can reach that would put multiple enemy pieces under attack. Common targets include the king and queen, or the king and rook.' },
    ],
  },
  {
    id: generateId(),
    systemPrompt: 'You are an expert chess tutor helping students improve their game through analysis and instruction.',
    model: 'gpt-4o',
    turns: 4,
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    messages: [
      { role: 'system', content: 'You are an expert chess tutor helping students improve their game through analysis and instruction.' },
      { role: 'user', content: 'Explain the Sicilian Defense' },
      { role: 'assistant', content: 'The Sicilian Defense (1.e4 c5) is Black\'s most popular and combative response to 1.e4. It creates an asymmetrical position where both sides have chances to attack.' },
      { role: 'user', content: 'What are the main variations?' },
      { role: 'assistant', content: 'Main variations include: 1) Open Sicilian (2.Nf3 followed by 3.d4) - most common. 2) Najdorf - very popular among top players. 3) Dragon - sharp with opposite-side castling. 4) Scheveningen - solid pawn structure.' },
    ],
  },
  {
    id: generateId(),
    systemPrompt: 'You are an expert chess tutor helping students improve their game through analysis and instruction.',
    model: 'gpt-4o',
    turns: 6,
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    messages: [
      { role: 'system', content: 'You are an expert chess tutor helping students improve their game through analysis and instruction.' },
      { role: 'user', content: 'Help me with this endgame: King and Rook vs King' },
      { role: 'assistant', content: 'King and Rook vs King is a fundamental endgame that you must learn to win. The key technique is to push the enemy king to the edge of the board using the "box" method.' },
      { role: 'user', content: 'What is the box method?' },
      { role: 'assistant', content: 'The box method involves using your rook to create a "box" that confines the enemy king, then gradually making the box smaller. Your king helps push the enemy king back.' },
      { role: 'user', content: 'Can you show me the steps?' },
      { role: 'assistant', content: 'Step 1: Use the rook to cut off the enemy king. Step 2: Bring your king closer. Step 3: Coordinate king and rook to push the enemy king to the edge. Step 4: Deliver checkmate on the back rank.' },
    ],
  },
];

// Generate more traces programmatically
for (let i = 0; i < 45; i++) {
  const topics = ['openings', 'tactics', 'endgames', 'strategy', 'analysis', 'puzzles', 'general'];
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];
  const turns = Math.floor(Math.random() * 6) + 2;

  mockTraces.push({
    id: generateId(),
    systemPrompt: 'You are an expert chess tutor helping students improve their game through analysis and instruction.',
    model: Math.random() > 0.2 ? 'gpt-4o' : 'gpt-4o-mini',
    turns,
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    messages: [
      { role: 'system', content: 'You are an expert chess tutor helping students improve their game through analysis and instruction.' },
      { role: 'user', content: `Question about ${randomTopic}...` },
      { role: 'assistant', content: `Here is my analysis about ${randomTopic}...` },
    ],
  });
}

// Mock Topics
export const mockTopics: Topic[] = [
  { id: '1', name: 'openings', description: 'Opening theory and principles', recordCount: 234, targetPercentage: 25 },
  { id: '2', name: 'tactics', description: 'Tactical patterns and combinations', recordCount: 89, targetPercentage: 20 },
  { id: '3', name: 'endgames', description: 'Endgame technique', recordCount: 203, targetPercentage: 20 },
  { id: '4', name: 'strategy', description: 'Positional play and planning', recordCount: 156, targetPercentage: 15 },
  { id: '5', name: 'analysis', description: 'Position analysis', recordCount: 178, targetPercentage: 10 },
  { id: '6', name: 'puzzles', description: 'Chess puzzles', recordCount: 98, targetPercentage: 5 },
  { id: '7', name: 'general', description: 'General chess knowledge', recordCount: 50, targetPercentage: 5 },
];

// Mock Dataset Records
export const generateMockRecords = (count: number): DatasetRecord[] => {
  const records: DatasetRecord[] = [];
  const topics = mockTopics.map(t => t.name);

  for (let i = 0; i < count; i++) {
    const isValid = Math.random() > 0.03;
    const invalidReasons = ['No user message', 'Empty assistant reply', 'Tool call malformed', 'Exceeds token limit'];

    records.push({
      id: generateId(),
      messages: [
        { role: 'system', content: 'You are an expert chess tutor helping students improve their game.' },
        { role: 'user', content: `Chess question ${i + 1}...` },
        { role: 'assistant', content: `Here is the analysis for question ${i + 1}...` },
      ],
      topic: topics[Math.floor(Math.random() * topics.length)],
      topicConfidence: 0.7 + Math.random() * 0.3,
      isValid,
      invalidReason: isValid ? undefined : invalidReasons[Math.floor(Math.random() * invalidReasons.length)],
      isGenerated: Math.random() > 0.85,
      score: isValid ? 0.3 + Math.random() * 0.7 : undefined,
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    });
  }

  return records;
};

// Mock Grader Config
export const mockGraderConfig: GraderConfig = {
  type: 'llm_judge',
  model: 'gpt-4o-mini',
  temperature: 0,
  prompt: `Rate the response quality from 0 to 1 based on:
1. Accuracy of chess information
2. Clarity of explanation
3. Helpfulness for learning
4. Appropriate level of detail

Return only a number between 0 and 1.`,
};

// Mock Dry Run Result
export const mockDryRunResult: DryRunResult = {
  decision: 'GO',
  sampleSize: 300,
  mean: 0.45,
  std: 0.18,
  percentAboveZero: 86,
  percentPerfect: 7,
  distribution: [5, 8, 15, 25, 35, 45, 55, 40, 30, 20, 15, 7],
};

// Mock Training Result
export const mockTrainingResult: TrainingResult = {
  modelId: 'ft:gpt-4o:chess-tutor:abc123',
  improvement: 49,
  baselineScore: 0.45,
  finalScore: 0.67,
  epochs: 2,
  duration: 9900, // seconds
  topicImprovements: {
    openings: { baseline: 0.51, final: 0.72, improvement: 41 },
    tactics: { baseline: 0.38, final: 0.61, improvement: 61 },
    endgames: { baseline: 0.48, final: 0.68, improvement: 42 },
    strategy: { baseline: 0.42, final: 0.63, improvement: 50 },
  },
};

// Create initial pipeline nodes based on step
const createPipelineNodes = (currentStep: number, status: string): PipelineNode[] => {
  const nodes: PipelineNode[] = [
    { id: 1, name: 'Extract Records', shortName: 'Extract', status: 'waiting', summary: '', canRetrigger: true, category: 'data-prep' },
    { id: 2, name: 'Topics & Categorization', shortName: 'Topics', status: 'waiting', summary: '', canRetrigger: true, category: 'data-prep' },
    { id: 3, name: 'Review Coverage', shortName: 'Coverage', status: 'waiting', summary: '', canRetrigger: true, category: 'data-prep' },
    { id: 4, name: 'Define Grader', shortName: 'Grader', status: 'waiting', summary: '', canRetrigger: true, category: 'validation' },
    { id: 5, name: 'Dry Run', shortName: 'Dry Run', status: 'waiting', summary: '', canRetrigger: true, category: 'validation' },
    { id: 6, name: 'Train Model', shortName: 'Train', status: 'waiting', summary: '', canRetrigger: true, category: 'training' },
    { id: 7, name: 'Deploy', shortName: 'Deploy', status: 'waiting', summary: '', canRetrigger: false, category: 'training' },
  ];

  // Update nodes based on current step
  for (let i = 0; i < currentStep - 1; i++) {
    nodes[i].status = 'complete';
    switch (i + 1) {
      case 1: nodes[i].summary = '1,042 records'; break;
      case 2: nodes[i].summary = '7 topics, 100%'; break;
      case 3: nodes[i].summary = 'Score: 0.72'; break;
      case 4: nodes[i].summary = 'LLM Judge'; break;
      case 5: nodes[i].summary = 'GO 0.45'; break;
      case 6: nodes[i].summary = '+49%'; break;
      case 7: nodes[i].summary = 'Live'; break;
    }
  }

  // Current step
  if (currentStep <= 7) {
    if (status === 'training') {
      nodes[currentStep - 1].status = 'running';
      nodes[currentStep - 1].summary = '45%';
    } else if (status === 'attention') {
      nodes[currentStep - 1].status = 'attention';
      nodes[currentStep - 1].summary = 'Score: 0.35';
    } else if (status === 'complete') {
      nodes[currentStep - 1].status = 'complete';
    } else if (status === 'failed') {
      nodes[currentStep - 1].status = 'failed';
      nodes[currentStep - 1].summary = 'Error';
    }
  }

  return nodes;
};

// Mock Dataset Summaries for list page
export const mockDatasetSummaries: DatasetSummary[] = [
  {
    id: 'chess-tutor-1',
    name: 'chess-tutor',
    recordCount: 1148,
    topicCount: 7,
    balanceScore: 0.72,
    currentStep: 6,
    status: 'training',
    statusText: 'Step 6: Training in progress (45%)',
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: 'customer-support-v2',
    name: 'customer-support-v2',
    recordCount: 3420,
    topicCount: 12,
    balanceScore: 0.68,
    currentStep: 7,
    status: 'complete',
    statusText: 'Deployed',
    improvement: 52,
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'code-review-assistant',
    name: 'code-review-assistant',
    recordCount: 892,
    topicCount: 5,
    balanceScore: 0.41,
    currentStep: 3,
    status: 'attention',
    statusText: 'Step 3: Coverage needs attention',
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
];

// Full Mock Datasets
export const mockDatasets: Record<string, Dataset> = {
  'chess-tutor-1': {
    id: 'chess-tutor-1',
    name: 'chess-tutor',
    objective: 'Improve the model\'s ability to correctly use chess analysis tools and provide accurate move evaluations with clear explanations.',
    records: generateMockRecords(1148),
    topicHierarchy: { topics: mockTopics },
    graderConfig: mockGraderConfig,
    dryRunResult: mockDryRunResult,
    pipelineNodes: createPipelineNodes(6, 'training'),
    validRecordCount: 1114,
    invalidRecordCount: 34,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  'customer-support-v2': {
    id: 'customer-support-v2',
    name: 'customer-support-v2',
    objective: 'Enhance customer support quality with faster, more accurate responses.',
    records: generateMockRecords(3420),
    topicHierarchy: { topics: mockTopics },
    graderConfig: mockGraderConfig,
    dryRunResult: { ...mockDryRunResult, mean: 0.52 },
    trainingResult: mockTrainingResult,
    pipelineNodes: createPipelineNodes(7, 'complete'),
    validRecordCount: 3380,
    invalidRecordCount: 40,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  'code-review-assistant': {
    id: 'code-review-assistant',
    name: 'code-review-assistant',
    objective: 'Train the model to provide better code reviews with actionable feedback.',
    records: generateMockRecords(892),
    topicHierarchy: { topics: mockTopics.slice(0, 5) },
    pipelineNodes: createPipelineNodes(3, 'attention'),
    validRecordCount: 865,
    invalidRecordCount: 27,
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
};

// Mock Detected Pattern
export const mockDetectedPattern: DetectedPattern = {
  title: 'Chess Tutoring Assistant',
  icon: 'GraduationCap',
  systemPrompt: 'You are an expert chess tutor helping students improve their game through analysis and instruction.',
  capabilities: ['Position analysis', 'Move suggestions', 'Opening theory', 'Endgame technique'],
  toolCount: 6,
};

// Mock Coverage Gaps
export const mockCoverageGaps: CoverageGap[] = [
  { topic: 'tactics', currentPercentage: 8, targetPercentage: 20, recordsNeeded: 120 },
  { topic: 'strategy', currentPercentage: 18, targetPercentage: 20, recordsNeeded: 20 },
];
