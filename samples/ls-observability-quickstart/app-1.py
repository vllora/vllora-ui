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


PROJECT_ID=''
API_BASE='http://localhost:8080/v1'
# API_BASE='https://api.openai.com/v1'  # Changed from localhost:8080 to default OpenAI endpoint
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
    return (
        result_str + "\n\nIf you have completed all tasks, respond with FINAL ANSWER."
    )
tavily_tool = TavilySearch(
    tavily_api_key="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", max_results=5
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
    # Removed content-type header as it interferes with OpenAI API
    llm = ChatOpenAI(
        model=model_name,
        base_url=api_base,  # Use base_url instead of deprecated openai_api_base
        default_headers=default_headers
    )
    return llm
def create_workflow(llm_research, llm_chart):
    """Create and return a compiled workflow graph with initialized agents."""
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

    # Create prompt templates with system messages
    research_prompt = ChatPromptTemplate.from_messages([
        ("system", make_system_prompt(
            "You can only do research. You are working with a chart generator colleague."
        )),
        MessagesPlaceholder(variable_name="messages"),
    ])

    chart_prompt = ChatPromptTemplate.from_messages([
        ("system", make_system_prompt(
            "You can only generate charts. You are working with a researcher colleague."
        )),
        MessagesPlaceholder(variable_name="messages"),
    ])

    # Initialize agents with prompt templates
    research_agent = create_react_agent(
        llm_research,
        tools=[tavily_tool],
        prompt=research_prompt
    )

    chart_agent = create_react_agent(
        llm_chart,
        tools=[python_repl_tool],
        prompt=chart_prompt
    )

    def research_node(state: MessagesState) -> Command[Literal["chart_generator", END]]:
        """Research node implementation."""
        result = research_agent.invoke(state)
        goto = get_next_node(result["messages"][-1], "chart_generator")
        result["messages"][-1] = HumanMessage(
            content=result["messages"][-1].content, name="researcher"
        )
        return Command(
            update={"messages": result["messages"]},
            goto=goto,
        )

    def chart_node(state: MessagesState) -> Command[Literal["researcher", END]]:
        """Chart generator node implementation."""
        result = chart_agent.invoke(state)
        goto = get_next_node(result["messages"][-1], "researcher")
        result["messages"][-1] = HumanMessage(
            content=result["messages"][-1].content, name="chart_generator"
        )
        return Command(
            update={"messages": result["messages"]},
            goto=goto,
        )

    # Create workflow
    workflow = StateGraph(MessagesState)
    workflow.add_node("researcher", research_node)
    workflow.add_node("chart_generator", chart_node)
    workflow.add_edge(START, "researcher")
    return workflow.compile()


def get_analytics(project_id: str, tags: str) -> List[Dict[str, Any]]:
    """
    Fetch analytics data from /analytics/summary with the specified project_id and tags.

    :param project_id: The ID of the project.
    :param tags: A comma-separated (or otherwise delimited) list of tags.
    :return: A list of dictionaries containing analytics data.
    """

    url = f"https://api.us-east-1.langdb.ai/analytics/summary"
    
    # Example: Setting start_time_us and end_time_us to "now - 1 day" through "now"
    # You can adjust these values as needed or accept them as function parameters.
    end_time_us = int(time.time() * 1_000_000)  # Current time in microseconds
    start_time_us = end_time_us - (24 * 60 * 60 * 1_000_000)  # 24 hours earlier
    
    # Prepare the JSON payload
    payload = { # If your API requires this in the body
        "start_time_us": start_time_us,
        "end_time_us": end_time_us,
        "groupBy": ["tag"],
        "tag_keys": [tags]
    }
    headers = {
        "x-project-id": project_id,
        "Authorization": f"Bearer {getenv('LANGDB_API_KEY')}"
    }
    # Make the POST request
    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    
    # Return the JSON response as a Python list of dictionaries
    return response.json()

def get_analytics_dataframe(project_id: str, tags: str) -> pd.DataFrame:
    """
    Calls get_analytics() and converts the returned 'summary' data into a Pandas DataFrame,
    with each row corresponding to one entry in the 'summary' list.

    :param project_id: The ID of the project for the x-project-id header.
    :param tags: A comma-separated list of tags (e.g. "gpt-4o,claude").
    :return: A Pandas DataFrame where each row is a summary record. 
             The 'tag_tuple' is flattened into a 'tag' column.
    """
    raw_json = get_analytics(project_id, tags)
    summary_list = raw_json.get("summary", [])


    df = pd.DataFrame(summary_list)

    if not df.empty:
        def clean_tag_tuple(tag_tuple):
            if isinstance(tag_tuple, list):
                flat_list = [item for sublist in tag_tuple for item in (sublist if isinstance(sublist, list) else [sublist])]
                cleaned_list = [item for item in flat_list if item not in (None, '')]
                return cleaned_list if cleaned_list else None
            return None

        df["tag_tuple"] = df["tag_tuple"].apply(clean_tag_tuple)
        df = df[df["tag_tuple"].notnull()]


    return df


thread_id = str(uuid.uuid4())
run_id = str(uuid.uuid4())
llm_research = create_llm(
    api_base=API_BASE,
    project_id=PROJECT_ID,
    model_name="gpt-4o",
    thread_id=thread_id,
    label="research-agent",
    run_id=run_id,
    tags="run=gpt-4o"
)
llm_chart = create_llm(
    api_base=API_BASE,
    project_id=PROJECT_ID,
    model_name="gpt-4o",
    thread_id=thread_id,
    label="chart-agent",
    run_id=run_id,
    tags="run=gpt-4o"
)
workflow1 = create_workflow(llm_research, llm_chart)
thread_id = str(uuid.uuid4())
run_id = str(uuid.uuid4())
llm_research = create_llm(
    api_base=API_BASE,
    project_id=PROJECT_ID,
    model_name="gpt-4o-mini",  # Changed from gemini to OpenAI model
    thread_id=thread_id,
    label="research-agent",
    run_id=run_id,
    tags="run=gpt-4o-mini"
)
llm_chart = create_llm(
    api_base=API_BASE,
    project_id=PROJECT_ID,
    model_name="gpt-4o-mini",  # Changed from gemini to OpenAI model
    thread_id=thread_id,
    label="chart-agent",
    run_id=run_id,
    tags="run=gpt-4o-mini"
)
workflow2 = create_workflow(llm_research, llm_chart)
thread_id = str(uuid.uuid4())
run_id = str(uuid.uuid4())
llm_research = create_llm(
    api_base=API_BASE,
    project_id=PROJECT_ID,
    model_name="gpt-4o-mini",  # Changed from gemini to OpenAI model
    thread_id=thread_id,
    label="research-agent",
    run_id=run_id,
    tags="run=combined"
)
llm_chart = create_llm(
    api_base=API_BASE,
    project_id=PROJECT_ID,
    model_name="gpt-4o",
    thread_id=thread_id,
    label="chart-agent",
    run_id=run_id,
    tags="run=combined"
)

workflow3 = create_workflow(llm_research, llm_chart)
events = workflow1.stream(
    {
        "messages": [
            (
                "user",
                "First, get the UK's GDP over the 2015-2020, then make a line chart of it. "
                "Once you make the chart, finish.",
            )
        ],
    },
    {"recursion_limit": 150},
)

for s in events:
    print(s)
    print("----")