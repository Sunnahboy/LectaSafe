# LectaSafe
A local-first, fail-safe audio transcription and AI-summarization ecosystem for students.
```
LectaSafe/
│
├── .github/workflows/
│   └── deploy.yml             # Automates compilation of WASM and deployment of static UI to edge CDNs
│
├── .cargo/                    # Global Cargo configurations
│   └── config.toml            # Enforces target = "wasm32-unknown-unknown" and target-feature=+atomics
│
├── .vscode/                   # Integrated Development Environment configuration
│   ├── settings.json          # Configures rust-analyzer project links and auto-formatting
│   └── extensions.json        # Recommends mandatory team development extensions
│
├── package.json               # Root monorepo workspace configurations and global script runners
│
├── packages/                  # Workspace boundaries for clean separation of concerns
│
│   ├── chrome-extension/      # The browser native runtime boundary (Manifest V3)
│   │   ├── manifest.json      # Configured with permissions: 'tabCapture', 'storage', 'offscreen'
│   │   ├── background.ts      # Extension lifecycle; manages lifecycle of the Offscreen Document
│   │   ├── popup/             # Lightweight quick-action toolbar interface
│   │   │   ├── index.html
│   │   │   └── popup.ts
│   │   └── offscreen/         # High-priority hidden canvas/audio engine
│   │       ├── offscreen.html
│   │       ├── offscreen.ts   # Instantiates AudioContext and WebAudio capture
│   │       └── audio-worklet.ts # Low-level PCM audio downsampling worker (runs on native audio thread)
│   │
│   ├── local-kernel/          # Core computational engines compiled to the browser via wasm-pack
│   │   ├── Cargo.toml         # Configured with crate-type = ["cdylib"] for WASM targets
│   │   └── src/
│   │       ├── lib.rs         # WASM interface entry point using wasm-bindgen
│   │       ├── graph/         # Algorithmic graph merger and deterministic layout engines
│   │       │   ├── merger.rs  # MapReduce-style local JSON graph stitching
│   │       │   └── layout.rs  # Graph layout generation pass
│   │       └── utils/
│   │           └── grammar.rs # Constraints to enforce valid JSON generation inside client LLMs
│   │
│   └── react-dashboard/       # The immersive interactive user workspace
│       ├── public/            # Static assets
│       │   └── models/        # Symlinks or configurations for downloading model weights dynamically
│       ├── src/
│       │   ├── api/           # Client abstractions for local hardware boundaries
│       │   │   ├── dexie-db.ts # IndexedDB structural schema initialization and schema migrations
│       │   │   ├── webgpu.ts  # Hardware capabilities profiling and tier allocation runtime
│       │   │   └── models.ts  # Fetching/caching layer interacting with Hugging Face edge CDN
│       │   ├── components/
│       │   │   ├── Dashboard.tsx    # Bento-box layout container
│       │   │   ├── CanvasGraph.tsx  # React Flow interactive mind map node system
│       │   │   ├── EditorNotes.tsx  # Extracted structured Markdown editor component
│       │   │   └── DeviceTierViewer.tsx # Status component showing VRAM/hardware efficiency diagnostics
│       │   ├── workers/       # Off-main-thread heavy computational units
│       │   │   ├── whisper.worker.ts # Drives local transcription via whisper.cpp WASM
│       │   │   └─- reasoning.worker.ts # Drives Local Phi-3.5 or Gemini Nano inference
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json       # Manages React Flow, Dexie, and Transformers.js dependencies
│       └── vite.config.ts     # Configured for multi-entry compiling, custom WASM, and COOP/COEP headers
│
├── docs/
│   ├── ARCHITECTURE_WALKTHROUGH.md # Explains local thread messaging topology
│   └── DATABASE_MIGRATIONS.md       # Strategies for client-side IndexedDB updates
│
└── README.md
