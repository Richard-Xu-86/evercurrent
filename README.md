# EverCurrent — Daily Digest Tool
### Prototype · Hardware Engineering Teams

---

## Overview

A Daily Digest Tool that surfaces the most relevant information for each role on a robotics hardware engineering team — and adapts as the project progresses through phases.

**The core insight:** Personalization isn't filtering. It's *reframing*. The same Slack message about a 10-week motor controller lead time should surface as a #1 blocker for Supply Chain, a watch item for the Mechanical Engineer, and a schedule risk requiring a decision from the Engineering Manager.

---

## Running the prototype

### Prerequisites
- Node.js 18+
- An Anthropic API key ([get one here](https://console.anthropic.com))

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Start the server
npm start
# → http://localhost:3000
```

The API key can also be entered directly in the top-right of the UI — useful for demos without touching the .env file.

---

## Project structure

```
evercurrent/
├── backend/
│   ├── server.js               # Express entry point + route mounting
│   ├── routes/
│   │   ├── digest.js           # POST /api/digest — AI digest generation
│   │   ├── messages.js         # GET/POST /api/messages — Slack feed simulation
│   │   └── meta.js             # GET /api/personas, /api/phases
│   ├── services/
│   │   └── digestService.js    # Core AI service — calls Claude API
│   └── data/
│       ├── slackMessages.js    # Simulated Slack message store
│       ├── personas.js         # Role definitions + AI prompt context
│       └── phases.js           # Project phases + temporal context
├── frontend/
│   ├── index.html              # Main UI
│   ├── css/styles.css          # Styles
│   └── js/
│       ├── app.js              # Application controller
│       ├── ui.js               # DOM rendering functions
│       └── api.js              # Backend API client
├── .env.example
└── README.md
```

---

## Architecture

```
Slack (simulated)
    │
    ▼
POST /api/messages           ← In production: Slack Events API webhook
    │
    ▼
slackMessages.js             ← In production: DB or message queue (Redis/SQS)
    │
    ▼
POST /api/digest             ← Triggered by cron job, webhook event, or user request
    │
    ▼
digestService.js             ← Calls Claude API with persona + phase context
    │
    ▼
Structured digest JSON       ← Returned to frontend, rendered per persona
```

### How the Slack integration would work in production

The current `slackMessages.js` data layer mirrors the shape of real Slack API payloads. Connecting to real Slack requires:

1. **Create a Slack App** at api.slack.com with `channels:history` and `channels:read` OAuth scopes
2. **Subscribe to Events** — `message.channels` fires a POST to your server on every new message
3. **Replace the mock store** with a database (Postgres, MongoDB) or message queue (Redis, SQS)
4. **Schedule digest generation** — a cron job fires `generateAllDigests()` each morning per user timezone

The `digestService.js` and all route logic stay identical. Only the ingestion layer changes.

---

## Key design decisions

### 1. Role context in the AI prompt
Each persona has a detailed role description injected into the system prompt. This isn't just filtering messages — it's telling Claude *what this person cares about* and *what they don't need to know*. The Engineering Manager never sees raw torque values; the Mechanical Engineer never sees procurement financials.

### 2. Phase-adaptive prioritization
The project phase is injected as context that reshapes prioritization. A test failure in Design phase is a concern. In Bring-up phase, it's a blocker. In Manufacturing, it's a critical escalation. The same AI service handles all three — only the phase context changes.

### 3. Explainability layer
Every digest item has a "flagged/surfaced because" tag. This makes the AI reasoning transparent and builds trust with the team — they understand why they're seeing each item, not just what it is.

### 4. Cross-team signal
Each card surfaces one cross-team dependency — activity in another team's lane that affects this person. This addresses the core alignment problem: keeping distributed specialists aware of dependencies without burying them in irrelevant channels.

### 5. Parallel generation
All three digests are generated simultaneously via `Promise.allSettled()`. One slow API call doesn't block the others. If one persona's generation fails, the other two still render.

---

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/messages` | Get all messages in the feed |
| `POST` | `/api/messages` | Add a custom message |
| `POST` | `/api/messages/preset` | Inject a preset scenario (`supply`, `test`, `task`, `design`) |
| `POST` | `/api/messages/reset` | Reset feed to seed data |
| `POST` | `/api/digest` | Generate digests for one or more personas |
| `POST` | `/api/digest/single` | Generate a digest for a single persona |
| `GET`  | `/api/personas` | Get persona metadata |
| `GET`  | `/api/phases` | Get phase metadata |

---

## What would be next

In a production version of this tool:

- **Real Slack ingestion** via the Events API, with channel filtering per team
- **User accounts** — each team member logs in and sees their own digest
- **Digest delivery** — Slack DM or email delivery at a scheduled time, not just a web UI
- **Feedback loop** — team members mark items as "resolved" or "not relevant", which improves future prioritization
- **Project graph** — connecting the digest to the broader EverCurrent project graph (CAD changes, BOM versions, task assignments) for richer context
- **Multi-project support** — one team member may span multiple projects, each with its own phase

---

*Built for EverCurrent take-home · April 2026*



 How to get a bot token:
 *   1. api.slack.com → Create an App → From scratch
 *   2. OAuth & Permissions → Bot Token Scopes → add scopes above
 *   3. Install to Workspace → copy the Bot OAuth Token (xoxb-...)
 *   4. Invite the bot to channels: /invite @YourApp in each channel
 *   5. Paste token into .env as SLACK_BOT_TOKEN
