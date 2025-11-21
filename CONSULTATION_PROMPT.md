# Prompt for LLM Consultation

**Instructions:**
Copy and paste the entire content below into ChatGPT, Claude, or Gemini to get a fresh perspective on how to design this feature.

---

**System/Persona:**
You are an expert Senior Product Designer and AI Systems Architect. You specialize in building developer tools and LLMOps platforms (like LangSmith, Arize Phoenix).

**Context:**
I am building **Vllora**, an AI Gateway Web Interface that unifies interactions with various AI models.
We currently have a working product, and I want to add a new feature called **"Model Optimization"**.

**1. Current Product Knowledge Base:**
*   **Core Functionality**: Vllora is a central hub for chatting with and debugging AI models.
*   **Chat Interface**: A polished UI supporting nested conversations (threads), markdown, and real-time streaming.
*   **Observability (Traces)**: We automatically log every interaction (trace). We have a "Debug/Traces" page where users can view the request prompt, tool calls, response, latency, and cost.
*   **Model Explorer**: Users can browse and compare models from different providers (OpenAI, Anthropic, Local).
*   **Tech Stack**: React, TypeScript, Rust backend.

**2. The Feature Request (Model Optimization):**
I want to leverage our existing **Trace Data** to help users fine-tune their own models.
The goal is to let users take their real-world usage logs and turn them into better, cheaper, or faster models.

**Key Requirements:**
1.  **Dataset Generation**:
    *   Users should be able to select existing traces (which contain prompts, tool calls, and outputs).
    *   The system should help them "clean" or "format" these traces into a training dataset.
    *   The system should ideally "detect the vibe" or structure of the traces and allow the user to adjust parameters (e.g., number of samples, format, extra context).
2.  **Fine-tuning & Evaluation**:
    *   Users should be able to use that generated dataset to trigger a fine-tuning job (e.g., on OpenAI or a local model).
    *   Users need a way to **evaluate** the result. I want them to compare the "Before" (Base Model) vs. "After" (Fine-tuned Model) to see if it improved.
3.  **Experiment / Playground**:
    *   From any trace, users should be able to click "Experiment" to open a playground.
    *   **Crucial**: This must support **full conversation history** (multi-turn) and **multiple system prompts** (e.g., RAG context + instructions), not just a single prompt/response pair.
    *   **Tools / Functions**: Users must be able to define and edit tools (function schemas) that the model can call.
    *   **Multimodal Support**: Users must be able to attach images to messages for testing vision capabilities.
    *   **Custom Headers**: Users need to inject custom HTTP headers (e.g., `X-My-App-ID`) into the request.
    *   **Dynamic Parameters**: The UI must handle a wide range of model-specific parameters (temp, top_p, top_k, stop sequences, etc.) that change depending on the selected provider.
    *   **Dynamic Parameters**: The UI must handle a wide range of model-specific parameters (temp, top_p, top_k, stop sequences, etc.) that change depending on the selected provider.
    *   **Trace Inspection**: Users must be able to view the **hierarchical span trace** of the new run (to see tool calls, latency breakdowns, etc.), not just the final text output.
    *   **Continue Conversation**: Users should be able to "accept" a new experimental response and continue the conversation from that point (multi-turn testing).
    *   **JSON Mode**: Users must be able to switch to a "JSON View" to edit the raw API request body directly.
    *   Users need to edit/add/remove messages in the history and re-run.

**The Ask:**
Based *only* on the context and requirements above, please propose a solution:
1.  **User Flow**: Describe the step-by-step journey a user would take to go from "viewing a trace" to "deploying a fine-tuned model".
2.  **UI/UX Design**: Describe (or generate a text-based wireframe for) the key interfaces needed. How should the "Dataset Generator" look? How should the "Evaluation" screen look?
3.  **Process Flow**: How should the system handle the data transformation and training job submission?

Please provide your best product thinking for this feature.
