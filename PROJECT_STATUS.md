# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst
**Обновлено:** 2026-05-05
**Сессия:** 5

---

## Репозиторий
```
GitHub: https://github.com/privatedeskai/sg-analytics-engine
Папка:  C:\Users\dorof\Documents\sg-analytics-engine
Ветка:  main
```

---

## Живые URL
```
Worker:  https://sg-analytics-engine.dorofeevov17.workers.dev
Web App: https://web-app-liart-gamma.vercel.app
```

---

## Команды запуска и деплоя
```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler deploy
cd C:\Users\dorof\Documents\sg-analytics-engine ; git add . ; git commit -m "checkpoint: [описание]" ; git push
```

---

## Текущее состояние компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Репозиторий | ✅ | github.com/privatedeskai/sg-analytics-engine |
| Worker деплой | ✅ | отвечает на /status, /analyze, /result/:id |
| /status роут | ✅ | возвращает 200 OK |
| /analyze роут | ✅ | запускает анализ, возвращает sessionId |
| /result роут | ✅ | читает из KV, сессия не теряется |
| KV хранилище | ✅ | статус сессий пишется и читается корректно |
| Оркестратор | ✅ | AnalysisOrchestrator, 3 итерации (TD-002) |
| Judge0 CE | ✅ | ce.judge0.com, без ключа, execution работает |
| kimi.ts | ✅ | claude-sonnet-4-5 временно (TD-001) |
| CSV загрузчик | ✅ | connectors/csv.ts готов |
| Output formatter | ✅ | output.ts готов |
| Secrets | ✅ | CLAUDE_API_KEY, DEEPINFRA_API_KEY, E2B_API_KEY |
| MCP filesystem | ✅ | работает, Claude пишет файлы напрямую |
| Базовый UI | ⬜ | не начат |
| Stripe биллинг | ⬜ | не начат |

---

## Активные технические долги

| ID | Описание | Триггер возврата |
|----|----------|-----------------|
| TD-001 | Claude API вместо Kimi K2.6 | Пополнить DeepInfra ~$10 |
| TD-002 | MAX_ITERATIONS=3 вместо 10 | 3 успешных теста подряд |
| TD-003 | Жёсткие таймауты в orchestrator.ts | Оценить после стабилизации |

Подробности — в TECH_DEBT.md

---

## КРИТИЧНО — Первые шаги сессии 6

### Задача 1: завершить тест pipeline
Запустить анализ и получить `"status":"completed"` с непустым `result.summary`.
Оставить окно с `wrangler tail` открытым для логов DO.

```powershell
# Мониторинг логов (первое окно)
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler tail --format pretty
```

```powershell
# Тест (второе окно)
$r = Invoke-WebRequest -Method POST https://sg-analytics-engine.dorofeevov17.workers.dev/analyze -ContentType "application/json" -Body '{"question":"What are the top 3 products by revenue?","csvContent":"product,revenue,units\nApples,1200,100\nBananas,850,200\nCarrots,2100,50\nDates,430,30\nEggplant,1750,80"}' -UseBasicParsing ; $sid = ($r.Content | ConvertFrom-Json).sessionId ; Write-Host "SessionId: $sid"
```

```powershell
# Проверка результата через 30 сек
Invoke-WebRequest "https://sg-analytics-engine.dorofeevov17.workers.dev/result/$sid" -UseBasicParsing | Select-Object -ExpandProperty Content
```

### Задача 2: после успешного теста — закрыть TD-002
Вернуть MAX_ITERATIONS = "10" в wrangler.toml и убрать Math.min cap в orchestrator.ts.

### Задача 3: базовый UI
Написать web-app/index.html — чат слева, дашборд справа.
Задеплоить на Vercel.

---

## История сессий

### Сессия 0 — 2026-05-04
Разработана концепция, выбран стек.

### Сессия 1 — 2026-05-04
Worker задеплоен, все secrets добавлены, файлы созданы.

### Сессия 2 — 2026-05-05
- E2B SDK несовместим с CF Workers — переключились на Piston API
- Claude API подключён временно вместо Kimi

### Сессия 3 — 2026-05-05
- kimi.ts починен
- Worker задеплоен, /analyze отвечает

### Сессия 4 — 2026-05-05
- MCP filesystem подключён и работает
- Claude теперь пишет файлы напрямую через filesystem

### Сессия 5 — 2026-05-05
- Подключён MCP filesystem — Claude пишет файлы сам без участия Олега
- Исправлен экспорт AnalysisOrchestrator (было Orchestrator)
- Исправлен KV binding (было ANALYTICS_KV, стало KV)
- /status роут задеплоен и работает (200 OK)
- /result читает из KV — сессия больше не теряется
- Piston API заменён на Judge0 CE (ce.judge0.com) — без ключа, без карты
- Добавлены таймауты в orchestrator.ts (withTimeout)
- MAX_ITERATIONS снижен до 3 для отладки (TD-002)
- Pipeline работает: started → running (iter 1..10) — финальный completed в процессе отладки
- Создан TECH_DEBT.md — реестр временных решений
- Обновлён PROJECT_INSTRUCTIONS.md — регламент технического долга (раздел 14)
- Добавлен регламент выбора внешних решений (раздел 13)
