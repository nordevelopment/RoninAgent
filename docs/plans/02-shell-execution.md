# План 2: выполнение CLI-команд агентом (`run_command`)

> Статус: **черновик на согласование**. Код не меняется, пока план не одобрен.
> Коммиты — только по явной команде, по одному на шаг.
>
> **Зависит от плана 1** ([01-harness-fixes.md](01-harness-fixes.md)):
> F1 (signal → kill процесса), F2 (окно истории), F3 (лимиты вывода), F4 (папка сессии = `cwd`), F5 (Telegram-кнопки approval невозможны без неблокирующего polling).

---

## 0. Цель и границы

**Цель.** Агент может выполнять команды ОС (`git status`, `npm test`, `python script.py`) и получать результат. При этом:

- по умолчанию функция **полностью выключена** — инструмента нет в списке, модель о нём не знает;
- каждая команда проходит политику (allowlist / подтверждение человеком / запрет);
- секреты процесса (`AI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `APP_PASSWORD`) недоступны дочерним процессам;
- кнопка Stop реально убивает дерево процессов;
- каждое решение и запуск записываются в audit.

**Не входит (следующие этапы):**

- `DockerExecutor` — настоящая изоляция;
- долгие/фоновые процессы (`yieldMs` + инструмент `process`, как в OpenClaw);
- постоянные (переживающие рестарт) правила «always allow»;
- LLM-ревьюер команд;
- CLI для самого RoninAgent (commander + prompts).

**Честное ограничение `LocalExecutor`.** Без контейнера команда видит всё, что видит пользователь ОС: `~/.ssh`, `~/.npmrc`, git credentials, любые файлы на диске. Политика и approval уменьшают риск, но **не являются песочницей**. Это явно пишем в UI и README.

---

## 1. Ключевые решения

| # | Решение | Почему |
|---|---|---|
| D1 | Главный выключатель `shell.enabled = false` по умолчанию. Выключен → инструмент не регистрируется **и** отклоняется в `executeTool` | Модель может повторить старый вызов из истории — одного скрытия мало |
| D2 | Режимы `allowlist \| ask \| full`, по умолчанию `ask` | Как у OpenClaw, без `auto` (LLM-ревьюер подвержен той же инъекции) |
| D3 | Две формы вызова: **argv** (`command` + `args[]`, `shell: false`) и **shell** (`shell: true`, строка) | Не пишем парсер shell. Auto-allow возможен **только** для argv-формы. Shell-форма — всегда approval (в `ask`) или отказ (в `allowlist`) |
| D4 | Исполнение через `execa@10` | Проверено по докам и пакету 10.2.0: `killDescendants`, `cancelSignal`, `extendEnv: false`, `forceKillAfterDelay` |
| D5 | Бинарник резолвим **сами** по `PATH`, исключая cwd и всё внутри `workspace/` | Защита от подложенного `git.cmd` в папке сессии |
| D6 | Env — только allowlist переменных + флаги неинтерактивности | `dotenv` кладёт секреты в `process.env` |
| D7 | Approval — часть harness (middleware + `ApprovalRegistry`), а не `run_command` | Переиспользуется для `delete_item` и будущих опасных инструментов |
| D8 | Нет UI для подтверждения (cron) → только allowlist | Как `askFallback: deny` у OpenClaw |
| D9 | Approval только **ужесточает** политику; параметры от модели не могут её ослабить | Защита от инъекции «вызови с ask=off» |
| D10 | «Allow for session» привязан к точному argv + cwd + sha256 файла скрипта, хранится в памяти | Изменённый скрипт после одобрения не запустится |
| D11 | Включить shell нельзя, если `APP_PASSWORD` пуст и `HOST` не loopback | Иначе любой в сети включит shell через `/settings` = RCE |
| D12 | Telegram: shell выключен по умолчанию; принудительно выключен, если `ALLOWED_TELEGRAM_USER_IDS` пуст | Пустой список = бот открыт всем |

---

## 2. Расширение harness под shell

### 2.1 Контекст запуска: `origin` и канал approval

**Файлы:** `backend/ai/AITools.ts`, `backend/ai/ChatManager.ts`, `backend/routes.ts`, `backend/services/TelegramBot.ts`, `backend/services/TaskService.ts`

Расширяем `ToolRunOptions` из F1:

```ts
export type RunOrigin = 'web' | 'telegram' | 'task';

export interface ToolRunOptions {
  signal?: AbortSignal;          // из F1
  origin?: RunOrigin;
  approval?: ApprovalChannel;    // §3.5; undefined → нет живого человека
}
```

`ChatManager.sendMessage` получает 6-й необязательный параметр `runOptions?: { origin: RunOrigin; approval?: ApprovalChannel }`. Существующие вызовы не ломаются; route, TelegramBot и TaskService передают `origin` явно.

Сейчас канал угадывается по префиксу `sessionId` (`telegram_`, `task_`). Для решений безопасности это ненадёжно — используем только явный `origin`; без него → `web` **без** approval-канала (то есть строже).

### 2.2 Динамический список инструментов

`getAvailableTools(ctx?: { origin?: RunOrigin })` добавляет `run_command`, только если shell включён и разрешён для этого канала. Описание инструмента генерируется на лету: ОС, shell, текущий режим, правила неинтерактивности (§3.7).

### 2.3 Лимит вывода

В карту лимитов из F3: `run_command: 30_000`, стратегия `head_tail`.

---

## 3. Реализация

### 3.1 Зависимости и окружение

- `execa@^10.2.0` (требует Node `>=22`).
- `package.json`: добавить `"engines": { "node": ">=22" }`; README: «Node.js v22 или новее» (Node 20 — EOL с апреля 2026).
- Резолвер бинарников пишем сами (~50 строк), без пакета `which`: нужна точная семантика исключений из D5.

### 3.2 Конфигурация

**Файлы:** `backend/config.ts`, `backend/services/SettingsService.ts`, новый `backend/ai/shell/shellPolicyStore.ts`, новый `backend/utils/network.ts`

Скалярные настройки — в существующем двойном режиме `.env` / `config.json`:

| Ключ `.env` | Ключ `config.json` | По умолчанию |
|---|---|---|
| `SHELL_ENABLED` | `shell_enabled` | `false` |
| `SHELL_MODE` | `shell_mode` | `ask` |
| `SHELL_ALLOW_TELEGRAM` | `shell_allow_telegram` | `false` |
| `SHELL_TASK_MODE` | `shell_task_mode` | `allowlist` (`deny` \| `allowlist`) |
| `SHELL_TIMEOUT_MS` | `shell_timeout_ms` | `120000` (макс. `600000`) |
| `SHELL_APPROVAL_TIMEOUT_MS` | `shell_approval_timeout_ms` | `120000` |

Allowlist — структура, в `.env` хранить неудобно → отдельный файл `config/shell-allowlist.json` в корне проекта (вне `workspace/`, файловые инструменты агента до него не дотягиваются). Валидация при загрузке; битый файл → пустой allowlist + ошибка в логе, **не** fallback на «разрешить всё».

`config` — общий изменяемый объект, `SettingsService` правит его на месте. Значит, читать `config.shell.*` **в момент вызова**, никогда не копировать в поля конструктора — тогда выключение в UI действует сразу.

Серверная проверка D11 в `SettingsService.saveSettings`: попытка включить shell при пустом пароле и не-loopback `HOST` → ошибка 400 с понятным текстом. `isLoopbackHost` переносится из `app.ts` в `backend/utils/network.ts`.

### 3.3 Исполнитель

**Новые файлы:** `backend/services/shell/ShellExecutor.ts`, `LocalExecutor.ts`, `resolveExecutable.ts`, `shellEnv.ts`

```ts
export type ShellRequest =
  | { kind: 'argv'; file: string; args: string[]; cwd: string; timeoutMs: number }
  | { kind: 'shell'; script: string; cwd: string; timeoutMs: number };

export interface ShellResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
  output: string;          // stdout+stderr в порядке появления (execa `all: true`)
  outputBytes: number;
  truncated: boolean;
}

export interface ShellExecutor {
  run(req: ShellRequest, signal: AbortSignal): Promise<ShellResult>;
}
```

`LocalExecutor` — параметры execa:

| Опция | Значение | Зачем |
|---|---|---|
| `cancelSignal` | signal из F1 | Stop убивает процесс |
| `killDescendants` | `true` | Unix: группа процессов; Windows: `taskkill` по дереву |
| `timeout` | `req.timeoutMs` | |
| `forceKillAfterDelay` | `3000` | SIGTERM → SIGKILL (на Windows не работает, там сразу `taskkill`) |
| `extendEnv` | `false` | Не наследовать `process.env` |
| `env` | `buildShellEnv()` | §3.3.2 |
| `stdin` | `'ignore'` | Интерактивные команды не виснут |
| `all` | `true` | Единый поток вывода |
| `maxBuffer` | `1_000_000` | Защита памяти; дальше — head+tail до 30 KB |
| `reject` | `false` | Ненулевой код выхода — нормальный результат, а не исключение |
| `windowsHide` | `true` | Без всплывающих окон консоли |

Ограничение параллельности: **одна** команда на сессию; глобально не более 4. Превышение → понятная ошибка модели, не очередь.

#### 3.3.1 Shell для формы `shell`

- Windows: `pwsh.exe`, если найден в PATH, иначе `powershell.exe`; аргументы `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command <script>`; перед скриптом `[Console]::OutputEncoding = [Text.Encoding]::UTF8;`.
- POSIX: `/bin/sh -c <script>`.

Риск: часть старых консольных утилит Windows пишет в OEM-кодировке (cp866) — проверяем тестом с кириллицей, при необходимости декодируем вывод через `TextDecoder` по коду страницы.

#### 3.3.2 Env

Allowlist переменных:
- общие: `PATH`, `LANG`, `LC_ALL`, `TZ`;
- Windows: `SystemRoot`, `windir`, `ComSpec`, `PATHEXT`, `TEMP`, `TMP`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramData`, `NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, `OS`;
- POSIX: `HOME`, `USER`, `SHELL`, `TMPDIR`, `TERM`.

Добавляем принудительно:
`CI=1`, `NO_COLOR=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_PAGER=cat`, `PAGER=cat`, `npm_config_yes=true`, `RONIN_EXEC=1`; на Windows `NoDefaultCurrentDirectoryInExePath=1`.

Модель не может передать свои env-переменные в v1.

### 3.4 Политика

**Новые файлы:** `backend/ai/shell/ShellPolicy.ts` (чистые функции, без I/O), `backend/ai/shell/inlineEval.ts`

```ts
export type PolicyDecision =
  | { action: 'allow'; reason: 'full_mode' | 'allowlist' | 'session_trust' }
  | { action: 'ask'; reason: string }
  | { action: 'deny'; reason: string };

export function evaluateShellPolicy(input: {
  request: ShellRequest;
  resolvedFile?: string;          // абсолютный путь бинарника для argv-формы
  origin: RunOrigin;
  hasApprovalChannel: boolean;
  settings: ShellSettings;
  allowlist: AllowlistEntry[];
  sessionTrust: ReadonlySet<string>;
  fingerprint: string;
}): PolicyDecision
```

Порядок проверки (первое совпадение решает):

1. `shell.enabled = false` → `deny`.
2. Канал: `telegram` без `shell_allow_telegram` или с пустым `ALLOWED_TELEGRAM_USER_IDS` → `deny`.
3. Жёсткие отказы (действуют даже в `full`):
   - `cwd` вне папки сессии (`validatePath` + проверка префикса `resolveSessionFolder` из F4);
   - NUL-символ в любом аргументе;
   - argv-форма: бинарник не найден или лежит внутри `workspace/` (D5).
4. `mode = full` → `allow`.
5. Inline eval (`inlineEval.ts`) → `ask`, даже если бинарник в allowlist:
   `node -e|--eval|-p|--print`, `python -c`, `perl -e`, `ruby -e`, `deno eval`, `bash|sh|zsh -c`, `cmd /c|/k`, `powershell|pwsh -Command|-c|-EncodedCommand|-e`, `find ... -exec`, а также запускатели пакетов `npx`, `pnpm dlx`, `yarn dlx`, `bunx` (скачивают и выполняют произвольный код).
6. argv-форма и совпадение с allowlist → `allow`.
7. `fingerprint` в `sessionTrust` → `allow`.
8. `mode = allowlist` → `deny` (с текстом, что разрешено и как попросить пользователя).
9. `mode = ask`: есть approval-канал → `ask`; нет (cron) → `deny` (allowlist уже проверен в п.6; при `shell_task_mode = deny` для `task` отказ происходит уже на шаге 2).

**Формат allowlist:**

```json
[
  { "bin": "git", "argPattern": "^(?!.*(--output|--ext-diff|--exec|--upload-pack|--git-dir|--work-tree|(^| )-c ))(status|diff|log|show|rev-parse|branch --list)( |$)" },
  { "bin": "node", "argPattern": "^(-v|--version)$" },
  { "bin": "npm",  "argPattern": "^(-v|--version|ls)( |$)" }
]
```

- `bin` сравнивается с именем резолвнутого файла без расширения (`git.exe` → `git`); `argPattern` — regex по `args.join(' ')`, обязательно с `^…$` / `^…( |$)` (без якоря в начале — ошибка валидации).
- **Не включаем по умолчанию `npm test` / `npm run`:** скрипты в `package.json` агент может изменить через `write_file`, то есть это произвольный код.
- **git тоже исполняет код** через конфиг репозитория (`core.fsmonitor`, `core.pager`, внешний diff), а `.git/config` агент может записать. Для auto-allow git-команд добавляем в env `GIT_CONFIG_COUNT=2`, `GIT_CONFIG_KEY_0=core.fsmonitor`, `GIT_CONFIG_VALUE_0=false`, `GIT_CONFIG_KEY_1=core.pager`, `GIT_CONFIG_VALUE_1=cat` (поддерживается с git 2.31; более старый git → auto-allow для git отключается), а к `diff/log/show` — аргумент `--no-ext-diff`.
- **«Безопасная» подкоманда с опасным флагом:** `git log --output=<path>` пишет файл куда угодно. Поэтому стартовый шаблон git запрещает флаги через negative lookahead (см. выше). Валидатор предупреждает, если пользовательское правило для git разрешает «любые аргументы».
- `dir`, `ls`, `cd` на Windows — встроенные команды shell, а не бинарники: для просмотра папок у агента уже есть `list_directory`.

**Fingerprint (D10):** `sha256(JSON.stringify({ kind, file|script, args, cwd, scriptHash }))`, где `scriptHash` — sha256 содержимого первого аргумента, если это существующий файл внутри `cwd` (`node build.js`, `python x.py`). Файл изменился → другой fingerprint → снова approval.

### 3.5 Подтверждение человеком

**Новые файлы:** `backend/ai/approval/ApprovalRegistry.ts`, `backend/ai/approval/types.ts`

```ts
export type ApprovalDecision = 'allow_once' | 'allow_session' | 'deny';

export interface ApprovalRequest {
  id: string;                 // crypto.randomUUID()
  sessionId: string;
  origin: RunOrigin;
  tool: string;
  summary: string;            // команда для показа человеку
  cwd: string;
  reason: string;             // почему спрашиваем (inline eval, не в allowlist, shell-форма)
  expiresAt: number;
}

export interface ApprovalChannel {
  notify(req: ApprovalRequest): Promise<void>;
  resolved?(id: string, decision: ApprovalDecision | 'timeout' | 'cancelled'): Promise<void>;
}

class ApprovalRegistry {
  request(req: ApprovalRequest, channel: ApprovalChannel, signal: AbortSignal): Promise<ApprovalDecision>;
  resolve(id: string, sessionId: string, decision: ApprovalDecision): boolean;
}
```

Гарантии `ApprovalRegistry`:
- каждый pending хранит `resolve`, `timer`, `sessionId`; **любой** исход (решение, timeout, abort, ошибка `notify`) удаляет запись и чистит таймер и listener `signal` — без утечек;
- `resolve` сверяет `sessionId` запроса с сессией того, кто отвечает;
- повторный ответ на уже закрытый запрос → `false`, без эффекта;
- timeout и abort → `deny`;
- одна pending-заявка на сессию (инструменты в цикле и так выполняются последовательно).

Интеграция — новый `ApprovalMiddleware` в `onBeforeExecute`: если политика вернула `ask`, ждёт решения; `deny` → результат инструмента с причиной (модель видит, что команду отклонили, и не повторяет её бесконечно); `allow_session` → fingerprint в `sessionTrust`. `sessionTrust` очищается при удалении сессии и рестарте.

### 3.6 Каналы

**Web UI** (`backend/routes.ts`, `frontend/src/stores/chat.ts`, новый `frontend/src/components/chat/ApprovalCard.vue`)
- SSE-события `approval_required` (данные `ApprovalRequest`) и `approval_resolved`.
- `POST /api/chat/approve` `{ approvalId, decision }` → `registry.resolve(id, request.sessionId, decision)`; 404, если запрос не найден или чужой.
- Heartbeat-комментарий `: ping` каждые 15 с, пока открыт SSE: прокси (Caddy/nginx) не должны рвать поток во время ожидания.
- Карточка: команда моноширинным шрифтом, cwd, причина, таймер, кнопки «Разрешить один раз» / «Разрешить в этой сессии» / «Отклонить». Стили — в существующих CSS-файлах темы, без inline-стилей.

**Telegram** (`backend/services/TelegramBot.ts`, требует F5)
- Сообщение с командой + `Markup.inlineKeyboard` (callback data `ap:<id>:o|s|d`).
- `bot.action(/^ap:/)`: существующий middleware уже проверяет `ALLOWED_TELEGRAM_USER_IDS` для всех update, включая `callback_query`; дополнительно проверяем `sessionId === telegram_<from.id>`.
- После решения — `editMessageReplyMarkup` (убрать кнопки) + `answerCbQuery`.

**Cron** (`backend/services/TaskService.ts`)
- `origin: 'task'`, без approval-канала → работает D8.

### 3.7 Инструмент

**Файл:** `backend/ai/AITools.ts` — `case 'run_command'` + схема.

```json
{
  "name": "run_command",
  "parameters": {
    "type": "object",
    "properties": {
      "command":   { "type": "string", "description": "Executable name (argv form) or full script (when shell=true)" },
      "args":      { "type": "array", "items": { "type": "string" } },
      "shell":     { "type": "boolean", "default": false },
      "cwd":       { "type": "string", "description": "Relative to the session workspace folder" },
      "timeoutMs": { "type": "integer" }
    },
    "required": ["command"]
  }
}
```

- `timeoutMs` от модели ограничен сверху значением из настроек (D9).
- Ответ модели — компактный текст: `exit_code`, `duration_ms`, `timed_out`/`cancelled`, `truncated`, затем вывод.
- Описание инструмента (динамическое, §2.2): ОС и shell; «предпочитай argv-форму»; «используй неинтерактивные флаги: `-y`, `--yes`, `--no-input`, `npm init -y`»; «stdin недоступен»; «долгие процессы (dev-серверы, watch) не поддерживаются».

Обновить `agents/main_agent/Agent.md` и `skills/coding.md`: когда использовать `run_command`, а когда файловые инструменты.

### 3.8 Audit

**Файлы:** `backend/database/schema.sql`, `backend/database/DatabaseClient.ts` (миграция в стиле существующих `ALTER`), новый `backend/models/shellAudit.ts`

```sql
CREATE TABLE IF NOT EXISTS shell_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('web', 'telegram', 'task')),
  kind TEXT NOT NULL CHECK(kind IN ('argv', 'shell')),
  command TEXT NOT NULL,          -- JSON: file+args или script
  cwd TEXT NOT NULL,
  mode TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN (
    'auto_allow', 'approved_once', 'approved_session',
    'denied_policy', 'denied_user', 'denied_timeout', 'denied_cancelled')),
  exit_code INTEGER,
  timed_out INTEGER DEFAULT 0,
  duration_ms INTEGER,
  output_bytes INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shell_audit_session ON shell_audit(session_id, created_at);
```

- Без `FOREIGN KEY ... ON DELETE CASCADE`: audit должен пережить удаление сессии.
- Вывод команд **не** сохраняем (может содержать секреты), только размер.
- Ротация при старте: удалять записи старше 90 дней.
- Чтение: `GET /api/shell/audit?limit=100` + простая таблица в Settings.

### 3.9 Настройки UI

**Файлы:** `frontend/src/views/SettingsView.vue`, `frontend/src/stores/settings.ts`, `UpdateSettingsDto` / `PublicSettingsResponse`

Секция «Выполнение команд»:
- главный переключатель с предупреждением: «Агент сможет запускать программы от имени вашего пользователя ОС. Это не песочница.»;
- режим (`allowlist` / `ask` / `full`); для `full` — отдельное подтверждение и текст «агент может всё, что можете вы, включая изменение этих настроек»;
- Telegram, режим для задач, таймауты;
- редактор allowlist (JSON с валидацией на сервере);
- последние записи audit.

---

## 4. Модель угроз

| Угроза | Мера | Остаточный риск |
|---|---|---|
| Prompt injection со страницы → команда | `ask` по умолчанию, человек видит команду | Человек может одобрить не глядя |
| Утечка ключей через `env` | D6 | Ключи в файлах на диске (`.env`) читаются командой `type .env` в `full` / после одобрения |
| Подмена бинарника в папке сессии | D5 + `NoDefaultCurrentDirectoryInExePath` | — |
| Изменение скрипта после одобрения | D10 | — |
| Код через `npm test` / git-конфиг / опасные флаги | Не в allowlist по умолчанию; git с принудительным конфигом и запретом флагов | Пользовательские правила allowlist могут это открыть |
| RCE через открытый `/settings` | D11 | — |
| Чужой пользователь Telegram | D12 + существующий whitelist | Взлом Telegram-аккаунта владельца |
| Зависшие процессы | `killDescendants`, timeout, лимит параллельности | Демоны с `setsid()` (Unix) уходят из-под kill |
| Агент меняет свою политику | Allowlist-файл вне `workspace/` | В `full` агент может всё — честно в UI |
| Чтение любых файлов ОС | — | Только Docker (следующий этап) |

---

## 5. Тесты (vitest)

Unit:
- `shellPolicy.test.ts` — таблица случаев для каждого шага §3.4, включая inline eval, `npx`, cwd вне сессии, бинарник в `workspace/`, telegram без whitelist, `task` без канала.
- `inlineEval.test.ts` — варианты флагов и регистра (`-Command`, `-c`, `-EncodedCommand`).
- `allowlistPattern.test.ts` — git-шаблон пропускает `status`, `log -5`, отклоняет `log --output=x`, `-c core.pager=x status`.
- `resolveExecutable.test.ts` — подложенный `git.cmd` в cwd не выбирается; `PATHEXT` на Windows.
- `shellEnv.test.ts` — в env нет `AI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `APP_PASSWORD`.
- `approvalRegistry.test.ts` — решение, timeout, abort, повторный resolve, чужой `sessionId`, нет утечек таймеров (`vi.useFakeTimers`, проверка размера map).
- `allowlistStore.test.ts` — битый JSON → пустой список; regex без якоря → ошибка.
- `settingsShellGuard.test.ts` — D11: включение при пустом пароле и `HOST=0.0.0.0` → ошибка.

Интеграция (реальные процессы, кроссплатформенно через `process.execPath`):
- `localExecutor.test.ts`:
  - код выхода и вывод `node -e "process.exit(3)"`;
  - timeout убивает **дерево** (родитель запускает дочерний `node`, проверяем, что PID потомка мёртв);
  - abort через signal;
  - обрезка вывода head+tail;
  - кириллица в выводе на Windows.
- `chatManagerShell.test.ts` — цикл: модель вызывает `run_command` → `approval_required` → approve → результат в истории; вариант с deny; abort во время ожидания; shell выключен, но модель всё равно вызывает инструмент → отказ.

Ручная проверка: Web UI (approve/deny/Stop во время `npm install`), Telegram (кнопки), cron-задача с командой вне allowlist.

---

## 6. Порядок работ

| Шаг | Содержание | Зависит от |
|---|---|---|
| S1 | Конфиг, allowlist-store, D11, `engines` | — |
| S2 | `LocalExecutor`, резолвер, env | S1, F1 |
| S3 | `ShellPolicy` + inline eval | S1, F4 |
| S4 | `origin` / approval-канал в harness (§2.1), динамический список (§2.2) | F1 |
| S5 | `ApprovalRegistry` + middleware | S4 |
| S6 | `run_command` в `AITools` + audit | S2, S3, S5, F3 |
| S7 | Web: SSE-события, `/api/chat/approve`, `ApprovalCard.vue` | S5 |
| S8 | Telegram: inline-кнопки | S5, F5 |
| S9 | Settings UI + audit view | S1, S6 |
| S10 | Agent.md, coding skill, README (Security, Node 22) | S6 |

Каждый шаг: код + тесты + `npm test` + `tsc` зелёные. Коммит — по твоей команде.

---

## 7. Вопросы на решение

1. **Node ≥22** как минимальная версия — ок?
2. **Режим для cron-задач** по умолчанию: `allowlist` (выполняются только команды из списка) или `deny` (в задачах shell не работает вообще)?
3. **Две формы вызова** (argv + shell) — ок, или в v1 только argv (проще и безопаснее, но без пайпов `|`)?
4. **Telegram-approval** (S8) входит в v1 или переносим?
5. **Таймауты:** команда 120 с, ожидание approval 120 с — ок?
6. **Стартовый allowlist** из §3.4 (git read-only, версии node/npm) — ок, или начать с пустого?
