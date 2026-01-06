# Feature: Real-time Debug Mode for LLM Requests

## Description

Enable developers to intercept, inspect, and control LLM API requests in real-time before they reach the provider.

## Problem

When building AI applications, developers often need to:
- Inspect what's being sent to the LLM before execution
- Debug unexpected model behavior by examining the actual request payload
- Modify requests on-the-fly during development/testing
- Understand the flow of messages and parameters in complex agent workflows

## Solution

A debug mode that pauses outgoing LLM requests at the gateway, allowing developers to:

1. **Inspect** - View the full request (model, messages, parameters) before it's sent
2. **Continue** - Resume execution with the original request
3. **Modify** *(future)* - Edit the request before continuing

## User Experience

### Enabling Debug Mode
- Toggle debug mode on/off from the toolbar
- When enabled, all outgoing API requests are intercepted at the gateway

### Visual Indicators
- Debug toolbar shows the number of active breakpoints (paused requests)
- Thread list shows an animated indicator for threads with active breakpoints
- Trace timeline highlights paused spans with a yellow accent

### Managing Breakpoints
- View paused requests in the trace timeline
- Click the play button on individual spans to continue execution
- Use "Continue All" to resume all paused requests at once
- Stop debug mode to disable interception and resume normal operation

## Use Cases

1. **Request Debugging** - Verify the exact payload being sent to the LLM provider
2. **Agent Development** - Step through multi-step agent workflows one API call at a time
3. **Prompt Engineering** - Inspect how prompts are constructed before execution
4. **Error Investigation** - Catch and examine requests that might cause errors

## Screenshots

*(Add screenshots here)*

## Related PRs

- PR #XXX - Initial debug mode implementation
