# Ellora - AI Gateway Web UI

A comprehensive web application for exploring AI models and interacting with them through a beautiful chat interface. Built with React, TypeScript, and a Rust-based AI Gateway backend.

## Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- Rust and Cargo (for running the backend)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/langdb/ellora-ui.git
cd ellora-ui
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Start the backend** (in one terminal)
```bash
pnpm start:backend
```

4. **Start the frontend** (in another terminal)
```bash
pnpm dev
```

5. **Open your browser**
```
http://localhost:5173
```

## Development

### Available Scripts

- `pnpm dev` - Start the development server (Vite)
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm start:backend` - Start AI Gateway backend (development mode)
- `pnpm start:backend:release` - Start AI Gateway backend (release mode)

### Environment Variables

Create a `.env` file in the root directory:

```bash
VITE_BACKEND_URL=http://localhost:8080
VITE_BACKEND_PORT=8080
```

## Architecture

```
┌─────────────────────────────────────────┐
│            Ellora Web App               │
│  ┌───────────────────────────────────┐  │
│  │   React Frontend (Vite)           │  │
│  │   - UI Components                 │  │
│  │   - Chat Interface                │  │
│  │   - Model Explorer                │  │
│  │   - Real-time Streaming           │  │
│  └───────────────────────────────────┘  │
│                  ↕ HTTP/SSE              │
│  ┌───────────────────────────────────┐  │
│  │   AI Gateway (Rust)               │  │
│  │   - Multi-provider Support        │  │
│  │   - Streaming API                 │  │
│  │   - Model Management              │  │
│  │   - Request Routing               │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Features

### Frontend
- ⚛️ **React 19** with TypeScript
- 🎨 **Tailwind CSS** with custom color schemes
- 🧩 **shadcn/ui** components
- 🎯 **Vite** for fast development
- 📱 **Responsive Design**
- 🌓 **Dark Mode** support
- 🔄 **Real-time Streaming** with Server-Sent Events

### Backend
- 🦀 **Rust-based** API Gateway
- 🔌 **Multi-provider** support (OpenAI, Anthropic, Google, etc.)
- 📊 **Request Analytics**
- 💾 **SQLite** database for state management
- 🔄 **Health Monitoring**
- 📝 **Comprehensive Logging**

## Project Structure

```
ellora-ui/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── contexts/          # React contexts
│   ├── services/          # API services
│   └── config/            # Configuration
├── vllora/            # Backend Rust project
│   ├── gateway/           # Main gateway server
│   └── core/             # Core library
└── public/               # Static assets
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Links

- 📚 [Documentation](https://docs.langdb.ai)
- ⭐ [GitHub](https://github.com/langdb/vllora)
- 💬 [Slack Community](https://join.slack.com/t/langdbcommunity/shared_invite/zt-2haf5kj6a-d7NX6TFJUPX45w~Ag4dzlg)
- 🐦 [Twitter](https://x.com/LangdbAi)
