---
name: senior-web-ui-ux
description: World-class Senior Web UI/UX Design & Architecture standards. Use for crafting premium, state-of-the-art Dark and Light SaaS web applications, design systems, Linear/Raycast/Vercel/ChatGPT-grade aesthetics, micro-interactions, typography, and modern Vue/React frontend architectures.
---

# Senior Web App UI/UX Designer & Architect Skill

This skill defines the definitive design system, UX patterns, visual standards, and frontend architecture required to create **10/10 tier** web applications (on par with Linear, Raycast, Claude 3.5, Cursor, and Vercel).

---

## 1. Core Visual Architecture: The Modern Dark SaaS Aesthetic

A tier-one modern application never feels like a 1990s retro cyber-terminal with neon borders or glowing scanlines. It is a clean, hyper-refined, high-density, tactile productivity surface.

### A. Surface Palette & Depth (Atmospheric Slate)
- **Canvas / Root Background**: Deep obsidian slate `#090d16` with a subtle radial gradient `radial-gradient(circle at 50% 0%, #151d30 0%, #090d16 85%)`. Never use pitch black `#000000` — it causes eye fatigue and creates harsh contrast jumps.
- **Surface Panels (Sidebar, Header, Dock)**: Translucent dark slate `rgba(15, 23, 42, 0.78)` with `backdrop-filter: blur(20px)`.
- **Elevated Cards & Containers**: `#141e33` / `#182238`.
- **Active / Hover State**: `rgba(255, 255, 255, 0.04)` to `rgba(255, 255, 255, 0.08)`.
- **Light Theme Complement**: Canvas `#f8fafc`, Surface `#ffffff`, Cards `#ffffff` with 1px border `rgba(0, 0, 0, 0.08)`, Text `#0f172a`.

### B. The Law of Borders & Inset Lighting
- **Never use 2px solid neon borders** (no raw `#00f0ff` or `#ff0055` outlines).
- **Subtle 1px Borders**: Use `rgba(148, 163, 184, 0.12)` on dark backgrounds and `rgba(0, 0, 0, 0.08)` on light backgrounds.
- **Top Inset Highlight**: Give elevated cards and buttons a subtle top light reflection:
  ```css
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 20px -2px rgba(0, 0, 0, 0.4);
  ```

### C. Color Restraint (60-30-10 Rule)
- **60% Base / Surfaces**: Neutral slate, graphite, and charcoal.
- **30% Secondary Elements**: Borders, subtle muted text (`#94a3b8`), neutral badges.
- **10% Accent Intent**:
  - **Primary Action**: Royal Indigo (`#6366f1` / `#4f46e5`)
  - **Live / Active State**: Electric Teal / Sky (`#06b6d4` / `#38bdf8`)
  - **Success**: Emerald (`#10b981`)
  - **Warning / Thinking**: Amber (`#f59e0b`)
  - **Destructive**: Rose (`#f43f5e`)

---

## 2. Typography & Information Hierarchy

### A. Font Pairing
- **UI / Body / Headings**: Google Fonts **Inter** or **Geist** (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`).
- **Code / Metrics / IDs**: **JetBrains Mono** or **Fira Code** (`ui-monospace, monospace`).

### B. Casing & Visual Hierarchy
- **Ban on Shouting Caps**: Never use `text-transform: uppercase` on ordinary labels, buttons, or message headers (e.g. write `Task Manager`, not `TASK MANAGER`; `Ronin Agent`, not `🤖 RONIN AGENT`).
- **Hierarchy Scale**:
  - `Display / Page Header`: 18px – 22px, Weight 800, Letter spacing `-0.02em`
  - `Card / Section Header`: 14px – 15px, Weight 700, Color `#f8fafc`
  - `Body / Conversation`: 14px, Line height `1.6`, Color `#cbd5e1`
  - `Control / Button Text`: 13px, Weight 600
  - `Metadata / Chips / Timestamps`: 11px – 12px, Weight 500, Color `#8493a8`

---

## 3. Conversational AI / Agent Chat Architecture

### A. Message Bubbles
- **User Message**:
  - Compact right-aligned bubble.
  - Geometry: `border-radius: 16px 16px 4px 16px`.
  - Palette: Subtle indigo-slate gradient `linear-gradient(135deg, #3730a3 0%, #4338ca 100%)` with top light reflection.
  - Avatar / Header: Discreet avatar or clean alignment without redundant uppercase labels.
- **Agent Message**:
  - Open conversational stream (like Claude 3.5 / ChatGPT) or elevated card with `border-left: 3px solid var(--accent-cyan)`.
  - Rich Markdown support (headers, lists, tables, blockquotes).
  - Code Blocks: Embedded header showing language tag and a one-click copy button, deep background `#090e1a`, syntax-ready styling.
- **Neural Reasoning Trace (Thinking State)**:
  - Collapsible accordion with subtle amber/indigo glow.
  - Summary row: `🧠 Thinking Process (click to expand)`.
  - Content: Muted monospaced or structured steps.
- **System / Tool Execution Cards**:
  - Discreet tool card showing tool name, status pill (`Running`, `Success`, `Error`), and expandable output logs.

### B. Floating Integrated Input Bar
- Never place disconnected raw textarea and separate distant buttons.
- Create an integrated, floating dock (`max-width: 860px` centered or bottom-anchored):
  - Multi-line auto-expanding textarea (`min-height: 48px`, `max-height: 180px`).
  - Action tray nested inside the dock: Attachment paperclip icon button on left/right, and a sleek circular/pill Send button with arrow icon.
  - Focus state: Subtle ambient indigo glow `box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25)`.

---

## 4. Sidebar & Navigation Blueprint

- **Brand Panel**: Minimalist logo with energetic icon and live pulsing green status dot.
- **Primary CTA**: Single prominent `+ New Chat` button (Indigo gradient, bold, sleek).
- **Navigation Links**: Vertical list with clean SVG icons (Chat, Agents Hub, Tasks, Workspace), `border-radius: 8px`, hover background `rgba(255, 255, 255, 0.05)`, and a clean active indicator.
- **Session History List**:
  - Truncated text with ellipsis.
  - Active session: Elevated slate pill with left accent glow.
  - Hover actions: Quick rename (✏️) and delete (🗑) buttons that fade in smoothly on hover.
- **Footer**: Grouped secondary settings, memory purge, and widget container.

---

## 5. Dashboards, Hubs & Data Presentation

### A. Overview Metrics Bar
- Top dashboard strip with summary counters (e.g. Total Tasks, In Progress, Completed, Failed) in clean elevated cards with colored indicator dots.

### B. Cards vs Grids
- Agents Hub: Grid of modern cards (`minmax(280px, 1fr)`) with glowing avatar badge, capability chips, short description, and secondary action group (`Chat`, `Edit`, `Delete`).

### C. Status Badges & Live States
- Use rounded pills (`border-radius: 9999px`, padding `3px 10px`, font size `11px`, font weight `600`):
  - **Ready**: Muted indigo background with indigo text.
  - **Running**: Soft amber background with amber text and an organic breathing pulse dot.
  - **Done**: Emerald background with emerald text.
  - **Failed**: Rose background with rose text.

---

## 6. Forms & Modal Dialogs

- **Modal Backdrop**: `rgba(4, 7, 13, 0.75)` with `backdrop-filter: blur(12px)`.
- **Modal Window**: Rounded 16px, background `#0f172a`, top inset light, clean header with title and close `✕` icon.
- **Form Inputs**:
  - Always use dark background (`#090d16` / `#141e33`) on dark theme. **NEVER use bright white input backgrounds inside dark modals.**
  - Text color: `#f8fafc` with subtle `#475569` placeholder.
  - Focus Ring: `0 0 0 3px rgba(99, 102, 241, 0.25)`.
  - Actions: Primary confirmation button (Indigo) and secondary cancel button (Ghost/Slate).

---

## 7. Micro-Interactions & Animation Tokens

- **Hover Transitions**: `transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);`
- **Button Press (Tactile Feedback)**: `:active { transform: scale(0.98); }`
- **Modal Entry**: `transform: scale(0.96); opacity: 0;` -> `transform: scale(1); opacity: 1;` (duration `0.22s`)
- **Pulsing Indicator**:
  ```css
  @keyframes status-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.85); }
  }
  ```
- **Custom Scrollbars**: Width `6px`, thumb `#334155`, hover `#475569`, border-radius `9999px`.

---

## 8. Anti-Patterns to Strictly Avoid (The "Hall of Shame")

1. ❌ **Rainbow Button Outlines**: Never make one button neon cyan, one neon pink, one neon green, and one neon yellow in the same sidebar.
2. ❌ **Monospace Everything**: Monospace is for code and hashes, NOT for navigation menus, session titles, or button labels.
3. ❌ **Uppercase Shouting**: Do not format all labels as `TASK MATRIX`, `NEURAL AGENTS REPOSITORY`, or `OPERATOR`.
4. ❌ **Blinding White Form Fields in Dark Modals**: Inverted input controls ruin dark mode ergonomics.
5. ❌ **2px Solid Neon Borders & Scanlines**: Distracting and cheapens the product.
6. ❌ **Unstyled Data Tables in Empty Voids**: Tables must have padded headers, rounded container borders, and zebra/hover striping.
