# ⚔️ RoninAgent — Open Source Autonomous AI Agent

[![GitHub Sponsors](https://img.shields.io/github/sponsors/nordevelopment?color=EA4AAA&style=flat-square)](https://github.com/sponsors/nordevelopment)
[![GitHub Stars](https://img.shields.io/github/stars/nordevelopment/RoninAgent?style=flat-square)](https://github.com/nordevelopment/RoninAgent/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/nordevelopment/RoninAgent?style=flat-square)](https://github.com/nordevelopment/RoninAgent/network/members)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/nordevelopment/RoninAgent?style=flat-square)](https://github.com/nordevelopment/RoninAgent/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

## What is RoninAgent?

**RoninAgent** is a high-speed, zero-bloat, open-source personal AI agent engineered for **local autonomy**, deep document processing, and web intelligence. Designed as a lean, production-grade alternative to resource-heavy AI frameworks, it delivers pure TypeScript performance, near-instant server startup (1-2s), and 100% local storage with zero telemetry.

Whether reading complex spreadsheets, generating formatted Word and PDF reports, scraping dynamic JavaScript web apps, or running scheduled background tasks, RoninAgent handles the entire lifecycle locally — accessible via a reactive **Dark and Light Web UI** or remotely through **Telegram**.

---

> ⭐ **Star Us on GitHub!**
> If you find RoninAgent useful or inspiring, please consider giving this repository a star! It helps the project grow and fuels future development. 🚀

---


🌐 **[Live Project Page & Documentation](https://nordevelopment.github.io/RoninAgent)**

> [!TIP]
> **Built-in Regional E-Commerce Intelligence**: Out of the box, RoninAgent understands **Wildberries**, **Ozon**, **List.am** (Armenia), **Temu**, and **Amazon**. Each skill embeds the marketplace's actual URL schema, price filters, and scraping logic to extract and compare live listings. Skills trigger automatically via bilingual keywords (`wildberries`, `ozon`, `list.am`, `temu`, `amazon`), supporting both English and Russian queries seamlessly.

---

## ⚡ Features

### 🖥️ Dual Reactive Interfaces
* **Modern Web UI (Dark & Light Modes)** — Built with Vue 3 and Vite. Features dual handcrafted themes (**Deep Ocean** and **Clean Light**), streaming SSE responses, real-time tool execution status, Markdown formatting, and direct drag-and-drop file and image uploads.
* **Remote Telegram Bot** — Full two-way chat control on the go, equipped with Telegram user ID whitelisting and instant execution alerts for automated tasks.
* **Agents Hub** — Dedicated in-app workspace to create, configure, switch, and delete specialized AI personas with custom system prompts and dedicated skills.

### 📄 Complete Document Lifecycle (Read & Write)
* **Universal Document Reader** — Native, local parsing without external cloud dependencies: **PDF** (`.pdf`), **Word** (`.docx`, `.doc`), **Excel** (`.xlsx`, `.xls` with multi-sheet inspection), CSV, JSON, Markdown, and source code.
* **Autonomous Document Generator** — Generates publication-ready **Excel sheets** (custom styles, formulas, and multi-column layouts), styled **Word documents**, and pixel-perfect A4 **PDFs** (rendered via headless Chrome).
* **AI Vision & Optimization** — Multi-modal image analysis with automatic compression and resizing via `sharp` to minimize LLM token consumption.

### 🌐 Web Scraping & Market Intelligence
* **Hybrid Web Scraper** — Dual-engine architecture: ultra-fast static HTML extraction (`cheerio`) with automatic fallback to headless Chromium (`puppeteer`) for JavaScript-rendered SPAs (React, Vue, marketplaces).
* **Out-of-the-Box Marketplace Skills** — Pre-tuned query schemas and parsing rules for **Amazon**, **Wildberries**, **Ozon**, **Temu**, and **List.am** (Armenia), triggered by bilingual EN/RU keywords.

### 🧠 Dynamic Modular Prompts & Memory
* **Token-Efficient Dynamic Skills** — Injects specialized domain instructions (coding, market research, copywriting) on-the-fly only when relevant keywords appear in the user's prompt, saving thousands of context tokens.
* **Modular Markdown Persona** — System prompts dynamically compile from transparent Markdown files (`Agent.md`, `Identity.md`, `User.md`, `Memory.md`).
* **Hybrid Semantic Vector Memory** — Persistent conversation history stored in local SQLite, powered by `sqlite-vec` for embeddings with high-recall fallback (`LIKE` queries) — zero external vector database required.

### ⚙️ Automation, Tools & Security
* **Background Task Scheduler** — Autonomous cron engine (evaluates every 60s) for scheduled workflows, complete with UI status indicators and Telegram push alerts.
* **Multi-Provider Image Generation** — Text-to-image synthesis using Together AI or xAI (Grok), with automatic failover between configured providers.
* **Hardened Local Sandbox** — Strict path containment (`workspace/` boundary validation), constant-time credential comparison, brute-force IP rate limiting, and optional HTTP Basic Auth.

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
*   **Frontend**: Vue 3, Vite, TypeScript, Pinia, Vanilla CSS (Dark & Light themes).
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
# Start the server (auto-builds on first run, sub-second launch thereafter)
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
<img width="1551" height="949" alt="Image" src="https://github.com/user-attachments/assets/df88f8b4-8dde-458d-8459-30d42861a2e5" />

<img width="1562" height="948" alt="Image" src="https://github.com/user-attachments/assets/0ad13406-844b-4bd0-86a6-38d4825e94a1" />

<img width="1543" height="950" alt="Image" src="https://github.com/user-attachments/assets/5a757879-87b8-4562-8048-8ead2b29caac" />

<img width="1552" height="955" alt="Image" src="https://github.com/user-attachments/assets/ea03ae6b-7394-4e57-9a34-b2e3a7d0cfd1" />

---

## ⚖️ Comparison: RoninAgent vs. Heavyweight Alternatives

While other self-hosted AI interfaces require heavy setups (Docker, multi-container databases, etc.), **RoninAgent** is optimized for raw local performance and resource conservation:

* **RAM Footprint**: **~50-100 MB** (compared to 1.5 GB+ for Open WebUI or 1 GB+ for LibreChat).
* **Startup Time**: **Sub-second (< 1s)** (compared to 30-60s boot times for Docker-based alternatives).
* **Dependencies**: **Zero**. Runs natively with just Node.js and npm.
* **Database**: Embedded SQLite. Supports semantic vector search directly via the loaded `sqlite-vec` library extension.
* **Ideal For**: Private on-the-go AI assistance, local file manipulation, and fast scraping workflows.

---

## 💖 Support the Project

If this project saved your RAM and made your local AI workflow smoother, consider supporting its development:

*   **GitHub Sponsors**: [Sponsor nordevelopment](https://github.com/sponsors/nordevelopment)

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).