# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst
**Обновлено:** 2026-05-06
**Сессия:** 6

---

## Репозиторий

GitHub: https://github.com/privatedeskai/sg-analytics-engine
Папка:  C:\Users\dorof\Documents\sg-analytics-engine
Ветка:  main

---

## Живые URL

Worker:  https://sg-analytics-engine.dorofeevov17.workers.dev
Web App: https://web-app-liart-gamma.vercel.app

---

## Команды запуска и деплоя

Worker:  cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npm run deploy
Commit:  cd C:\Users\dorof\Documents\sg-analytics-engine ; git add . ; git commit -m "checkpoint: [описание]" ; git push

---

## Текущее состояние компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Репозиторий | ✅ | github.com/privatedeskai/sg-analytics-engine |
| Worker деплой | ✅ | npm run deploy (wrangler 3.99.0 в package.json) |
| /status роут | ✅ | возвращает 200 OK |
| /analyze роут | ✅ | запускает анализ, возвращает sessionId |
| /result роут | ✅ | читает из KV, сессия не теряется |
| KV хранилище | ✅ | статус сессий пишется и читается корректно |
| Оркестратор | ✅ | 10 итераций, MAX_ITERATIONS захардкожен в коде |
| Judge0 CE | ✅ | stdlib only Python, pandas запрещён в промпте |
| kimi.ts | ✅ | claude-sonnet-4-5 временно (TD-001) |
| CSV загрузчик | ✅ | connectors/csv.ts готов |
| Output formatter | ✅ | output.ts готов |
| Pipeline E2E | ✅ | status:completed, 10 итераций, summary готов |
| Базовый UI | ✅ | задеплоен на Vercel, чат + дашборд |
| Stripe биллинг | ⬜ | не начат |

---

## Активные технические долги

| ID | Описание | Триггер возврата |
|----|----------|-----------------|
| TD-001 | Claude API вместо Kimi K2.6 | Пополнить DeepInfra ~$10 |
| TD-003 | Жёсткие таймауты в orchestrator.ts | Оценить после стабилизации |

Подробности — в TECH_DEBT.md

---

## КРИТИЧНО — Первые шаги сессии 7

### Задача 1: тест UI на реальных данных
Открыть web-app-liart-gamma.vercel.app, загрузить реальный CSV, убедиться что pipeline проходит end-to-end через UI.

### Задача 2: улучшить UI по результатам теста
Исправить что не работает или выглядит плохо после живого теста.

### Задача 3: закрыть TD-001
Пополнить баланс DeepInfra (~$10), переключить kimi.ts на Kimi K2.6.

### Задача 4: Stripe биллинг
Подключить Stripe, настроить планы Free / Starter / Pro.

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

### Сессия 5 — 2026-05-05
- Judge0 CE подключён вместо Piston
- Pipeline работает до running, completed в отладке

### Сессия 6 — 2026-05-06
- Исправлен системный промпт kimi.ts — запрещён pandas, только stdlib
- Pipeline работает end-to-end: status:completed, 10 итераций, полный summary
- TD-002 закрыт: MAX_ITERATIONS=10 захардкожен в orchestrator.ts
- wrangler зафиксирован на 3.99.0 в package.json (обход ошибки 10023 Versions API)
- Schema detection переписан на stdlib без pandas
- Базовый UI написан и задеплоен на Vercel
- UI: тёмная тема, чат слева + дашборд справа, DM Sans + DM Mono
