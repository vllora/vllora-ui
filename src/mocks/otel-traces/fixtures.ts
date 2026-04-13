/**
 * Mock OTel GenAI traces.
 *
 * Hand-crafted to cover the variety the FE needs to render:
 *   - chat-only single span
 *   - chat with tool calls
 *   - multi-turn conversation
 *   - error
 *   - agent loop (invoke_agent → chat → execute_tool → chat)
 *
 * Shape mirrors `OtelTrace` so swapping to a real backend is just an
 * adapter change in service-registry.
 */

import type { OtelSpan, OtelTrace } from '@/types/otel-trace-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let traceCounter = 0;
function nextTraceId(): string {
  traceCounter += 1;
  return `trace-${traceCounter.toString().padStart(8, '0')}`;
}

let spanCounter = 0;
function nextSpanId(): string {
  spanCounter += 1;
  return `span-${spanCounter.toString().padStart(8, '0')}`;
}

function aggregate(spans: OtelSpan[], rootIndex = 0): OtelTrace {
  const root = spans[rootIndex];
  const totalTokens = spans.reduce(
    (acc, s) => acc + (s.usage?.totalTokens ?? 0),
    0,
  );
  const toolCallCount = spans.filter((s) => s.operationName === 'execute_tool').length;
  const turnCount = spans.reduce(
    (acc, s) => acc + (s.outputMessages?.length ?? 0),
    0,
  );
  return {
    traceId: root.traceId,
    rootSpan: root,
    spans,
    conversationId: root.conversationId,
    totalTokens: totalTokens || undefined,
    toolCallCount,
    turnCount,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** 1. Plain chat — single span, no tools. */
function buildChatOnly(): OtelTrace {
  const traceId = nextTraceId();
  const span: OtelSpan = {
    traceId,
    spanId: nextSpanId(),
    name: 'chat gpt-4o',
    startTime: '2026-04-06T14:02:11.000Z',
    endTime: '2026-04-06T14:02:13.420Z',
    durationMs: 2420,
    status: 'ok',
    operationName: 'chat',
    providerName: 'openai',
    requestModel: 'gpt-4o',
    responseModel: 'gpt-4o-2024-11-20',
    temperature: 0.7,
    usage: { inputTokens: 84, outputTokens: 142, totalTokens: 226 },
    finishReasons: ['stop'],
    conversationId: 'conv-chess-001',
    systemInstructions: 'You are a helpful chess tutor. Explain in plain language.',
    inputMessages: [
      {
        role: 'user',
        parts: [
          {
            type: 'text',
            content:
              'Why is the center of the board so important in the opening?',
          },
        ],
      },
    ],
    outputMessages: [
      {
        role: 'assistant',
        finishReason: 'stop',
        parts: [
          {
            type: 'text',
            content:
              'Controlling the center (e4, d4, e5, d5) gives your pieces more squares to move to and more options to attack on either side. A knight on e5 reaches eight squares; a knight on a1 reaches only two. Central pawns also restrict your opponent\'s pieces and create launch pads for kingside or queenside plans.',
          },
        ],
      },
    ],
  };
  return aggregate([span]);
}

/** 2. Chat with a single tool call — weather lookup. */
function buildChatWithTool(): OtelTrace {
  const traceId = nextTraceId();
  const conv = 'conv-weather-001';
  const parentChat = nextSpanId();
  const toolSpanId = nextSpanId();
  const followUpId = nextSpanId();

  const chat: OtelSpan = {
    traceId,
    spanId: parentChat,
    name: 'chat gpt-4o-mini',
    startTime: '2026-04-06T15:10:00.000Z',
    endTime: '2026-04-06T15:10:01.310Z',
    durationMs: 1310,
    status: 'ok',
    operationName: 'chat',
    providerName: 'openai',
    requestModel: 'gpt-4o-mini',
    responseModel: 'gpt-4o-mini-2024-07-18',
    usage: { inputTokens: 56, outputTokens: 24, totalTokens: 80 },
    finishReasons: ['tool_calls'],
    conversationId: conv,
    inputMessages: [
      {
        role: 'user',
        parts: [{ type: 'text', content: 'What\'s the weather in Tokyo right now?' }],
      },
    ],
    outputMessages: [
      {
        role: 'assistant',
        finishReason: 'tool_calls',
        parts: [
          {
            type: 'tool_call',
            id: 'call_weather_1',
            name: 'get_current_weather',
            arguments: { location: 'Tokyo, Japan', units: 'celsius' },
          },
        ],
      },
    ],
  };

  const tool: OtelSpan = {
    traceId,
    spanId: toolSpanId,
    parentSpanId: parentChat,
    name: 'execute_tool get_current_weather',
    startTime: '2026-04-06T15:10:01.320Z',
    endTime: '2026-04-06T15:10:01.480Z',
    durationMs: 160,
    status: 'ok',
    operationName: 'execute_tool',
    conversationId: conv,
    toolName: 'get_current_weather',
    toolType: 'function',
    toolCallId: 'call_weather_1',
    toolCallArguments: { location: 'Tokyo, Japan', units: 'celsius' },
    toolCallResult: { temperature: 19, condition: 'partly cloudy', humidity: 64 },
  };

  const followUp: OtelSpan = {
    traceId,
    spanId: followUpId,
    parentSpanId: parentChat,
    name: 'chat gpt-4o-mini',
    startTime: '2026-04-06T15:10:01.500Z',
    endTime: '2026-04-06T15:10:02.640Z',
    durationMs: 1140,
    status: 'ok',
    operationName: 'chat',
    providerName: 'openai',
    requestModel: 'gpt-4o-mini',
    responseModel: 'gpt-4o-mini-2024-07-18',
    usage: { inputTokens: 96, outputTokens: 38, totalTokens: 134 },
    finishReasons: ['stop'],
    conversationId: conv,
    inputMessages: [
      {
        role: 'tool',
        parts: [
          {
            type: 'tool_result',
            toolCallId: 'call_weather_1',
            result: { temperature: 19, condition: 'partly cloudy', humidity: 64 },
          },
        ],
      },
    ],
    outputMessages: [
      {
        role: 'assistant',
        finishReason: 'stop',
        parts: [
          {
            type: 'text',
            content:
              'It\'s 19 °C and partly cloudy in Tokyo right now, with humidity around 64%.',
          },
        ],
      },
    ],
  };

  return aggregate([chat, tool, followUp]);
}

/** 3. Multi-turn conversation — three back-and-forth turns in one trace. */
function buildMultiTurn(): OtelTrace {
  const traceId = nextTraceId();
  const conv = 'conv-sql-helper';
  const span: OtelSpan = {
    traceId,
    spanId: nextSpanId(),
    name: 'chat claude-sonnet-4-5',
    startTime: '2026-04-06T09:30:00.000Z',
    endTime: '2026-04-06T09:30:04.220Z',
    durationMs: 4220,
    status: 'ok',
    operationName: 'chat',
    providerName: 'anthropic',
    requestModel: 'claude-sonnet-4-5',
    responseModel: 'claude-sonnet-4-5-20260301',
    usage: { inputTokens: 412, outputTokens: 286, totalTokens: 698 },
    finishReasons: ['stop'],
    conversationId: conv,
    systemInstructions: 'You are a senior data engineer. Prefer ANSI SQL.',
    inputMessages: [
      { role: 'user', parts: [{ type: 'text', content: 'I have a table `orders(id, user_id, total, created_at)`. How do I get the top 5 spenders last month?' }] },
      { role: 'assistant', parts: [{ type: 'text', content: 'Use a sum + group by + order by + limit. Want me to show it for PostgreSQL specifically?' }] },
      { role: 'user', parts: [{ type: 'text', content: 'Yes, Postgres please.' }] },
    ],
    outputMessages: [
      {
        role: 'assistant',
        finishReason: 'stop',
        parts: [
          {
            type: 'text',
            content:
              'SELECT user_id, SUM(total) AS spend\nFROM orders\nWHERE created_at >= date_trunc(\'month\', now()) - interval \'1 month\'\n  AND created_at <  date_trunc(\'month\', now())\nGROUP BY user_id\nORDER BY spend DESC\nLIMIT 5;',
          },
        ],
      },
    ],
  };
  return aggregate([span]);
}

/** 4. Errored chat — content filter. */
function buildError(): OtelTrace {
  const traceId = nextTraceId();
  const span: OtelSpan = {
    traceId,
    spanId: nextSpanId(),
    name: 'chat gpt-4o',
    startTime: '2026-04-06T11:48:00.000Z',
    endTime: '2026-04-06T11:48:00.412Z',
    durationMs: 412,
    status: 'error',
    statusMessage: 'content_filter: response blocked',
    operationName: 'chat',
    providerName: 'openai',
    requestModel: 'gpt-4o',
    usage: { inputTokens: 28, outputTokens: 0, totalTokens: 28 },
    finishReasons: ['content_filter'],
    conversationId: 'conv-blocked-001',
    inputMessages: [
      { role: 'user', parts: [{ type: 'text', content: '[redacted user input]' }] },
    ],
    outputMessages: [],
  };
  return aggregate([span]);
}

/** 5. Agent loop — invoke_agent wraps a chat that calls two tools. */
function buildAgentLoop(): OtelTrace {
  const traceId = nextTraceId();
  const conv = 'conv-research-agent';
  const agent = nextSpanId();
  const chat1 = nextSpanId();
  const tool1 = nextSpanId();
  const tool2 = nextSpanId();
  const chat2 = nextSpanId();

  const agentSpan: OtelSpan = {
    traceId,
    spanId: agent,
    name: 'invoke_agent ResearchBot',
    startTime: '2026-04-06T16:00:00.000Z',
    endTime: '2026-04-06T16:00:08.400Z',
    durationMs: 8400,
    status: 'ok',
    operationName: 'invoke_agent',
    agentId: 'asst_research_v3',
    agentName: 'ResearchBot',
    conversationId: conv,
    providerName: 'openai',
    requestModel: 'gpt-4o',
  };

  const firstChat: OtelSpan = {
    traceId,
    spanId: chat1,
    parentSpanId: agent,
    name: 'chat gpt-4o',
    startTime: '2026-04-06T16:00:00.100Z',
    endTime: '2026-04-06T16:00:02.300Z',
    durationMs: 2200,
    status: 'ok',
    operationName: 'chat',
    providerName: 'openai',
    requestModel: 'gpt-4o',
    responseModel: 'gpt-4o-2024-11-20',
    usage: { inputTokens: 144, outputTokens: 62, totalTokens: 206 },
    finishReasons: ['tool_calls'],
    conversationId: conv,
    inputMessages: [
      { role: 'user', parts: [{ type: 'text', content: 'Find me two recent papers on Group Relative Policy Optimization and summarize.' }] },
    ],
    outputMessages: [
      {
        role: 'assistant',
        finishReason: 'tool_calls',
        parts: [
          { type: 'tool_call', id: 'call_search_1', name: 'arxiv_search', arguments: { query: 'Group Relative Policy Optimization', limit: 2 } },
        ],
      },
    ],
  };

  const arxivTool: OtelSpan = {
    traceId,
    spanId: tool1,
    parentSpanId: chat1,
    name: 'execute_tool arxiv_search',
    startTime: '2026-04-06T16:00:02.310Z',
    endTime: '2026-04-06T16:00:03.110Z',
    durationMs: 800,
    status: 'ok',
    operationName: 'execute_tool',
    conversationId: conv,
    toolName: 'arxiv_search',
    toolType: 'function',
    toolCallId: 'call_search_1',
    toolCallArguments: { query: 'Group Relative Policy Optimization', limit: 2 },
    toolCallResult: [
      { id: '2501.12948', title: 'DeepSeek-R1' },
      { id: '2503.14476', title: 'DAPO' },
    ],
  };

  const fetchTool: OtelSpan = {
    traceId,
    spanId: tool2,
    parentSpanId: chat1,
    name: 'execute_tool fetch_abstract',
    startTime: '2026-04-06T16:00:03.120Z',
    endTime: '2026-04-06T16:00:04.880Z',
    durationMs: 1760,
    status: 'ok',
    operationName: 'execute_tool',
    conversationId: conv,
    toolName: 'fetch_abstract',
    toolType: 'function',
    toolCallId: 'call_fetch_1',
    toolCallArguments: { ids: ['2501.12948', '2503.14476'] },
    toolCallResult: {
      '2501.12948':
        'DeepSeek-R1 demonstrates that pure RL with rule-based rewards can elicit complex reasoning in base models without supervised cold-start...',
      '2503.14476':
        'DAPO introduces dynamic sampling, clip-higher, and zero-variance handling to stabilize GRPO at scale...',
    },
  };

  const finalChat: OtelSpan = {
    traceId,
    spanId: chat2,
    parentSpanId: agent,
    name: 'chat gpt-4o',
    startTime: '2026-04-06T16:00:04.900Z',
    endTime: '2026-04-06T16:00:08.380Z',
    durationMs: 3480,
    status: 'ok',
    operationName: 'chat',
    providerName: 'openai',
    requestModel: 'gpt-4o',
    responseModel: 'gpt-4o-2024-11-20',
    usage: { inputTokens: 612, outputTokens: 198, totalTokens: 810 },
    finishReasons: ['stop'],
    conversationId: conv,
    outputMessages: [
      {
        role: 'assistant',
        finishReason: 'stop',
        parts: [
          {
            type: 'text',
            content:
              'I found two strong references:\n1. **DeepSeek-R1 (2501.12948)** — pure RL with rule-based rewards elicits reasoning from base models, no supervised cold-start required.\n2. **DAPO (2503.14476)** — adds dynamic sampling, clip-higher, and zero-variance handling so GRPO stays stable at scale.',
          },
        ],
      },
    ],
  };

  return aggregate([agentSpan, firstChat, arxivTool, fetchTool, finalChat], 0);
}

/** A few extra single-span chats so the list view feels populated. */
function buildExtra(name: string, model: string, prompt: string, completion: string, conv: string, when: string, tokensIn: number, tokensOut: number): OtelTrace {
  const traceId = nextTraceId();
  const span: OtelSpan = {
    traceId,
    spanId: nextSpanId(),
    name,
    startTime: when,
    endTime: new Date(new Date(when).getTime() + 1500).toISOString(),
    durationMs: 1500,
    status: 'ok',
    operationName: 'chat',
    providerName: model.startsWith('claude') ? 'anthropic' : 'openai',
    requestModel: model,
    responseModel: model,
    usage: { inputTokens: tokensIn, outputTokens: tokensOut, totalTokens: tokensIn + tokensOut },
    finishReasons: ['stop'],
    conversationId: conv,
    inputMessages: [{ role: 'user', parts: [{ type: 'text', content: prompt }] }],
    outputMessages: [
      { role: 'assistant', finishReason: 'stop', parts: [{ type: 'text', content: completion }] },
    ],
  };
  return aggregate([span]);
}

export const MOCK_OTEL_TRACES: OtelTrace[] = [
  buildAgentLoop(),
  buildChatWithTool(),
  buildMultiTurn(),
  buildChatOnly(),
  buildError(),
  buildExtra('chat gpt-4o', 'gpt-4o', 'Explain async/await in 3 sentences.', 'async/await is syntactic sugar over Promises that lets you write asynchronous code that reads like synchronous code...', 'conv-js-help', '2026-04-05T08:12:00.000Z', 18, 84),
  buildExtra('chat claude-sonnet-4-5', 'claude-sonnet-4-5', 'What is a monad, simply?', 'A monad is a wrapper around a value with two operations: a way to put a value into the wrapper, and a way to chain operations on wrapped values without unwrapping each time.', 'conv-fp', '2026-04-05T10:01:00.000Z', 12, 64),
  buildExtra('chat gpt-4o-mini', 'gpt-4o-mini', 'Convert 100 miles to kilometers.', '100 miles ≈ 160.9 kilometers.', 'conv-units', '2026-04-04T22:14:00.000Z', 14, 22),
  buildExtra('chat gpt-4o', 'gpt-4o', 'Why does Postgres prefer index scans over seq scans for small tables sometimes?', 'Postgres uses cost-based planning. For small tables, the planner often picks a seq scan because the random I/O cost of an index scan plus the heap fetch is higher than just streaming the whole table sequentially. The threshold is influenced by random_page_cost and effective_cache_size.', 'conv-pg', '2026-04-04T19:55:00.000Z', 32, 168),
  buildExtra('chat gpt-4o', 'gpt-4o', 'Sicilian Defence main lines?', 'After 1.e4 c5, the main branches are the Open Sicilian (2.Nf3 followed by 3.d4), the Closed Sicilian (2.Nc3), the Alapin (2.c3), and the Smith-Morra Gambit (2.d4 cxd4 3.c3).', 'conv-chess-002', '2026-04-03T14:30:00.000Z', 22, 96),
];
