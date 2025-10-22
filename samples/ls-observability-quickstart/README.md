# LangSmith Observability Quickstart

This project demonstrates LangChain with LangSmith observability and LangGraph multi-agent workflows.

## Prerequisites

- Python 3.13 (already set up in `.venv`)
- OpenAI API key
- LangSmith API key
- Tavily API key (for search functionality)

## Setup

### 1. Activate Virtual Environment

Before running the application, activate the virtual environment:

**On macOS/Linux:**
```bash
source .venv/bin/activate
```

**On Windows:**
```bash
.venv\Scripts\activate
```

You should see `(.venv)` appear at the beginning of your terminal prompt.

### 2. Environment Variables

Environment variables are stored in the `.env` file. Make sure the following are configured:

```env
OPENAI_API_KEY=your_openai_api_key
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
TAVILY_API_KEY=your_tavily_api_key
```

The application will automatically load these from the `.env` file.

### 3. Install Dependencies

If you need to reinstall or update dependencies:

```bash
pip install -r requirements.txt
```

If `requirements.txt` doesn't exist, install the core dependencies:

```bash
pip install langchain langchain-openai langgraph langchain-tavily langsmith python-dotenv pandas requests
```

## Running the Application

### Run app-1.py

```bash
python app-1.py
```

### Run app.py

```bash
python app.py
```

## Project Structure

- `app.py` - Main application file with LangGraph multi-agent workflow
- `app-1.py` - Alternative implementation
- `.env` - Environment variables (API keys, configuration)
- `.venv/` - Python virtual environment

## What This Does

This project sets up a multi-agent system using LangGraph where:
- Different agents collaborate to solve tasks
- One agent can do research (using Tavily search)
- Another agent can generate charts (using Python REPL)
- Agents pass work between each other until the task is complete
- All interactions are traced in LangSmith for observability

## Deactivating Virtual Environment

When you're done, deactivate the virtual environment:

```bash
deactivate
```

## Troubleshooting

### Virtual environment not activating

Make sure you're in the correct directory:
```bash
cd /Users/anhthuduong/Documents/GitHub/ellora-ui/samples/ls-observability-quickstart
```

### Missing dependencies

Reinstall with:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### API errors

Check that your API keys in `.env` are valid and not expired.

## LangSmith Dashboard

View traces and monitoring at: https://smith.langchain.com

Set your project ID in the application code if needed.
