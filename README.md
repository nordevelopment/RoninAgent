# ⚔️ RoninAgent — Open Source Autonomous AI Agent

[![GitHub Sponsors](https://img.shields.io/github/sponsors/nordevelopment?color=EA4AAA&style=flat-square)](https://github.com/sponsors/nordevelopment)
[![GitHub Stars](https://img.shields.io/github/stars/nordevelopment/RoninAgent?style=flat-square)](https://github.com/nordevelopment/RoninAgent/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/nordevelopment/RoninAgent?style=flat-square)](https://github.com/nordevelopment/RoninAgent/network/members)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/nordevelopment/RoninAgent?style=flat-square)](https://github.com/nordevelopment/RoninAgent/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

> ⭐ **Star Us on GitHub!**
> If you find RoninAgent useful or inspiring, please consider giving this repository a star! It helps the project grow and fuels future development. 🚀

> [!NOTE]
> **Rebranding Notice**: **RoninAgent** was formerly known as **OpenPAIAgent** (Open Personal AI Agent). Same lightning-fast, zero-bloat architecture — now with a stronger sovereign identity.

<a href="https://nordevelopment.github.io/RoninAgent">RoninAgent project page</a>

RoninAgent is a high-speed, zero-bloat open-source personal AI agent built for absolute privacy, local execution, and total autonomy. Designed as an ultra-lightweight alternative to resource-heavy frameworks, it drops complex abstractions like LangChain in favor of pure TypeScript performance, sub-second cold starts, and complete data sovereignty.

> [!TIP]
> **🌍 Built for markets Western agents can't read.** Out of the box RoninAgent understands **Wildberries**, **Ozon**, **List.am** (Armenia), **Temu** and **Amazon** — each skill carries that marketplace's real URL structure, price-sorting parameters and parsing rules, so the agent can actually pull and compare live listings. Trigger keywords are bilingual (`wildberries` / `вайлдберриз`, `ozon` / `озон`, `list.am` / `лист ам`), so you can ask in English or Russian.

---

## ⚡Features
*   **💬 Dual Interfaces**: A beautiful cyberpunk-themed Web UI + Remote chat access via a Telegram bot.
*   **🤖 Multi-Agent Hub**: Dedicated in-app **Agents Hub** manager to create, edit, switch, and delete custom AI agents. Easily tweak persona files (`Agent.md`, `Identity.md`, `User.md`, `Memory.md`) and tailor prompt instructions for each specialized agent.
*   **🧠 Modular System Prompt**: The agent's personality and instructions are compiled dynamically from simple Markdown files (`Agent.md`, `Identity.md`, `User.md`, `Memory.md`).
*   **⚡ Dynamic Agent Skills**: Save LLM context tokens by loading specialized prompt instructions conditionally. Shared skills live in `skills/*.md` (with optional agent-specific overrides in `agents/<agentId>/skills/*.md`). When a query matches header keywords (e.g., `Keywords: amazon, wildberries, temu, code`), instructions are dynamically injected into the system prompt. Comes with pre-built skills for:
    *   **🛒 Regional E-commerce & Local Search**: Marketplace-specific URL structures, price sorting, and parsing rules for **Wildberries**, **Ozon**, **List.am** (Armenia), **Temu**, and **Amazon** — with bilingual EN/RU trigger keywords.
    *   **💻 Software Engineering**: Refactoring, debugging, and strict code style instructions.
    *   **🎨 Content Writing & Design**: Copywriting, UI/UX guidelines, and image generation prompt optimization.
*   **👁️ AI Vision & Document Analysis**: Attach images or upload documents directly in the chat. Features auto-optimization for images via `sharp` and native parsing for documents (**PDF**, **Word**, **Excel**, **Text/CSV/JSON**).
*   **🔧 Powerful Tool Execution (Function Calling)**:
    *   **📄 Full File & Document Lifecycle (Read & Write)**: Full read, create, update, and deletion support for multiple document types within the dedicated local `workspace/` folder:
        *   **Read & Analyze**: Text/Markdown/Code/JSON/CSV, **PDF documents** (`.pdf`), **Word documents** (`.docx`, `.doc`), and **Excel spreadsheets** (`.xlsx`, `.xls` with multi-sheet inspection).
        *   **Generate & Create**: Generate structured **Excel spreadsheets** (`.xlsx`) with custom columns, row styling, and formulas; build styled **Word documents** (`.docx`) with headings and tables; render custom HTML/CSS into professional A4 **PDF documents**; and create/update **text/code files**.
    *   **Web Scraper**: Downloads pages, strips out bloated HTML, and cleans the text for real-time AI analysis. Supports both fast static scraping and dynamic rendering with automatic fallback for SPAs (like React, Vue, e-commerce sites).
    *   **Image Generation**: Generates images using **Together AI** or **X.AI (Grok)** APIs directly in the chat, with smart fallback logic (if one provider is not configured, it automatically uses the other).
*   **💾 Semantic Memory (SQLite + Vectors)**: Saves chat sessions and history using SQLite, with support for semantic vector search via the lightweight `sqlite-vec` extension.
*   **📋 Task Management & Scheduler**: Schedule automated background tasks or trigger them manually. Features an automatic background task runner (scans every 60s), real-time status tracking in the UI, and instant Telegram execution alerts.

---


## 🧠 Key Architectural Decisions

RoninAgent is built with a clear focus on lightweight, efficient, and transparent AI engineering:

* **Why No LangChain / LlamaIndex?**
  * **Complete State Control**: The agent's cognitive loop (think-act-evaluate) is written in vanilla TypeScript, ensuring complete control over LLM tool-calling and historical state.
  * **Sub-Second Boot**: The backend starts in **< 1 second** and consumes a minuscule **~50-100 MB of RAM**.
  * **Auditability**: Clean, readable code without nested abstractions makes debugging prompts and tools trivial.
* **Smart Hybrid RAG & Memory**:
  * Uses a local **SQLite database** combined with the lightweight **`sqlite-vec`** extension for vector embeddings.
  * Combines semantic vector similarity search with keyword fallback (`LIKE` queries), providing high-recall context retrieval with zero external database dependencies (no pgvector, Qdrant, or Pinecone required).

---

## 💡 What is this project for?
This project is designed for anyone who wants a personal AI assistant that can seamlessly process documents (read & create PDF, Word, Excel, and text files), browse the web, generate images, and communicate smoothly through a slick web interface or remotely on-the-go via a Telegram bot.

### 🔒 100% Self-Hosted & Private
RoninAgent runs entirely on your local machine or private server. All chat history, settings, and workspace documents are stored in a local SQLite database. Your private data never leaves your computer, and you retain absolute control over which external APIs (like OpenRouter or Together AI) are called.

### 🔓 Fully Open Source
Built with clean TypeScript and vanilla web technologies under the MIT license. No massive, opaque frameworks (like LangChain) or hidden tracking. You have full transparency, can easily audit the source code, and can freely modify or extend the agent's tools and behaviors.

---

## 🛠️ Tech Stack

*   **Backend**: Node.js, Fastify (faster and lighter than Express), TypeScript.
*   **Frontend**: EJS, Vanilla CSS (cyberpunk theme), Vanilla JS.
*   **Database**: `better-sqlite3` & `sqlite-vec` extension.
*   **Media & Document Processing**: `sharp` (images), `pdf-parse` (PDF reading), `mammoth` (Word reading), `exceljs` (Excel reading & generation), `docx` (Word generation).
*   **HTTP, Scraping & PDF Rendering**: `axios` + `cheerio` + `puppeteer` (headless Chrome for dynamic scraping and PDF generation).
*   **Telegram integration**: `telegraf`.

---

## ⚙️ Setup & Installation

### Prerequisites
*   Node.js (v20.x or later)
*   npm (v9.x or later)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/nordevelopment/RoninAgent
cd RoninAgent
npm install
```
*(Alternatively, you can download and extract the ZIP archive directly from GitHub).*

### 2. Configuration & Launch
Configuration can be set up beforehand via a `.env` file or configured interactively via the **Web Setup Wizard** on first launch.

```bash
# Start - Build & launch the server
npm start
```

Once started, open **`http://127.0.0.1:3000`** in your browser. If no configuration is detected, you will be automatically redirected to the setup wizard. You can also adjust settings later via the Settings page in the UI.

### 🛠️ For Developers
```bash
# Run the development server (with hot reloading)
npm run dev

# Recreate/reset the SQLite database schema
npm run db:reset

# Run build only
npm run build
```



## 🔒 Security

RoninAgent includes built-in security features to protect your server, files, and API balances when deployed remotely. **These security settings can be easily configured either during the first-launch setup wizard, or later at any time via the Web Settings Panel (`/settings` page in the UI).**

> [!WARNING]
> **Never expose port 3000 directly to the internet.** HTTP Basic Auth sends your password in plain text — over an unencrypted connection anyone on the path can read it. For remote access, put RoninAgent behind a TLS reverse proxy, or reach it over a private network (Tailscale / WireGuard).
>
> A complete `Caddyfile` — Caddy obtains and renews the certificate automatically:
>
> ```caddyfile
> agent.example.com {
>     reverse_proxy 127.0.0.1:3000
> }
> ```
>
> Keep `HOST=127.0.0.1` so only the proxy can reach the app, and set a strong `APP_PASSWORD`.

*   **HTTP Basic Auth**: Lock the Web UI and API endpoints behind a password. Set `APP_PASSWORD` (and optionally `APP_USER`) in your `.env` (or via Settings UI) to enable it. Leaving `APP_PASSWORD` empty disables authentication (ideal for local localhost use); if you do that while binding to a non-loopback `HOST`, a warning is logged at startup.
*   **Brute-Force Protection**: Credentials are compared in constant time, and **5 failed attempts** from the same IP lock that IP out for 60 seconds (`429` with a `Retry-After` header). Only *failures* are counted, so a legitimate session is never throttled.
*   **Telegram Bot Whitelist**: Restrict access to your Telegram bot. Set `ALLOWED_TELEGRAM_USER_IDS` in your `.env` (or via Settings UI) with a comma-separated list of Telegram User IDs to prevent unauthorized users from using your bot and API balances.
*   **Strict Path Validation**: All AI file operations (read, write, delete) are strictly validated using `path.relative` comparison to ensure the AI cannot escape or access files outside the designated `workspace/` folder.
*   **Safe Agent Directory Routing**: Directory operations on agent profiles (like editing files) sanitize all incoming IDs to prevent Path Traversal outside the `agents/` folder.
*   **Secure Cookies & Sessions**: Session IDs are generated using Node's cryptographically secure `crypto.randomUUID()` and session cookies are protected with `sameSite: 'lax'` and conditional `secure` flags.

---

## 🚀 Video Install & Features Demo
https://www.youtube.com/watch?v=rcRkP_UiDRo

## 📸 Screenshots
<img width="1516" height="916" alt="Image" src="https://github.com/user-attachments/assets/bf8ba19e-c3ba-49ca-b813-4e68f3c9ef11" />

<img width="1508" height="925" alt="Image" src="https://github.com/user-attachments/assets/52193bb6-4492-4e95-a0cb-5c059f191b8b" />

<img width="1361" height="911" alt="Image" src="https://github.com/user-attachments/assets/cbdcec8a-f5a7-40c3-8455-dadbad699310" />

<img width="1491" height="736" alt="Image" src="https://github.com/user-attachments/assets/5c351b63-37e8-457d-b420-46b8c155e9a4" />

---

## ⚖️ Comparison: RoninAgent vs. Heavyweight Alternatives

While other self-hosted AI interfaces require heavy setups (Docker, multi-container databases, etc.), **RoninAgent** is optimized for raw local performance and resource conservation:

* **RAM Footprint**: **~50-100 MB** (compared to 1.5 GB+ for Open WebUI or 1 GB+ for LibreChat).
* **Startup Time**: **Sub-second (< 1s)** (compared to 30-60s boot times for Docker-based alternatives).
* **Dependencies**: **Zero**. Runs natively with just Node.js and npm.
* **Database**: Embedded SQLite. Supports semantic vector search directly via the loaded `sqlite-vec` library extension.
* **Ideal For**: Private on-the-go AI assistance, local file manipulation, and fast scraping workflows.

---

### Author: Norayr Petrosyan

---

## 💖 Support the Project

If this project saved your RAM and made your local AI workflow smoother, consider supporting its development:

*   **GitHub Sponsors**: [Sponsor nordevelopment](https://github.com/sponsors/nordevelopment)

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).