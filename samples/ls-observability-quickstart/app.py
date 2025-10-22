"""
Advanced Multi-Agent System with OpenAI Agents SDK + LangSmith Integration
Environment variables loaded from .env file
"""

import os
from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from dotenv import load_dotenv

# ============================================================================
# SETUP: Load Environment Variables from .env file
# ============================================================================

# Load environment variables from .env file
load_dotenv()

# Validate required environment variables
required_env_vars = {
    "OPENAI_API_KEY": "OpenAI API key is required",
    "LANGSMITH_API_KEY": "LangSmith API key is required",
}

missing_vars = []
for var, message in required_env_vars.items():
    if not os.getenv(var):
        missing_vars.append(f"  - {var}: {message}")

if missing_vars:
    print("❌ Error: Missing required environment variables:\n")
    print("\n".join(missing_vars))
    print("\nPlease create a .env file with these variables.")
    print("See .env.example for reference.")
    exit(1)

# Get environment variables with defaults
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY")
LANGSMITH_TRACING = os.getenv("LANGSMITH_TRACING", "true")
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "openai-agents-demo")
LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")

# Print configuration (without exposing keys)
print("✅ Configuration loaded successfully:")
print(f"   OpenAI API Key: {'*' * 20}{OPENAI_API_KEY[-4:]}")
print(f"   LangSmith API Key: {'*' * 20}{LANGSMITH_API_KEY[-4:]}")
print(f"   LangSmith Tracing: {LANGSMITH_TRACING}")
print(f"   LangSmith Project: {LANGSMITH_PROJECT}")
print(f"   LangSmith Endpoint: {LANGSMITH_ENDPOINT}\n")

# OpenAI Agents SDK imports
from agents import (
    Agent,
    Runner,
    function_tool,
    handoff,
    RunContextWrapper,
    SQLiteSession,
    set_trace_processors
)

# LangSmith imports
from langsmith import traceable
from langsmith.wrappers import wrap_openai, OpenAIAgentsTracingProcessor
import openai

# ============================================================================
# INITIALIZE LANGSMITH TRACING
# ============================================================================

set_trace_processors([
    OpenAIAgentsTracingProcessor(
        project_name=LANGSMITH_PROJECT,
        tags=["multi-agent", "customer-service", "demo"],
        metadata={
            "environment": os.getenv("ENVIRONMENT", "development"),
            "version": "1.0.0"
        }
    )
])

# generate uuid thread
import uuid
thread_id = str(uuid.uuid4())


# Wrap OpenAI client for additional direct API calls (sync client for direct calls)
wrapped_openai_client = wrap_openai(openai.Client(
    # Uncomment to use custom endpoint:
    # base_url="http://localhost:8080/v1",
    default_headers={
        'x-thread-id': thread_id
    }
))

# Wrap async client for agents SDK
wrapped_openai_async_client = wrap_openai(openai.AsyncClient(
    # Uncomment to use custom endpoint:
    # base_url="http://localhost:8080/v1",
    default_headers={
        'x-thread-id': thread_id
    }
))

# Set wrapped async client as default for all agents
from agents import set_default_openai_client
set_default_openai_client(wrapped_openai_async_client)

# ============================================================================
# PART 1: Define Tools with LangSmith Tracing
# ============================================================================

def _search_database_impl(query: str) -> str:
    """Search the company database for customer information."""
    database = {
        "customer_123": {
            "name": "Alice Johnson",
            "balance": 1500.50,
            "status": "premium",
            "email": "alice@example.com"
        },
        "customer_456": {
            "name": "Bob Smith",
            "balance": -200.00,
            "status": "standard",
            "email": "bob@example.com"
        },
        "customer_789": {
            "name": "Carol White",
            "balance": 5000.00,
            "status": "premium",
            "email": "carol@example.com"
        }
    }

    for cust_id, data in database.items():
        if query.lower() in data["name"].lower() or query in cust_id:
            result = (f"Found: ID={cust_id}, Name={data['name']}, "
                     f"Balance=${data['balance']}, Status={data['status']}, "
                     f"Email={data['email']}")
            print(f"[TRACE] Database search: {query} -> {cust_id}")
            return result

    return f"No customer found matching: {query}"

@function_tool
def search_database(query: str) -> str:
    """Search the company database for customer information."""
    return _search_database_impl(query)


@function_tool
def calculate_refund(order_id: str, reason: str) -> str:
    """Calculate refund amount for an order."""
    orders = {
        "ORD-001": {"amount": 299.99, "eligible": True, "date": "2025-09-15"},
        "ORD-002": {"amount": 1499.99, "eligible": False, "date": "2025-01-10"},
        "ORD-003": {"amount": 89.99, "eligible": True, "date": "2025-09-20"}
    }
    
    if order_id in orders:
        order = orders[order_id]
        if order["eligible"]:
            refund = order["amount"] * 0.9
            result = (f"✅ Refund approved: ${refund:.2f} for order {order_id}. "
                     f"Original amount: ${order['amount']}. Reason: {reason}")
            print(f"[TRACE] Refund calculated: {order_id} -> ${refund:.2f}")
            return result
        else:
            return (f"❌ Order {order_id} is not eligible for refund "
                   f"(purchased on {order['date']}, outside 30-day window)")
    
    return f"❌ Order {order_id} not found in system"


@function_tool
def check_inventory(product_name: str) -> str:
    """Check product availability in inventory."""
    inventory = {
        "laptop": {"stock": 15, "price": 999.99, "warehouse": "West Coast", "sku": "LAP-001"},
        "headphones": {"stock": 0, "price": 149.99, "warehouse": "East Coast", "sku": "HP-002"},
        "monitor": {"stock": 8, "price": 349.99, "warehouse": "Central", "sku": "MON-003"},
        "keyboard": {"stock": 50, "price": 79.99, "warehouse": "West Coast", "sku": "KEY-004"}
    }
    
    product = product_name.lower()
    if product in inventory:
        item = inventory[product]
        status = "✅ In Stock" if item["stock"] > 0 else "❌ Out of Stock"
        result = (f"{product.title()}: {status} ({item['stock']} units) - "
                 f"${item['price']} - SKU: {item['sku']} - Location: {item['warehouse']}")
        print(f"[TRACE] Inventory checked: {product} -> {item['stock']} units")
        return result
    
    return f"❌ Product '{product_name}' not found in inventory"


@function_tool
def send_email(recipient: str, subject: str, body: str) -> str:
    """Send an email to a customer."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[TRACE] Email sent: {recipient} - {subject}")
    return (f"✅ Email sent to {recipient} at {timestamp}\n"
           f"Subject: {subject}\n"
           f"Body: {body[:100]}...")


@function_tool
def escalate_to_human(customer_id: str, issue_summary: str, priority: str) -> str:
    """Escalate a complex issue to a human supervisor."""
    ticket_id = f"ESC-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    print(f"[TRACE] Escalation created: {ticket_id} - Priority: {priority}")
    return (f"🎫 Ticket {ticket_id} created\n"
           f"Priority: {priority.upper()}\n"
           f"Customer: {customer_id}\n"
           f"Issue: {issue_summary}\n"
           f"A supervisor will contact them within 1 hour.")


# ============================================================================
# PART 2: Custom Business Logic with Tracing
# ============================================================================

@traceable(
    run_type="chain",
    name="Customer Risk Assessment",
    tags=["risk", "analysis"]
)
def assess_customer_risk(customer_id: str, issue_type: str) -> dict:
    """Custom business logic to assess customer risk."""
    risk_factors = {
        "refund": 0.3,
        "complaint": 0.7,
        "inquiry": 0.1
    }
    
    base_risk = risk_factors.get(issue_type.lower(), 0.5)
    is_premium = "123" in customer_id or "789" in customer_id
    
    if is_premium:
        risk_score = base_risk * 0.5
    else:
        risk_score = base_risk
    
    assessment = {
        "customer_id": customer_id,
        "risk_score": risk_score,
        "risk_level": "high" if risk_score > 0.6 else "medium" if risk_score > 0.3 else "low",
        "is_premium": is_premium,
        "recommended_action": "escalate" if risk_score > 0.6 else "handle_normally"
    }
    
    print(f"[TRACE] Risk assessment: {customer_id} -> {assessment['risk_level']}")
    return assessment


@traceable(
    run_type="llm",
    name="Sentiment Analysis",
    tags=["nlp", "sentiment"]
)
async def analyze_sentiment(text: str) -> dict:
    """Use LLM to analyze customer sentiment."""
    response = wrapped_openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "Analyze the sentiment and urgency of the customer message. Respond with JSON: {\"sentiment\": \"positive/neutral/negative\", \"urgency\": \"low/medium/high\", \"emotion\": \"calm/frustrated/angry\"}"
            },
            {
                "role": "user",
                "content": text
            }
        ],
        temperature=0.1
    )
    
    import json
    try:
        result = json.loads(response.choices[0].message.content)
        print(f"[TRACE] Sentiment analysis: {result['sentiment']}/{result['urgency']}")
        return result
    except:
        return {"sentiment": "neutral", "urgency": "medium", "emotion": "calm"}


# ============================================================================
# PART 3: Structured Outputs
# ============================================================================

class EscalationData(BaseModel):
    """Data required for escalating to supervisor."""
    customer_id: str
    issue_summary: str
    priority: str
    sentiment: Optional[str] = "unknown"


class CustomerAnalysis(BaseModel):
    """Comprehensive customer interaction analysis."""
    customer_id: str
    issue_type: str
    sentiment: str
    requires_escalation: bool
    confidence_score: float
    recommended_agent: str


# ============================================================================
# PART 4: Define Specialized Agents
# ============================================================================

customer_service_agent = Agent(
    name="Customer Service Agent",
    instructions="""You are a friendly customer service representative.
    
    Your responsibilities:
    - Help customers with general inquiries and product questions
    - Look up customer account information using search_database
    - Check product availability using check_inventory
    - Maintain a warm, professional, and helpful tone
    
    When to hand off:
    - Refund requests → transfer to Refunds Agent
    - Complex issues or angry customers → transfer to Supervisor Agent
    
    Always be empathetic and solution-oriented.""",
    tools=[search_database, check_inventory],
    model="gpt-4o-mini"
)

refunds_agent = Agent(
    name="Refunds Agent",
    instructions="""You are a refunds and returns specialist.
    
    Your process:
    1. Ask for order ID if not provided
    2. Ask for reason for return
    3. Use calculate_refund to process the request
    4. Use send_email to send confirmation
    
    Be understanding but follow policy:
    - 30-day return window
    - 90% refund on eligible orders
    - Escalate if customer is very upset or special circumstances exist
    
    Always confirm the customer understands the refund amount and timeline.""",
    tools=[calculate_refund, send_email, search_database],
    model="gpt-4o-mini"
)

async def on_escalation(ctx: RunContextWrapper[None], input_data: EscalationData):
    """Called when an issue is escalated - logs to LangSmith."""
    print(f"\n🚨 ESCALATION ALERT:")
    print(f"   Customer: {input_data.customer_id}")
    print(f"   Priority: {input_data.priority}")
    print(f"   Sentiment: {input_data.sentiment}")
    print(f"   Issue: {input_data.issue_summary}\n")
    
    risk = assess_customer_risk(input_data.customer_id, "complaint")
    print(f"   Risk Level: {risk['risk_level']}")
    print(f"   Recommended Action: {risk['recommended_action']}\n")


supervisor_agent = Agent(
    name="Supervisor Agent",
    instructions="""You are a senior customer service supervisor with authority to make exceptions.
    
    Your role:
    - Handle complex cases and escalations
    - Make special exceptions when appropriate
    - Resolve difficult situations professionally
    - Use escalate_to_human for issues requiring offline follow-up
    
    Principles:
    - Listen empathetically to customer concerns
    - Find win-win solutions when possible
    - Protect company interests while satisfying customers
    - Premium customers get priority treatment
    
    You have access to all tools and can override standard policies when justified.""",
    tools=[escalate_to_human, send_email, calculate_refund, search_database],
    model="gpt-4o"
)

triage_agent = Agent(
    name="Triage Agent",
    instructions="""You are the initial point of contact for all customers.
    
    Your job:
    1. Greet customers warmly and professionally
    2. Quickly understand their needs
    3. Route to the appropriate specialist:
       - General questions/product info → Customer Service Agent
       - Refunds/returns/order issues → Refunds Agent
       - Complaints/complex issues → Supervisor Agent
    
    Be efficient but friendly. Transfer customers promptly with context.""",
    handoffs=[
        customer_service_agent,
        handoff(
            agent=refunds_agent,
            tool_description_override="Transfer to refund specialist for returns, refunds, and order issues"
        ),
        handoff(
            agent=supervisor_agent,
            input_type=EscalationData,
            on_handoff=on_escalation,
            tool_description_override="Escalate to supervisor for complaints, complex issues, or special requests"
        ),
    ],
    model="gpt-4o-mini"
)

refunds_agent.handoffs = [
    handoff(
        agent=supervisor_agent,
        input_type=EscalationData,
        on_handoff=on_escalation,
        tool_description_override="Escalate to supervisor if customer is very upset or special circumstances"
    )
]

analysis_agent = Agent(
    name="Analysis Agent",
    instructions="""Analyze customer interactions and provide structured assessments.
    
    Determine:
    - customer_id: Extract or infer the customer ID
    - issue_type: Classify as inquiry/refund/complaint
    - sentiment: Assess as positive/neutral/negative
    - requires_escalation: Boolean based on urgency and complexity
    - confidence_score: Your confidence level (0-1)
    - recommended_agent: Which agent should handle this
    
    Be analytical and objective.""",
    output_type=CustomerAnalysis,
    model="gpt-4o-mini"
)


# ============================================================================
# PART 5: Advanced Workflow with Full Tracing
# ============================================================================

@traceable(
    run_type="chain",
    name="Enhanced Customer Service Workflow",
    tags=["workflow", "orchestration"]
)
async def enhanced_customer_workflow(customer_message: str, customer_id: Optional[str] = None):
    """
    Advanced workflow that combines sentiment analysis, risk assessment,
    and intelligent routing with full LangSmith tracing.
    """
    print(f"\n{'='*70}")
    print(f"  ENHANCED WORKFLOW - Processing Customer Request")
    print(f"{'='*70}\n")
    
    # Step 1: Sentiment Analysis
    sentiment_result = await analyze_sentiment(customer_message)
    print(f"📊 Sentiment: {sentiment_result['sentiment']} | Urgency: {sentiment_result['urgency']}")
    
    # Step 2: Get customer info if ID provided
    if customer_id:
        customer_info = _search_database_impl(customer_id)
        print(f"👤 Customer Info: {customer_info}\n")
    
    # Step 3: Route through triage agent
    session = SQLiteSession(session_id="enhanced_workflow")
    result = await Runner.run(
        triage_agent,
        customer_message,
        session=session
    )
    
    print(f"\n✅ Final Response:\n{result.final_output}\n")
    print(f"{'='*70}\n")
    
    return {
        "response": result.final_output,
        "sentiment": sentiment_result,
        "trace_url": "Check LangSmith dashboard for full trace"
    }


def print_separator(title: str):
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70 + "\n")


# ============================================================================
# PART 6: Run Examples
# ============================================================================

async def main():
    """Run comprehensive examples with LangSmith tracing."""
    
    print("\n" + "🚀 "*20)
    print("  OpenAI Agents SDK + LangSmith Integration Demo")
    print("  All interactions are being traced to LangSmith")
    print("🚀 "*20 + "\n")
    
    # Example 1: Simple product inquiry
    print_separator("EXAMPLE 1: Product Inquiry")
    result1 = await Runner.run(
        triage_agent,
        "Hi! I'm looking for a laptop. Do you have any in stock? What's the price?"
    )
    print(f"Response:\n{result1.final_output}\n")
    
    # Example 2: Refund request with handoff
    print_separator("EXAMPLE 2: Refund Request (Agent Handoff)")
    result2 = await Runner.run(
        triage_agent,
        "I want to return my order ORD-001. The product quality didn't meet my expectations."
    )
    print(f"Response:\n{result2.final_output}\n")
    
    # Example 3: Complex escalation
    print_separator("EXAMPLE 3: Angry Customer (Escalation)")
    result3 = await enhanced_customer_workflow(
        customer_message="I am EXTREMELY frustrated! I ordered ORD-002 weeks ago and it still hasn't arrived. I want a full refund RIGHT NOW!",
        customer_id="customer_456"
    )
    print(f"Workflow Result: {result3}\n")
    
    # Example 4: Structured analysis
    print_separator("EXAMPLE 4: Interaction Analysis (Structured Output)")
    result4 = await Runner.run(
        analysis_agent,
        "This product is terrible and I want my money back immediately! Customer ID: customer_123"
    )
    print(f"Analysis:\n")
    print(f"  Issue Type: {result4.final_output.issue_type}")
    print(f"  Sentiment: {result4.final_output.sentiment}")
    print(f"  Escalation Needed: {result4.final_output.requires_escalation}")
    print(f"  Recommended Agent: {result4.final_output.recommended_agent}")
    print(f"  Confidence: {result4.final_output.confidence_score}\n")
    
    # Example 5: Multi-turn conversation with session
    print_separator("EXAMPLE 5: Multi-Turn Conversation")
    session = SQLiteSession(session_id="multi_turn_example")
    
    result5a = await Runner.run(
        triage_agent,
        "Hi, can you look up my account? I'm Alice Johnson.",
        session=session
    )
    print(f"Turn 1:\n{result5a.final_output}\n")
    
    result5b = await Runner.run(
        triage_agent,
        "What's my current balance and status?",
        session=session
    )
    print(f"Turn 2:\n{result5b.final_output}\n")
    
    result5c = await Runner.run(
        triage_agent,
        "Great! Do you have keyboards in stock?",
        session=session
    )
    print(f"Turn 3:\n{result5c.final_output}\n")
    
    print("\n" + "✅ "*20)
    print("  All examples complete!")
    print("  Check your LangSmith dashboard for detailed traces:")
    print("  https://smith.langchain.com/")
    print("✅ "*20 + "\n")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())