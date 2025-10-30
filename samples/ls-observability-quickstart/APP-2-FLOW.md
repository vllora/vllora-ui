# App-2: MCP-Enhanced Multi-Agent Workflow

## Overview

`app-2.py` demonstrates an advanced **Multi-Agent System** with **Model Context Protocol (MCP)**-like capabilities using LangGraph. It implements a sophisticated workflow where four specialized AI agents collaborate to complete complex tasks that require research, data analysis, visualization, and file management.

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Input                                │
│              "Complex task requiring multiple steps"             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RESEARCHER                                   │
│  Tools: Tavily Search (Web Search)                              │
│  Role: Find information from the internet                       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┐
    │             │             │             │
    ▼             ▼             ▼             ▼
┌────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐
│  DATA  │  │   CHART     │  │   FILE   │  │   END    │
│ANALYST │  │ GENERATOR   │  │ MANAGER  │  │          │
└───┬────┘  └──────┬──────┘  └────┬─────┘  └──────────┘
    │              │              │
    │  Tools:      │  Tools:      │  Tools:
    │  - Fetch Web │  - Python    │  - Read File
    │  - Read File │    REPL      │  - Write File
    │  - Analyze   │              │  - List Dir
    │    Data      │              │
    │              │              │
    └──────┬───────┴──────┬───────┘
           │              │
           ▼              ▼
      ┌─────────────────────┐
      │    FINAL OUTPUT     │
      └─────────────────────┘
```

## Agents

### 1. **Researcher Agent** 🔍
- **Primary Tool**: Tavily Search
- **Capabilities**:
  - Web search for current information
  - Fact-finding and data gathering
  - Research latest trends and statistics
- **Routing Logic**:
  - Routes to Data Analyst if data needs analysis
  - Routes to Chart Generator if visualization is mentioned
  - Routes to File Manager if saving is required
  - Ends if final answer is complete

### 2. **Data Analyst Agent** 📊
- **Tools**:
  - `fetch_web_data_tool` - Fetch data from URLs
  - `read_file_tool` - Read files from disk
  - `analyze_dataframe_tool` - Analyze datasets
- **Capabilities**:
  - Process and analyze data
  - Read structured/unstructured data from files
  - Fetch data from web APIs
  - Statistical analysis
- **Routing Logic**:
  - Routes to Chart Generator for visualizations
  - Routes to File Manager to save results
  - Routes back to Researcher for more data
  - Ends if analysis is complete

### 3. **Chart Generator Agent** 📈
- **Primary Tool**: Python REPL
- **Capabilities**:
  - Execute Python code
  - Create visualizations (matplotlib, seaborn, plotly)
  - Generate charts, graphs, and plots
  - Data transformation and formatting
- **Routing Logic**:
  - Routes to File Manager to save charts
  - Routes to Data Analyst if more data needed
  - Routes to Researcher for additional information
  - Ends when visualization is complete

### 4. **File Manager Agent** 💾
- **Tools**:
  - `read_file_tool` - Read files
  - `write_file_tool` - Write/save files
  - `list_directory_tool` - List directory contents
- **Capabilities**:
  - Read and write files to filesystem
  - Manage file operations
  - Save charts, data, reports
  - Directory navigation
- **Routing Logic**:
  - Typically ends after completing file operations

## Workflow Execution

### Flow Diagram

```
START
  │
  ▼
[User provides complex task]
  │
  ▼
RESEARCHER (Always first)
  │
  ├─► Searches web using Tavily
  ├─► Gathers information
  └─► Routes based on content
       │
       ├─► "data/analyze" → DATA ANALYST
       ├─► "chart/plot" → CHART GENERATOR
       ├─► "save/write" → FILE MANAGER
       └─► "FINAL ANSWER" → END
```

### Example Execution Flow

**Task**: "Research AI trends in 2024, analyze the data, create a bar chart, and save results"

1. **Step 1 - RESEARCHER**
   - Uses Tavily to search "AI trends 2024"
   - Finds articles and statistics
   - Identifies keywords: "data", "analyze"
   - **Routes to**: DATA ANALYST

2. **Step 2 - DATA ANALYST**
   - Receives research findings
   - Analyzes the data points
   - Identifies trend categories
   - Detects keyword: "chart"
   - **Routes to**: CHART GENERATOR

3. **Step 3 - CHART GENERATOR**
   - Receives analyzed data
   - Writes Python code to create bar chart
   - Executes code using REPL
   - Generates visualization
   - Detects keyword: "save"
   - **Routes to**: FILE MANAGER

4. **Step 4 - FILE MANAGER**
   - Receives chart/results
   - Saves to file
   - Confirms completion
   - **Routes to**: END

## Key Features

### 1. **Intelligent Routing**
Each agent analyzes the content and intelligently routes to the next appropriate agent:

```python
if "FINAL ANSWER" in content:
    goto = END
elif any(word in content.lower() for word in ["data", "analyze"]):
    goto = "data_analyst"
elif any(word in content.lower() for word in ["chart", "visualize"]):
    goto = "chart_generator"
# ... etc
```

### 2. **Tool Specialization**
Each agent has access only to tools relevant to its specialty, following the principle of least privilege and separation of concerns.

### 3. **State Management**
Uses LangGraph's `MessagesState` to maintain conversation history across all agents, enabling seamless collaboration.

### 4. **Observability**
- Custom headers for tracking (`x-thread-id`, `x-run-id`, `x-label`, `x-tags`)
- Print statements showing agent transitions
- Step-by-step execution logging
- Integration with LangSmith for monitoring

### 5. **MCP-Like Architecture**
The system mimics Model Context Protocol by:
- Having specialized "servers" (agents)
- Providing specific capabilities (tools)
- Orchestrating through intelligent routing
- Maintaining shared context (message state)

## Configuration

### Environment Variables

```bash
# Required
export OPENAI_API_KEY="your-openai-api-key"
export TAVILY_API_KEY="your-tavily-api-key"

# Optional
export LANGSMITH_API_KEY="your-langsmith-key"
export LANGSMITH_TRACING="true"
```

### Gateway Toggle

```python
USE_GATEWAY = False  # Set to True to use local AI gateway
API_BASE = 'http://localhost:8080/v1' if USE_GATEWAY else None
```

## Models Used

- **Researcher**: `gpt-4o-mini` (cost-effective for search tasks)
- **Data Analyst**: `gpt-4o-mini` (efficient for analysis)
- **Chart Generator**: `gpt-4o` (more capable for code generation)
- **File Manager**: `gpt-4o-mini` (simple file operations)

## Running the Application

### Prerequisites

```bash
# Create and activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install langchain langchain-openai langgraph langchain-tavily \
            langsmith langchain-experimental python-dotenv
```

### Execute

```bash
# Run with direct OpenAI
python app-2.py

# Run with local gateway (requires gateway running on port 8080)
# Edit app-2.py: Set USE_GATEWAY = True
python app-2.py
```

## Output Example

```
================================================================================
ADVANCED MCP-ENHANCED MULTI-AGENT WORKFLOW
================================================================================

Initializing specialized agents...
Created LLM with model: gpt-4o-mini, label: researcher
Created LLM with model: gpt-4o-mini, label: data-analyst
Created LLM with model: gpt-4o, label: chart-generator
Created LLM with model: gpt-4o-mini, label: file-manager

Building MCP-enhanced workflow...

Task: Research the latest trends in AI for 2024, analyze the data you find, create a bar chart comparing different AI technologies, and save the results.

================================================================================
STARTING WORKFLOW EXECUTION
================================================================================

[RESEARCHER] Starting research...
[RESEARCHER] Routing to: data_analyst

================================================================================
STEP 1
================================================================================
{'researcher': {'messages': [...]}}
================================================================================

[DATA ANALYST] Analyzing data...
[DATA ANALYST] Routing to: chart_generator

================================================================================
STEP 2
================================================================================
{'data_analyst': {'messages': [...]}}
================================================================================

...

Workflow completed in 4 steps!
```

## Use Cases

This multi-agent system is ideal for:

1. **Research Reports**: Gather information, analyze, visualize, and save
2. **Data Analysis Projects**: Fetch data, process, create charts, export
3. **Content Generation**: Research topics, synthesize, create visuals
4. **Automated Workflows**: Complex tasks requiring multiple specialized skills
5. **Business Intelligence**: Gather market data, analyze trends, create reports

## Advantages

1. **Modularity**: Each agent is independent and reusable
2. **Scalability**: Easy to add new agents with different specializations
3. **Flexibility**: Dynamic routing based on task requirements
4. **Observability**: Full tracing and monitoring capabilities
5. **Efficiency**: Agents work in their area of expertise

## Limitations

1. **Token Usage**: Multiple agent calls increase API costs
2. **Latency**: Sequential execution can be slower
3. **Complexity**: More agents means more potential failure points
4. **Routing Logic**: Keyword-based routing may not always be perfect

## Future Enhancements

- [ ] Add database agent for SQL queries
- [ ] Implement parallel agent execution
- [ ] Add human-in-the-loop approval steps
- [ ] Create supervisor agent for better routing decisions
- [ ] Add memory/persistence across sessions
- [ ] Implement error recovery mechanisms
- [ ] Add more sophisticated tool calling with MCP servers

## Troubleshooting

### Common Issues

**1. "OPENAI_API_KEY not found"**
```bash
export OPENAI_API_KEY="your-key-here"
```

**2. "Tavily API error"**
```bash
export TAVILY_API_KEY="your-tavily-key"
```

**3. "Connection refused to localhost:8080"**
- Set `USE_GATEWAY = False` to bypass gateway
- Or start the AI gateway: `./target/debug/vllora serve`

**4. "Module not found"**
```bash
pip install langchain langchain-openai langgraph langchain-tavily langchain-experimental
```

## Monitoring with LangSmith

All agent interactions are traced in LangSmith with:
- Thread IDs for conversation tracking
- Run IDs for execution tracking
- Agent-specific labels
- Custom tags for filtering

View traces at: https://smith.langchain.com

## Contributing

To extend this workflow:

1. Add new tools in the tools section
2. Create new agent with specialized prompt
3. Add routing logic in existing agents
4. Update the workflow graph
5. Test the new agent's integration

## License

This example is part of the LangDB AI Gateway samples.
