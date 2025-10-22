import uuid
from typing import Annotated, Literal
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.graph import MessagesState, END, StateGraph, START
from langgraph.types import Command
from os import getenv
from typing import Any, Dict, List
import time
import pandas as pd
import requests
from langchain_tavily import TavilySearch
from langchain_core.tools import tool
from langchain_experimental.utilities import PythonREPL

# Initialize Python REPL for code execution
repl = PythonREPL()

PROJECT_ID = ''
# Toggle between gateway and direct OpenAI
USE_GATEWAY = True  # Set to True to use local gateway, False for direct OpenAI
API_BASE = 'http://localhost:8080/v1' if USE_GATEWAY else None

@tool
def python_repl_tool(
    code: Annotated[str, "The python code to execute to generate your chart."],
) -> str:
    """Use this to execute python code. If you want to see the output of a value,
    you should print it out with `print(...)`. This is visible to the user."""
    try:
        result = repl.run(code)
    except BaseException as e:
        return f"Failed to execute. Error: {repr(e)}"
    result_str = f"Successfully executed:\n```python\n{code}\n```\nStdout: {result}"
    return result_str + "\n\nIf you have completed all tasks, respond with FINAL ANSWER."

@tool
def read_file_tool(
    file_path: Annotated[str, "The path to the file to read"],
) -> str:
    """Read the contents of a file from the filesystem."""
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        return f"File content:\n{content}"
    except Exception as e:
        return f"Failed to read file. Error: {repr(e)}"

@tool
def write_file_tool(
    file_path: Annotated[str, "The path to the file to write"],
    content: Annotated[str, "The content to write to the file"],
) -> str:
    """Write content to a file on the filesystem."""
    try:
        with open(file_path, 'w') as f:
            f.write(content)
        return f"Successfully wrote to {file_path}"
    except Exception as e:
        return f"Failed to write file. Error: {repr(e)}"

@tool
def list_directory_tool(
    directory_path: Annotated[str, "The directory path to list"],
) -> str:
    """List all files and directories in the given path."""
    import os
    try:
        items = os.listdir(directory_path)
        return f"Directory contents of {directory_path}:\n" + "\n".join(items)
    except Exception as e:
        return f"Failed to list directory. Error: {repr(e)}"

@tool
def fetch_web_data_tool(
    url: Annotated[str, "The URL to fetch data from"],
) -> str:
    """Fetch data from a web URL."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return f"Web content from {url}:\n{response.text[:1000]}..."
    except Exception as e:
        return f"Failed to fetch web data. Error: {repr(e)}"

@tool
def analyze_dataframe_tool(
    data_description: Annotated[str, "Description of the data to analyze"],
) -> str:
    """Analyze data using pandas. Returns statistical summary."""
    try:
        # This is a placeholder - in real MCP, this would interact with actual data
        return f"Statistical analysis of {data_description}:\nMean, median, std dev calculations would go here."
    except Exception as e:
        return f"Failed to analyze data. Error: {repr(e)}"

tavily_tool = TavilySearch(
    tavily_api_key=getenv("TAVILY_API_KEY", "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"),
    max_results=5
)

def get_next_node(message, default_next: str):
    """Determine the next node based on message content."""
    if "FINAL ANSWER" in message.content:
        return END
    return default_next

def make_system_prompt(suffix: str) -> str:
    """Create a system prompt with a custom suffix."""
    return (
        "You are a helpful AI assistant, collaborating with other assistants."
        " Use the provided tools to progress towards answering the question."
        " If you are unable to fully answer, that's OK, another assistant with different tools "
        " will help where you left off. Execute what you can to make progress."
        " If you or any of the other assistants have the final answer or deliverable,"
        " prefix your response with FINAL ANSWER so the team knows to stop."
        f"\n{suffix}"
    )

def create_llm(
    api_base: str,
    project_id: str,
    model_name: str = "gpt-4o-mini",
    thread_id: str = str(uuid.uuid4()),
    label: str = None,
    run_id: str = None,
    tags: str = None,
):
    """Create a ChatOpenAI instance with specified configuration."""
    if not project_id:
        default_headers = {"x-thread-id": thread_id}
    else:
        default_headers = {"x-project-id": project_id, "x-thread-id": thread_id}
    if label:
        default_headers["x-label"] = label
    if run_id:
        default_headers["x-run-id"] = run_id
    if tags:
        default_headers["x-tags"] = tags

    # Only include base_url if using gateway
    if api_base:
        llm = ChatOpenAI(
            model=model_name,
            base_url=api_base,
            default_headers=default_headers
        )
    else:
        llm = ChatOpenAI(
            model=model_name,
            default_headers=default_headers
        )
    print(f"Created LLM with model: {llm.model_name}, label: {label}")
    return llm

def create_mcp_workflow(llm_research, llm_data, llm_chart, llm_file):
    """Create an advanced multi-agent workflow with MCP-like capabilities."""
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

    # Research agent with web search capabilities
    research_prompt = ChatPromptTemplate.from_messages([
        ("system", make_system_prompt(
            "You are a RESEARCH SPECIALIST. Your role is to search the web for information using Tavily. "
            "Pass your findings to the data analyst or other specialists."
        )),
        MessagesPlaceholder(variable_name="messages"),
    ])

    # Data analyst agent with file and web data access
    data_prompt = ChatPromptTemplate.from_messages([
        ("system", make_system_prompt(
            "You are a DATA ANALYST. You can read files, fetch web data, and analyze datasets. "
            "Work with the researcher and chart generator to provide insights."
        )),
        MessagesPlaceholder(variable_name="messages"),
    ])

    # Chart generator with Python execution
    chart_prompt = ChatPromptTemplate.from_messages([
        ("system", make_system_prompt(
            "You are a VISUALIZATION SPECIALIST. You generate charts and graphs using Python code. "
            "Execute Python code to create visualizations based on data from other agents."
        )),
        MessagesPlaceholder(variable_name="messages"),
    ])

    # File manager agent
    file_prompt = ChatPromptTemplate.from_messages([
        ("system", make_system_prompt(
            "You are a FILE SYSTEM MANAGER. You can read, write, and list files. "
            "Help other agents by managing file operations."
        )),
        MessagesPlaceholder(variable_name="messages"),
    ])

    # Initialize agents with specialized tools
    research_agent = create_react_agent(
        llm_research,
        tools=[tavily_tool],
        prompt=research_prompt
    )

    data_agent = create_react_agent(
        llm_data,
        tools=[fetch_web_data_tool, analyze_dataframe_tool, read_file_tool],
        prompt=data_prompt
    )

    chart_agent = create_react_agent(
        llm_chart,
        tools=[python_repl_tool],
        prompt=chart_prompt
    )

    file_agent = create_react_agent(
        llm_file,
        tools=[read_file_tool, write_file_tool, list_directory_tool],
        prompt=file_prompt
    )

    def research_node(state: MessagesState) -> Command[Literal["data_analyst", "chart_generator", "file_manager", END]]:
        """Research node - searches web for information."""
        print("\n[RESEARCHER] Starting research...")
        result = research_agent.invoke(state)
        content = result["messages"][-1].content

        # Route based on content
        if "FINAL ANSWER" in content:
            goto = END
        elif any(word in content.lower() for word in ["data", "file", "read", "analyze"]):
            goto = "data_analyst"
        elif any(word in content.lower() for word in ["chart", "graph", "plot", "visualize"]):
            goto = "chart_generator"
        elif any(word in content.lower() for word in ["save", "write", "file"]):
            goto = "file_manager"
        else:
            goto = "data_analyst"

        result["messages"][-1] = HumanMessage(
            content=content, name="researcher"
        )
        print(f"[RESEARCHER] Routing to: {goto}")
        return Command(update={"messages": result["messages"]}, goto=goto)

    def data_node(state: MessagesState) -> Command[Literal["researcher", "chart_generator", "file_manager", END]]:
        """Data analyst node - analyzes data and files."""
        print("\n[DATA ANALYST] Analyzing data...")
        result = data_agent.invoke(state)
        content = result["messages"][-1].content

        if "FINAL ANSWER" in content:
            goto = END
        elif any(word in content.lower() for word in ["chart", "graph", "plot", "visualize"]):
            goto = "chart_generator"
        elif any(word in content.lower() for word in ["save", "write"]):
            goto = "file_manager"
        elif any(word in content.lower() for word in ["search", "find more", "look up"]):
            goto = "researcher"
        else:
            goto = "chart_generator"

        result["messages"][-1] = HumanMessage(
            content=content, name="data_analyst"
        )
        print(f"[DATA ANALYST] Routing to: {goto}")
        return Command(update={"messages": result["messages"]}, goto=goto)

    def chart_node(state: MessagesState) -> Command[Literal["researcher", "data_analyst", "file_manager", END]]:
        """Chart generator node - creates visualizations."""
        print("\n[CHART GENERATOR] Creating visualization...")
        result = chart_agent.invoke(state)
        content = result["messages"][-1].content

        if "FINAL ANSWER" in content:
            goto = END
        elif any(word in content.lower() for word in ["save", "write", "export"]):
            goto = "file_manager"
        elif any(word in content.lower() for word in ["more data", "need data"]):
            goto = "data_analyst"
        elif any(word in content.lower() for word in ["search", "find"]):
            goto = "researcher"
        else:
            goto = END

        result["messages"][-1] = HumanMessage(
            content=content, name="chart_generator"
        )
        print(f"[CHART GENERATOR] Routing to: {goto}")
        return Command(update={"messages": result["messages"]}, goto=goto)

    def file_node(state: MessagesState) -> Command[Literal["researcher", "data_analyst", "chart_generator", END]]:
        """File manager node - handles file operations."""
        print("\n[FILE MANAGER] Managing files...")
        result = file_agent.invoke(state)
        content = result["messages"][-1].content

        if "FINAL ANSWER" in content:
            goto = END
        else:
            goto = END  # After saving, usually done

        result["messages"][-1] = HumanMessage(
            content=content, name="file_manager"
        )
        print(f"[FILE MANAGER] Routing to: {goto}")
        return Command(update={"messages": result["messages"]}, goto=goto)

    # Create workflow with all agents
    workflow = StateGraph(MessagesState)
    workflow.add_node("researcher", research_node)
    workflow.add_node("data_analyst", data_node)
    workflow.add_node("chart_generator", chart_node)
    workflow.add_node("file_manager", file_node)
    workflow.add_edge(START, "researcher")

    return workflow.compile()


def get_analytics(project_id: str, tags: str) -> List[Dict[str, Any]]:
    """Fetch analytics data from /analytics/summary."""
    url = f"https://api.us-east-1.langdb.ai/analytics/summary"

    end_time_us = int(time.time() * 1_000_000)
    start_time_us = end_time_us - (24 * 60 * 60 * 1_000_000)

    payload = {
        "start_time_us": start_time_us,
        "end_time_us": end_time_us,
        "groupBy": ["tag"],
        "tag_keys": [tags]
    }
    headers = {
        "x-project-id": project_id,
        "Authorization": f"Bearer {getenv('LANGDB_API_KEY')}"
    }

    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()

    return response.json()


if __name__ == "__main__":
    print("=" * 80)
    print("ADVANCED MCP-ENHANCED MULTI-AGENT WORKFLOW")
    print("=" * 80)

    # Create agents with different specializations
    thread_id = str(uuid.uuid4())
    run_id = str(uuid.uuid4())

    print("\nInitializing specialized agents...")

    llm_research = create_llm(
        api_base=API_BASE,
        project_id=PROJECT_ID,
        model_name="gpt-4o-mini",
        thread_id=thread_id,
        label="researcher",
        run_id=run_id,
        tags="agent=researcher"
    )

    llm_data = create_llm(
        api_base=API_BASE,
        project_id=PROJECT_ID,
        model_name="gpt-4o-mini",
        thread_id=thread_id,
        label="data-analyst",
        run_id=run_id,
        tags="agent=data-analyst"
    )

    llm_chart = create_llm(
        api_base=API_BASE,
        project_id=PROJECT_ID,
        model_name="gpt-4o",
        thread_id=thread_id,
        label="chart-generator",
        run_id=run_id,
        tags="agent=chart-generator"
    )

    llm_file = create_llm(
        api_base=API_BASE,
        project_id=PROJECT_ID,
        model_name="gpt-4o-mini",
        thread_id=thread_id,
        label="file-manager",
        run_id=run_id,
        tags="agent=file-manager"
    )

    # Create the complex MCP workflow
    print("\nBuilding MCP-enhanced workflow...")
    workflow = create_mcp_workflow(llm_research, llm_data, llm_chart, llm_file)

    # Example complex task that requires multiple agents
    task = (
        "Research the latest trends in AI for 2024, "
        "analyze the data you find, "
        "create a bar chart comparing different AI technologies, "
        "and save the results."
    )

    print(f"\nTask: {task}")
    print("\n" + "=" * 80)
    print("STARTING WORKFLOW EXECUTION")
    print("=" * 80 + "\n")

    events = workflow.stream(
        {
            "messages": [
                ("user", task)
            ],
        },
        {"recursion_limit": 150},
    )

    step_count = 0
    for s in events:
        step_count += 1
        print(f"\n{'='*80}")
        print(f"STEP {step_count}")
        print(f"{'='*80}")
        print(s)
        print("=" * 80)

    print(f"\n\nWorkflow completed in {step_count} steps!")
