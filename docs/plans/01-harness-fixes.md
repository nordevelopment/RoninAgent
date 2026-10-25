# План 1: исправление существующего кода (harness)

> Статус: **черновик на согласование**. Код не меняется, пока план не одобрен.
> Коммиты — только по явной команде, по одному на пункт.
>
> Эти исправления нужны независимо от CLI-команд. План 2 ([02-shell-execution.md](02-shell-execution.md)) опирается на них.

---

## Сводка

| # | Проблема | Где | Тип | Нужно для плана 2 |
|---|---|---|---|---|
| F1 | Кнопка Stop не прерывает работающий инструмент | `AITools.ts`, `ChatManager.ts` | Дефект | Да (kill процесса) |
| F2 | Окно истории может начаться с «осиротевших» `tool`-сообщений → 400 от провайдера | `ChatManager.ts:249` | Баг | Да (больше tool-вызовов) |
| F3 | Один глобальный лимит вывода 100 000 символов на любой инструмент | `AITools.ts` (`OutputTruncationMiddleware`) | Дефект | Да (лимит для shell) |
| F4 | Логика папки сессии продублирована в 4 местах | `AITools.ts:91`, `AITools.ts:321`, `ChatManager.ts:231`, `AIClient.ts:531` | Рефакторинг | Да (`cwd` для shell) |
| F5 | Telegram-бот блокирует polling на всё время работы агента; при работе > 90 с polling падает | `TelegramBot.ts` | Баг | Да (кнопки approval) |

---

## F1. `AbortSignal` до инструментов

**Проблема.** `ChatManager` проверяет `signal.aborted` только **между** шагами. `executeTool(toolCall, sessionId)` не получает signal, поэтому во время `fetch_web_page` (Puppeteer до десятков секунд) или `generate_image` кнопка Stop ничего не прерывает: инструмент доработает, результат запишется в историю.

**Изменения.**

`backend/ai/AITools.ts`:

```ts
export interface ToolRunOptions {
  signal?: AbortSignal;
}

export interface ToolExecutionContext {
  // существующие поля
  signal?: AbortSignal;
}

async executeTool(toolCall: ToolCall, sessionId?: string, options?: ToolRunOptions): Promise<ToolResult>
```

- В начале `executeTool` и перед `onAfterExecute`: если `signal.aborted` → результат `"Tool execution cancelled by user."` без записи побочных эффектов middleware.
- `backend/ai/ChatManager.ts`: передавать `signal` своего `AbortController` в каждый `executeTool`.
- `backend/services/WebPageContent.ts`: прокинуть `signal` в оба вызова axios (опция `signal`) и в `browserService.fetchDynamicPage(url, signal)`.
- `backend/services/BrowserService.ts`: `fetchDynamicPage` при abort закрывает свою страницу (`page.close()` уже есть в `finally`, нужно прервать ожидание `goto`/`waitFor`), чтобы не оставлять вкладки в общем браузере.
- `GracefulFallbackMiddleware`: при отмене **не** делать fallback на статическую загрузку — сейчас ошибка abort запустила бы второй запрос.
- `backend/services/imageService.ts`: прокинуть `signal` в три axios-запроса (Together, xAI, скачивание изображения).
- Остальные инструменты (файлы, Office) короткие — достаточно проверки перед выполнением.

**Ловушка.** Listener `abort` на `signal` снимать в `finally` (`{ once: true }` + `removeEventListener`), иначе на долгих сессиях накапливаются listener-ы и Node выдаёт `MaxListenersExceededWarning`.

---

## F2. Окно истории по границам ходов

> **Заменено** планом [CONTEXT_WINDOW_PLAN.md](../../CONTEXT_WINDOW_PLAN.md) (бюджет токенов вместо лимита сообщений). Текст ниже оставлен для истории.

**Проблема.** `fullHistory.slice(-config.AI_MAX_HISTORY_MESSAGES)` режет по числу сообщений. Если граница проходит между `assistant` с `tool_calls` и его `tool`-ответами, окно начинается с `tool`-сообщений без пары. OpenAI-совместимые API (и большинство провайдеров на OpenRouter) отклоняют такой запрос с 400. Вероятность растёт с числом вызовов инструментов за ход.

**Изменения.** Новый `backend/ai/historyWindow.ts`:

```ts
export function sliceHistoryWindow(messages: AIMessages[], max: number): AIMessages[]
```

Алгоритм:
1. Взять последние `max` сообщений.
2. Сдвинуть начало вперёд до первого `user`-сообщения.
3. Если `user` в окне нет (один очень длинный ход) — сдвинуть до первого `assistant`, у которого **все** `tool_call_id` имеют ответы внутри окна; `tool`-сообщения перед ним отбросить.
4. Если не нашлось и такого — вернуть последнее `user`-сообщение из полной истории + хвост, начиная с первого целого `assistant`.

`ChatManager.ts:249` → `sliceHistoryWindow(fullHistory, Number(config.AI_MAX_HISTORY_MESSAGES))`. `Number(...)` явно: значение из `.env` приходит строкой.

---

## F3. Лимит вывода для каждого инструмента

**Проблема.** `OutputTruncationMiddleware` пропускает до 100 000 символов (~25–30k токенов) за **один** вызов. Несколько чтений больших файлов или страниц быстро вытесняют полезный контекст, а `AI_MAX_HISTORY_MESSAGES` считает сообщения, не токены.

**Изменения.** `backend/ai/AITools.ts`:

```ts
const OUTPUT_LIMITS: Record<string, number> = {
  fetch_web_page: 60_000,
  read_file: 100_000,
  read_pdf: 100_000,
  read_docx: 100_000,
  read_excel: 60_000,
};
const DEFAULT_OUTPUT_LIMIT = 30_000;
```

- Стратегия обрезки задаётся для каждого инструмента: `head` (документы — начало важнее) или `head_tail` (логи, вывод команд — ошибки в конце). По умолчанию `head`.
- Маркер обрезки сохраняет текущий формат: `[TRUNCATED: ... (N characters total)]`.
- Значения выше — стартовые; точные цифры можно подобрать под модель по умолчанию.

---

## F4. Общий helper папки сессии

**Проблема.** Правило «`session_` / `telegram_` → как есть, иначе добавить `session_`» повторяется в четырёх местах. Изменение в одном месте без остальных разведёт пути: файлы окажутся в одной папке, а агент будет искать в другой.

**Изменения.** Новый `backend/utils/sessionFolder.ts`:

```ts
export function resolveSessionFolder(sessionId: string | undefined): string
```

Заменить все четыре места. Поведение не меняется (покрываем тестом на текущие префиксы: `session_x`, `telegram_1`, `task_5` → `session_task_5`, `undefined` → `session_default`).

---

## F5. Telegram: обработчик не блокирует polling

**Проблема.** Проверено в `node_modules/telegraf@4.16.3`:
- `lib/core/network/polling.js`: `for await (const updates of this) await Promise.all(updates.map(handleUpdate))` — следующий `getUpdates` не запрашивается, пока не обработана вся текущая пачка;
- `lib/telegraf.js`: каждый update обёрнут в `pTimeout(..., handlerTimeout)`, по умолчанию `90000`; `handleError` по умолчанию делает `throw err`;
- в `TelegramBot.ts` нет `bot.catch(...)`.

Следствия (вывод по коду, не воспроизводил):
1. Пока агент думает, бот не получает **никаких** новых update — `/clear`, другие сообщения.
2. Если ход агента длится > 90 с (Puppeteer, генерация изображений, 30 шагов), `TimeoutError` проходит через `handleError` → `Promise.all` отклоняется → цикл polling завершается. Бот перестаёт отвечать до рестарта сервера.
3. Два сообщения в одной пачке обрабатываются параллельно на **одной** сессии `telegram_<id>` → гонка при записи истории.

**Изменения.** `backend/services/TelegramBot.ts`:
- Очередь на чат: `Map<chatId, Promise<void>>`, новое сообщение ставится в хвост цепочки — одна генерация на чат, порядок сохраняется. Запись удаляется из map, когда цепочка опустела.
- Обработчик `text` ставит задачу в очередь и **сразу** возвращается. `typing`-интервал и ответ — внутри задачи; ответ отправляется через `this.bot.telegram.sendMessage` / `sendPhoto` по `chatId`, а не через `ctx` (контекст update к этому моменту уже завершён).
- `bot.catch((err, ctx) => logger.error(...))` — ошибка одного update не роняет polling.
- `updateToken` / `stop`: при перезапуске бота дождаться или отменить активные задачи (`chatManager.stopSession(telegram_<id>)`), чтобы старые задачи не писали через старый экземпляр `Telegraf`.
- `/clear` во время генерации: сначала `stopSession`, потом очистка истории.

---

## Тесты (vitest)

- `abortSignal.test.ts` — Stop во время инструмента: результат «cancelled», listener-ы сняты; `fetch_web_page` с mock axios получает `signal`.
- `historyWindow.test.ts` — окно не начинается с `tool`; один длинный ход; несколько `tool_calls` в одном `assistant`; пустая история; `max` строкой.
- `outputTruncation.test.ts` — лимиты по инструментам; стратегия `head_tail`; маркер обрезки.
- `sessionFolder.test.ts` — все текущие префиксы.
- `telegramQueue.test.ts` — обработчик возвращается до конца генерации; два сообщения одного чата выполняются последовательно; ошибка задачи не ломает очередь.

Каждый пункт: код + тесты + `npm test` + `tsc` зелёные.

---

## Порядок

F4 → F2 → F3 → F1 → F5. Первые три маленькие и независимые; F1 трогает сервисы; F5 самый большой.

## Вопросы

1. **Лимиты F3:** стартовые значения устраивают, или подстроить под конкретную модель по умолчанию?
2. **F5, очередь:** если пользователь пишет новое сообщение, пока агент работает — ставить в очередь (как в плане) или прерывать текущую генерацию и начинать новую?
