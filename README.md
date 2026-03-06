# LectaSafe
A local-first, fail-safe audio transcription and AI-summarization ecosystem for students.

LectaSafe/
│
├── .github/                  # GitHub Actions workflows
│   └── workflows/
│       └── deploy.yml         # CI/CD pipeline
│
├── chrome-extension/          # Chrome extension for recording
│   ├── manifest.json          # Extension manifest
│   ├── background.js          # Background script
│   ├── offscreen.html         # Offscreen document for recording
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic
│   └── styles.css             # Popup styles
│
├── rust-api/                  # Rust API (Axum + Supabase)
│   ├── Cargo.toml              # Rust dependencies
│   ├── src/
│   │   ├── main.rs             # API entry point
│   │   ├── routes/             # API routes
│   │   │   ├── transcribe.rs   # Transcription logic
│   │   │   ├── summarize.rs    # Summarization logic
│   │   │   └── vault.rs        # Lecture history logic
│   │   ├── models/              # Data models
│   │   │   └── lecture.rs      # Lecture structs
│   │   └── utils/               # Utility functions
│   │       └── llama.rs         # Custom LLM bindings
│   └── Dockerfile              # Docker config for API
│
├── react-dashboard/           # React frontend (Bento Box UI)
│   ├── public/                # Static files
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── Dashboard.tsx   # Main dashboard
│   │   │   ├── LectureView.tsx # Split-view for transcripts/notes
│   │   │   └── RecordingControls.tsx # Recording UI
│   │   ├── api.ts              # API client
│   │   ├── App.tsx             # Root component
│   │   └── index.css           # Tailwind CSS
│   ├── package.json            # Node dependencies
│   ├── tailwind.config.js      # Tailwind config
│   └── Dockerfile              # Docker config for frontend
│
├── docs/                       # Documentation
│   ├── API_CONTRACT.md         # API endpoints and examples
│   ├── SETUP_GUIDE.md          # How to set up the project
│   └── DEPLOYMENT.md           # How to deploy
│
└── README.md                   # Project overview and instructions

