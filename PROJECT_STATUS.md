# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst
**Обновлено:** 2026-05-05
**Сессия:** 4

---

## Репозиторий
- GitHub: https://github.com/privatedeskai/sg-analytics-engine
- Папка: C:\Users\dorof\Documents\sg-analytics-engine
- Ветка: main

---

## КРИТИЧНО — Команды запуска и деплоя

cd C:\Users\dorof\Documents\sg-analytics-engine\worker
npx wrangler deploy
cd web-app ; npx vercel --prod --yes ; cd ..
git add . ; git commit -m "checkpoint: [описание]" ; git push

---

## Живые URL

Worker: https://sg-analytics-engine.dorofeevov17.workers.dev
Web App: https://web-app-liart-gamma.vercel.app

---

## Текущее состояние компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Репозиторий | ✅ | github.com/privatedeskai/sg-analytics-engine |
| Worker деплой | ✅ | задеплоен, отвечает на /analyze |
| E2B клиент | ✅ | Piston API — работает |
| kimi.ts | ✅ | починен, Claude API временно |
| index.ts | ⚠️ | роут /status написан но НЕ задеплоен |
| Оркестратор | ✅ | orchestrator.ts работает |
| Secrets | ✅ | E2B_API_KEY, DEEPINFRA_API_KEY, CLAUDE_API_KEY |
| KV namespace | ✅ | id: 5884f641df3441deb36344e8be2e5ab6 |
| CSV загрузчик | ⬜ | не начат |
| Output formatter | ⬜ | не начат |
| Базовый UI | ⬜ | не начат |
| Stripe биллинг | ⬜ | не начат |
| MCP терминал | ⚠️ | конфиг обновлён на server-filesystem, требует перезапуска |

---

## КРИТИЧНО — Первые шаги сессии 5

### Задача 1: проверить MCP filesystem
После перезапуска Claude Desktop проверить подключился ли MCP server-filesystem.

### Задача 2: задеплоить index.ts с роутом /status
Открыть и заменить файл:
https://github.com/privatedeskai/sg-analytics-engine/blob/main/worker/src/index.ts

Код index.ts с роутом /status — Claude восстановит в начале сессии 5.

После коммита:
cd C:\Users\dorof\Documents\sg-analytics-engine ; git pull
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler deploy

### Задача 3: CSV загрузчик
После успешного теста /status — начать csv.ts

---

## История сессий

### Сессия 0 — 2026-05-04
Разработана концепция, выбран стек.

### Сессия 1 — 2026-05-04
Worker задеплоен, все secrets добавлены, файлы созданы.

### Сессия 2 — 2026-05-05
- Добавлен .gitignore для node_modules
- E2B переключён на Piston API
- Claude API подключён временно вместо Kimi
- kimi.ts содержал синтаксическую ошибку

### Сессия 3 — 2026-05-05
- PROJECT_INSTRUCTIONS.md обновлён — добавлено ПРАВИЛО 5 (URL только в блоках кода)
- kimi.ts починен — синтаксическая ошибка устранена
- Worker успешно задеплоен
- /analyze отвечает — возвращает sessionId
- /status роут написан но не задеплоен — первая задача сессии 4

### Сессия 4 — 2026-05-05
- MCP конфиг обновлён на @modelcontextprotocol/server-filesystem
- Конфиг находится в AppData\Roaming\Claude\claude_desktop_config.json
- index.ts с роутом /status всё ещё не задеплоен
- После перезапуска Desktop — проверить MCP и задеплоить index.ts
