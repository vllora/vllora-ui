# Lucy Setup Flow - UX Design Document

## Overview

When a user first interacts with Lucy, they need to have the Distri server running locally. This document outlines the UX flow for detecting, guiding, and connecting to the Distri server.

## User Journey

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Click Lucy     │────▶│  Check Distri    │────▶│  Show Setup     │────▶│  Normal Lucy    │
│  Button         │     │  Connection      │     │  Guide (if not  │     │  Chat           │
│                 │     │                  │     │  connected)     │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘     └─────────────────┘
```

## States

### State 1: Checking Connection
- **Trigger**: User clicks Lucy button for the first time (or after disconnect)
- **UI**: Brief loading spinner with "Connecting to Lucy..."
- **Duration**: 2-3 seconds max timeout
- **Next**: If connected → State 4, If not → State 2

### State 2: Setup Required (Not Connected)
- **Trigger**: Distri server not detected
- **UI**: Setup guide modal/panel
- **Content**: See [Setup Guide UI](#setup-guide-ui) below

### State 3: Connecting
- **Trigger**: User clicks "Connect" button
- **UI**: Loading state on Connect button
- **Duration**: Retry for ~5 seconds
- **Next**: If success → State 4, If fail → Show error with retry option

### State 4: Connected (Normal Operation)
- **Trigger**: Successful connection to Distri
- **UI**: Normal Lucy chat interface
- **Persistence**: Remember connection status in session

---

## Setup Guide UI

### Option A: Modal Dialog (Recommended)

```
┌────────────────────────────────────────────────────────────┐
│  ╭─────╮                                              [X]  │
│  │Lucy │   Set Up Lucy AI Assistant                        │
│  ╰─────╯                                                   │
│                                                            │
│  Lucy requires the Distri server to run locally.           │
│  Follow these steps to get started:                        │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Step 1: Download Distri                            │   │
│  │                                                    │   │
│  │ Detected: macOS (Apple Silicon)                    │   │
│  │                                                    │   │
│  │ [Download distri-darwin-arm64]                     │   │
│  │                                                    │   │
│  │ ▾ Other platforms                                  │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Step 2: Run the Server                             │   │
│  │                                                    │   │
│  │ Open terminal and run:                             │   │
│  │ ┌────────────────────────────────────────────┐    │   │
│  │ │ chmod +x distri-darwin-arm64               │ 📋 │   │
│  │ │ ./distri-darwin-arm64 serve                │    │   │
│  │ └────────────────────────────────────────────┘    │   │
│  │                                                    │   │
│  │ Keep this terminal running while using Lucy.       │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Step 3: Connect                                    │   │
│  │                                                    │   │
│  │ Once the server is running, click Connect below.   │   │
│  │                                                    │   │
│  │ Server URL:                                        │   │
│  │ ┌────────────────────────────────────────────┐    │   │
│  │ │ http://localhost:8081                      │    │   │
│  │ └────────────────────────────────────────────┘    │   │
│  │ (Change if running on a different port)            │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ○ Waiting for connection...                          │ │
│  │   (or)                                               │ │
│  │ ● Connected successfully!                            │ │
│  │   (or)                                               │ │
│  │ ✕ Connection failed. Is the server running?          │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│                              [Cancel]  [Connect to Lucy]   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Option B: Inline Panel (Alternative)

Instead of a modal, show the setup guide directly in the Lucy panel:

```
┌─────────────────────────────────────┐
│ ◀ Lucy                          [X] │
├─────────────────────────────────────┤
│                                     │
│        ╭─────╮                      │
│        │Lucy │                      │
│        ╰─────╯                      │
│                                     │
│   Lucy needs to connect to the      │
│   Distri server to work.            │
│                                     │
│   ─────────────────────────────     │
│                                     │
│   1. Download Distri                │
│      [Download for macOS ▾]         │
│                                     │
│   2. Run in terminal:               │
│      ┌─────────────────────┐        │
│      │ ./distri serve      │ 📋     │
│      └─────────────────────┘        │
│                                     │
│   3. Server URL:                    │
│      ┌─────────────────────┐        │
│      │ http://localhost:8081│        │
│      └─────────────────────┘        │
│                                     │
│   ○ Not connected                   │
│                                     │
│      [Connect to Lucy]              │
│                                     │
└─────────────────────────────────────┘
```

---

## Platform Detection

Auto-detect user's platform and show the appropriate download:

| Platform | Architecture | Binary Name |
|----------|--------------|-------------|
| macOS | Apple Silicon (arm64) | `distri-darwin-arm64` |
| macOS | Intel (x64) | `distri-darwin-amd64` |
| Linux | x64 | `distri-linux-amd64` |
| Linux | arm64 | `distri-linux-arm64` |
| Windows | x64 | `distri-windows-amd64.exe` |

### Detection Logic
```typescript
function detectPlatform(): { os: string; arch: string; binary: string } {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  // Detect OS
  let os = 'linux';
  if (userAgent.includes('mac') || platform.includes('mac')) {
    os = 'darwin';
  } else if (userAgent.includes('win') || platform.includes('win')) {
    os = 'windows';
  }

  // Detect architecture (best effort - may need user confirmation)
  // Note: Browser detection of arm64 vs x64 is limited
  let arch = 'amd64';
  if (platform.includes('arm') || userAgent.includes('arm')) {
    arch = 'arm64';
  }
  // For macOS, assume Apple Silicon for newer detection
  if (os === 'darwin' && !platform.includes('intel')) {
    arch = 'arm64'; // Default to Apple Silicon, show option for Intel
  }

  const ext = os === 'windows' ? '.exe' : '';
  const binary = `distri-${os}-${arch}${ext}`;

  return { os, arch, binary };
}
```

---

## Connection Check Logic

### API Endpoint
```
GET http://localhost:8081/health
```

### Implementation
```typescript
async function checkDistriConnection(url?: string): Promise<boolean> {
  const distriUrl = url || getDistriUrl();

  try {
    const response = await fetch(`${distriUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Validate URL format before saving
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
```

### Retry Strategy
- Initial check: 3 second timeout
- On "Connect" click: Retry every 1 second for 5 seconds
- Show success/failure feedback

---

## Component Structure

```
components/agent/
├── LucySetupGuide.tsx      # Inline setup guide (replaces chat content)
├── PlatformDownload.tsx    # Platform detection + download button
├── ConnectionStatus.tsx    # Connection indicator
└── useDistriSetup.ts       # Hook for setup flow logic

# Modified existing components:
├── AgentChatContent.tsx    # Show LucySetupGuide when not connected
└── useAgentChat.ts         # Add connection status check
```

### Integration with AgentChatContent

The setup guide replaces the current "Lucy Not Available" state:

```tsx
// In AgentChatContent.tsx
{agentLoading ? (
  <LoadingState />
) : !isConnected ? (
  <LucySetupGuide onConnected={handleConnected} />  // NEW
) : !agent ? (
  <LucyNotAvailable onSetup={openSetupGuide} />     // Add setup button
) : (
  <Chat ... />
)}
```

---

## User Experience Details

### Download Button Behavior
1. Click "Download" → Opens GitHub releases page in new tab
2. Show "Other platforms" expandable section for manual selection
3. After download, auto-expand Step 2

### Copy Command Button
- Click clipboard icon → Copy command to clipboard
- Show brief "Copied!" tooltip feedback

### Connect Button States
| State | Button Text | Appearance |
|-------|-------------|------------|
| Idle | "Connect to Lucy" | Primary button |
| Connecting | "Connecting..." | Disabled, spinner |
| Success | "Connected!" | Success color, then auto-close |
| Failed | "Retry" | Warning color |

### Connection Status Indicator
- `○ Not connected` - Gray, pulsing dot
- `◐ Connecting...` - Blue, animated
- `● Connected` - Green, solid
- `✕ Connection failed` - Red, with error message

### Error Messages
| Scenario | Message |
|----------|---------|
| Server not running | "Could not connect. Make sure the Distri server is running." |
| Wrong URL | "Connection refused. Check if the server URL is correct." |
| Timeout | "Connection timed out. The server may be starting up - try again." |

---

## Persistence & Session

### What to Remember
- **Persist**: Custom Distri URL (in localStorage)
- **Don't persist**: Connection status (always check on app load)
- **Persist (optional)**: User's platform preference if manually selected
- **Persist (optional)**: "Don't show again" preference (skip guide if previously connected)

### URL Storage
```typescript
const DISTRI_URL_KEY = 'vllora:distri-url';
const DEFAULT_DISTRI_URL = 'http://localhost:8081';

// Load URL from localStorage or use default/env
function getDistriUrl(): string {
  try {
    const stored = localStorage.getItem(DISTRI_URL_KEY);
    if (stored) return stored;
  } catch {
    // Ignore storage errors
  }
  return import.meta.env.VITE_DISTRI_URL || DEFAULT_DISTRI_URL;
}

// Save custom URL to localStorage
function saveDistriUrl(url: string): void {
  try {
    localStorage.setItem(DISTRI_URL_KEY, url);
  } catch {
    // Ignore storage errors
  }
}
```

### Session Flow
```
App Load → Check VITE_LUCY_ENABLED
         → If enabled, lazy-load Lucy components
         → On first Lucy button click, check connection
         → Show setup guide OR open chat
```

---

## Alternative: Auto-Retry in Background

Instead of blocking the user with a setup guide, we could:

1. Show Lucy panel immediately with a banner:
   ```
   ┌─────────────────────────────────────┐
   │ ⚠️ Connecting to Lucy server...     │
   │    [Setup Guide] if you need help   │
   └─────────────────────────────────────┘
   ```

2. Retry connection every 5 seconds in background
3. When connected, banner disappears and chat becomes active

**Pros**: Less intrusive, user can explore UI
**Cons**: May be confusing if user doesn't know they need to run something

---

## Recommendation

**Chosen approach: Option B (Inline Panel)**

The setup guide appears directly inside the Lucy panel, replacing the chat content when not connected. This approach:

1. **Contextual** - Setup appears where Lucy chat would be
2. **Familiar** - Uses the same panel UI that Lucy will use
3. **Less intrusive** - Feels more integrated, not a popup
4. **Consistent** - Same location for both setup and "Lucy Not Available" states

The inline panel:
- Shows when Distri is not connected (first click or reconnection)
- Has a clear "Connect" CTA
- Transitions to chat on successful connection
- Can show "Setup Guide" button from the existing "Lucy Not Available" state

---

## Design Decisions

1. **No auto-download**
   - vLLora and Distri have different licenses
   - Users must download and run Distri themselves
   - We only provide links to GitHub releases page

2. **No offline/air-gapped support**
   - Users must have internet access to download from GitHub
   - Not a supported use case for now

3. **Version compatibility** (deferred)
   - Handle in a future iteration
   - For now, assume users download the latest version

---

## Next Steps

1. ✅ Review and approve this UX design
2. Implement components:
   - [ ] `LucySetupGuide.tsx` - Inline setup guide component
   - [ ] `useDistriSetup.ts` - Hook for connection check, URL management
   - [ ] `PlatformDownload.tsx` - Platform detection + download button
   - [ ] `ConnectionStatus.tsx` - Connection indicator component
3. Modify existing components:
   - [ ] Update `AgentChatContent.tsx` to show setup guide when not connected
   - [ ] Update `useAgentChat.ts` to include connection status
4. Add URL persistence:
   - [ ] Store custom Distri URL in localStorage
   - [ ] Load URL on app start
