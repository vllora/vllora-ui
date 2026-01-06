# Distri Architecture Reference

How vLLora integrates with the Distri agent framework.

## Distri System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DISTRI ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         BACKEND (Rust)                            │   │
│  │                                                                   │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                      │   │
│  │  │ AgentOrchestrator│───▶│   AgentLoop     │                      │   │
│  │  │                 │    │                 │                      │   │
│  │  │ - create_agent  │    │ - process_msg   │                      │   │
│  │  │ - execute_stream│    │ - plan/execute  │                      │   │
│  │  │ - get_tools     │    │ - tool dispatch │                      │   │
│  │  └────────┬────────┘    └────────┬────────┘                      │   │
│  │           │                      │                               │   │
│  │           ▼                      ▼                               │   │
│  │  ┌─────────────────────────────────────────┐                     │   │
│  │  │              Tool Registry               │                     │   │
│  │  │                                         │                     │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │                     │   │
│  │  │  │ Builtin  │ │ Plugin   │ │ External│ │                     │   │
│  │  │  │  Tools   │ │  Tools   │ │  Tools  │ │                     │   │
│  │  │  └──────────┘ └──────────┘ └─────────┘ │                     │   │
│  │  │                                         │                     │   │
│  │  │  ┌──────────────────────────────────┐  │                     │   │
│  │  │  │  Sub-Agent Tools (AgentTool)     │  │                     │   │
│  │  │  │  call_<agent_name> → delegates   │  │                     │   │
│  │  │  └──────────────────────────────────┘  │                     │   │
│  │  └─────────────────────────────────────────┘                     │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      FRONTEND (TypeScript)                        │   │
│  │                                                                   │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                      │   │
│  │  │   DistriClient  │───▶│     Agent       │                      │   │
│  │  │                 │    │                 │                      │   │
│  │  │ - HTTP/SSE      │    │ - invoke()      │                      │   │
│  │  │ - WebSocket     │    │ - invokeStream()│                      │   │
│  │  └─────────────────┘    └────────┬────────┘                      │   │
│  │                                  │                               │   │
│  │                                  ▼                               │   │
│  │  ┌─────────────────────────────────────────┐                     │   │
│  │  │           @distri/react                  │                     │   │
│  │  │                                         │                     │   │
│  │  │  useAgent()  useChat()  useTools()     │                     │   │
│  │  │                                         │                     │   │
│  │  │  ┌───────────────────────────────────┐ │                     │   │
│  │  │  │         <Chat /> Component         │ │                     │   │
│  │  │  │  - externalTools prop              │ │                     │   │
│  │  │  │  - Tool handlers executed locally  │ │                     │   │
│  │  │  └───────────────────────────────────┘ │                     │   │
│  │  └─────────────────────────────────────────┘                     │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Distri Features Used

### 1. `sub_agents` Configuration

Agent definitions can specify sub-agents:

```toml
name = "vllora_orchestrator"
sub_agents = ["vllora_ui_agent", "vllora_data_agent", "vllora_experiment_agent"]
```

Distri auto-generates `call_<agent_name>` tools for each sub-agent.

### 2. External Tools (`external = ["*"]`)

Tools marked as external are handled by the client (frontend):

```toml
[tools]
external = ["*"]  # All tools handled by frontend
```

- Tool calls are sent back via SSE
- Frontend executes handler and returns result
- Distri continues with tool result

### 3. Tool Propagation to Sub-Agents

When orchestrator delegates to sub-agent:
1. External tools from parent request propagate to sub-agent
2. Sub-agent can call those tools
3. Tools execute in frontend, results flow back

### 4. Context Preservation

- Same `thread_id` across orchestrator and sub-agents
- Conversation history shared
- Sub-agent results appear in main thread

## Tool Types

| Type | Definition | Execution |
|------|------------|-----------|
| **Builtin** | `builtin = ["call_agent"]` | Distri server |
| **Plugin** | `plugin = ["mcp_tool"]` | Distri plugins |
| **External** | `external = ["*"]` | Client (frontend) |
| **Sub-Agent** | Auto-generated from `sub_agents` | Distri server → sub-agent |

## vLLora Integration

```
vLLora UI                           Distri Server
    │                                    │
    │  externalTools = [21 tools]        │
    │────────────────────────────────────▶│
    │                                    │
    │  User: "show errors"               │
    │────────────────────────────────────▶│
    │                                    │
    │                    ┌───────────────┤
    │                    │ orchestrator  │
    │                    │ calls         │
    │                    │ data_agent    │
    │                    └───────────────┤
    │                                    │
    │  Tool call: fetch_runs({...})      │
    │◀────────────────────────────────────│
    │                                    │
    │  (Frontend executes, returns data) │
    │────────────────────────────────────▶│
    │                                    │
    │  Agent response                    │
    │◀────────────────────────────────────│
```

## Related

- [Architecture](./architecture.md) - vLLora multi-agent architecture
- [Agents](./agents.md) - Agent definitions
