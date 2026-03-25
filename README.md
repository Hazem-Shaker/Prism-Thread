# PrismThread

**PrismThread** is a full-stack AI chat workspace: pick from several language models, attach images and documents, generate images with FLUX, dictate with speech-to-text, and listen with the browser’s text-to-speech—while **MongoDB** keeps your conversations.

Built with **Express**, **TypeScript**, and a static single-page UI served from `public/`.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [REST API](#rest-api)
- [Model capabilities](#model-capabilities)
- [Image generation (Hugging Face)](#image-generation-hugging-face)
- [Project structure](#project-structure)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

| Area | What you get |
|------|----------------|
| **Multi-model chat** | Switch models per conversation: Google Gemini, Groq, OpenRouter (see [Model capabilities](#model-capabilities)). |
| **Vision** | Send images with your message when using a model that supports **vision** (Gemini). |
| **File upload** | Attach **images** (JPEG, PNG, GIF, WebP), **PDFs** (text extracted server-side), or **text-like files** (`.txt`, `.md`, `.csv`, `.json`, etc.). |
| **Image generation** | With the Hugging Face FLUX model selected, generate images from a prompt; results are stored under `public/generated/` and shown in the thread. |
| **Speech-to-text** | Record from the mic; audio is sent to **Groq Whisper** and the transcript is inserted into the composer. |
| **Read aloud** | Use the browser **Speech Synthesis** API on assistant messages. |
| **Persistence** | Conversations and messages are stored in **MongoDB** (Mongoose). |
| **Auto titles** | New threads can get a short title derived from the first exchange (uses an available chat model). |

---

## Architecture

```
Browser (SPA in public/)  ──HTTP JSON / multipart──►  Express API
                                                          │
                    ┌─────────────────────────────────────┼─────────────────────────────────────┐
                    ▼                                     ▼                                     ▼
              MongoDB                              External LLM APIs                    File / audio handling
         (conversations)                    (Gemini, Groq, OpenRouter, HF)              (multer, pdf-parse, Groq STT)
```

- **Frontend**: vanilla HTML/CSS/JS in `public/` (no separate build step for the UI).
- **Backend**: modular routes under `src/modules/` (`chat`, `upload`, `stt`, `ai`).

---

## Requirements

- **Node.js** 18 or newer (global `fetch` and modern APIs).
- **MongoDB** reachable via connection string (local or Atlas).

---

## Getting started

1. **Clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
   cd YOUR_REPO
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   Copy the example below into a file named `.env` in the project root (see [Environment variables](#environment-variables) for details).

4. **Run MongoDB** (if local)

   Ensure `MONGODB_URI` points at a running instance, e.g. `mongodb://localhost:27017/prismthread`.

5. **Start in development**

   ```bash
   npm run dev
   ```

6. **Open the app**

   Visit [http://localhost:3000](http://localhost:3000) (or whatever you set for `PORT`).

### Production build

```bash
npm run build
npm start
```

The server runs `node dist/server.js` and serves the API plus static files from `public/`.

---

## Environment variables

Create a `.env` file in the project root. **Do not commit it** (it is listed in `.gitignore`).

| Variable | Required for | Description |
|----------|----------------|-------------|
| `MONGODB_URI` | App | MongoDB connection string. Default in code: `mongodb://localhost:27017/gemini-chat` if unset. |
| `PORT` | Optional | HTTP port. Default: `3000`. |
| `GEMINI_API_KEY` | Gemini models | [Google AI Studio / Cloud](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` | Groq chat + STT | [Groq Console](https://console.groq.com/keys) |
| `OPENROUTER_API_KEY` | OpenRouter models | [OpenRouter](https://openrouter.ai/keys) |
| `HUGGINGFACE_API_KEY` or `HF_TOKEN` | FLUX image generation | [Hugging Face token](https://huggingface.co/settings/tokens) with Inference Providers access where applicable |
| `FAL_API_KEY` | Optional fallback | [Fal dashboard](https://fal.ai/dashboard) if Hugging Face–routed Fal auth fails |
| `TOGETHER_API_KEY` | Reserved | Present in config for possible future use; not required by the current catalog |

Tokens are **trimmed** and **surrounding quotes** are stripped when read, so `KEY="value"` in `.env` still works.

### Minimal `.env` example (no secrets)

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/prismthread

GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
HUGGINGFACE_API_KEY=
# FAL_API_KEY=
```

Fill in only the keys for the providers you use. The UI lists models and marks which are **available** based on configured keys (`GET /api/models`).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development: `nodemon` + `ts-node` on `src/server.ts` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/server.js` |

---

## REST API

Base URL: same origin as the app (e.g. `http://localhost:3000`).

### Models

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/models` | List models with `id`, `name`, `provider`, `available`, `capabilities`. |

### Conversations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/conversations` | List conversations. |
| `POST` | `/api/conversations` | Create an empty conversation. |
| `GET` | `/api/conversations/:id` | Get one conversation with messages. |
| `DELETE` | `/api/conversations/:id` | Delete a conversation. |
| `POST` | `/api/conversations/:id/messages` | Send a message. Body: `{ "message": string, "model": string, "attachments"?: ... }`. |

### Upload

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | `multipart/form-data` with field **`file`**. Max size **50 MB**. Returns JSON: image (`type: "image"`, `data` base64) or extracted text (`type: "file"`, `data` string). |

### Speech-to-text

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/transcribe` | `multipart/form-data` with field **`audio`**. Requires `GROQ_API_KEY`. Returns `{ "text": string }`. |

### Image generation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/image/generate` | Body: `{ "prompt": string, "conversationId": string }`. Requires Hugging Face token (and accepted model license). Saves PNG under `public/generated/` and appends a message to the conversation. |

---

## Model capabilities

Capabilities are exposed on each entry from `GET /api/models`.

| Model id | Provider | Capabilities |
|----------|----------|----------------|
| `gemini-flash` | Google | `chat`, `vision`, `file` |
| `qwen3-32b` | Groq | `chat`, `file` |
| `step-3.5-flash-free` | OpenRouter | `chat`, `file` |
| `black-forest-labs-FLUX-1-dev` | Hugging Face | `imageGen` |

The frontend uses capabilities to warn when, for example, images are attached without a vision-capable model.

---

## Image generation (Hugging Face)

- Open weights on the Hub are **not** the same as unlimited free hosted inference. FLUX runs through **Hugging Face Inference Providers** (often with quotas or billing).
- Accept the model license on [black-forest-labs/FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev) if prompted.
- Use a token that can call **Inference Providers**, and configure [Inference Provider order](https://huggingface.co/settings/inference-providers) if needed.
- This project tries the **HF router** endpoint for Fal FLUX dev first, then falls back to `@huggingface/inference` with `fal-ai`. If you see auth errors, you can set **`FAL_API_KEY`** for a direct Fal retry.

Generated files live in `public/generated/`; that folder is **gitignored**.

---

## Project structure

```
├── public/                 # Static SPA (HTML, CSS, JS) + generated images at public/generated/
├── src/
│   ├── app.ts              # Express app, routes, static middleware
│   ├── server.ts           # Entry: DB connect + listen
│   ├── config/             # env, database
│   └── modules/
│       ├── ai/             # Model catalog, providers (Gemini, Groq, OpenRouter), types
│       ├── chat/           # Conversations API, image endpoint wiring
│       ├── stt/            # Groq Whisper transcription
│       └── upload/         # Multipart upload, PDF/text extraction
├── package.json
├── tsconfig.json
└── README.md
```

---

## Security notes

- **Never commit `.env`** or real API keys. Rotate keys if they are ever exposed.
- Prefer **fine-grained** Hugging Face tokens with the minimum scopes you need.
- Run behind HTTPS in production; treat uploaded files as untrusted user content.

---

## Troubleshooting

| Issue | Ideas |
|-------|--------|
| `EADDRINUSE` on port 3000 | Change `PORT` in `.env` or stop the other process using that port. |
| Mongo connection errors | Check `MONGODB_URI`, network, and Atlas IP allowlist if applicable. |
| Image generation / HF errors | Confirm token, Inference Providers permission, model license, optional `FAL_API_KEY`. |
| STT fails | Ensure `GROQ_API_KEY` is set and the form field name is **`audio`**. |
| Large payloads | JSON body limit is **20 MB** in `app.ts`; uploads use separate limits (50 MB file, 25 MB audio). |

---

## License

No license file is bundled by default. Add a `LICENSE` file (for example **MIT**) when you publish if you want others to know how they may use the code.

---

**PrismThread** — one thread, many models.
