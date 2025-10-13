from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langchain_tavily import TavilySearch
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

def make_system_prompt(suffix: str) -> str:
    """Create a system prompt with a custom suffix."""
    return (
        "You are a helpful AI assistant, collaborating with other assistants."
        " Use the provided tools to progress towards answering the question."
        " If you are unable to fully answer, that's OK, another assistant with different tools "
        " will help where you left off. Execute what you can to make progress."
        " If you or any of the other assistants have the final answer or deliverable,"
        " prefix your response with FINAL ANSWER so the team knows to stop.\n"
        f"{suffix}"
    )

# Create LLM with custom headers (like in app-1.py)
llm = ChatOpenAI(
    model="gpt-4o-mini",
    default_headers={'x-thread-id': '123'}  # Removed content-type header
)

print(f"LLM model_name: {llm.model_name}")

# Create tool
tavily_tool = TavilySearch(tavily_api_key="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", max_results=5)

# Create prompt (like in app-1.py)
research_prompt = ChatPromptTemplate.from_messages([
    ("system", make_system_prompt(
        "You can only do research. You are working with a chart generator colleague."
    )),
    MessagesPlaceholder(variable_name="messages"),
])

# Create agent with prompt
agent = create_react_agent(llm, tools=[tavily_tool], prompt=research_prompt)

print(f"Agent created successfully")

# Try to invoke
try:
    result = agent.invoke({
        "messages": [HumanMessage(content="What is the capital of France?")]
    })
    print(f"Success!")
except Exception as e:
    print(f"Error: {e}")
