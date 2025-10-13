from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langchain_tavily import TavilySearch
from langchain_core.messages import HumanMessage

# Create LLM
llm = ChatOpenAI(
    model="gpt-4o-mini",
    default_headers={'x-thread-id': '123'}
)

print(f"LLM model_name: {llm.model_name}")

# Create tool
tavily_tool = TavilySearch(tavily_api_key="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", max_results=5)

# Create agent
agent = create_react_agent(llm, tools=[tavily_tool])

print(f"Agent created successfully")

# Try to invoke
try:
    result = agent.invoke({
        "messages": [HumanMessage(content="What is the capital of France?")]
    })
    print(f"Success: {result}")
except Exception as e:
    print(f"Error: {e}")
