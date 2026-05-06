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

## Команды деплоя
Worker:     cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler deploy
Web App:    cd C:\Users\dorof\Documents\sg-analytics-engine\web-app ; npx vercel --prod --yes ; cd ..
Checkpoint: git add . ; git commit -m "checkpoint: [описание]" ; git push

---

## Текущее состояние компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Репозиторий | ✅ | github.com/privatedeskai/sg-analytics-engine |
| Worker деплой | ✅ | /status, /analyze, /result/:id |
| KV хранилище | ✅ | сессии пишутся и читаются корректно |
| Оркестратор | ✅ | AnalysisOrchestrator, 10 итераций |
| Judge0 CE | ✅ | ce.judge0.com, без ключа |
| kimi.ts | ✅ | claude-sonnet-4-5 временно (TD-001) |
| CSV загрузчик | ✅ | connectors/csv.ts |
| Output formatter | ✅ | output.ts |
| Pipeline end-to-end | ✅ | completed + summary + KPI + график |
| MCP filesystem | ✅ | Claude пишет файлы напрямую |
| UI — базовый | ✅ | тёмная тема, DM Sans, shimmer accent |
| DESIGN.md | ✅ | дизайн-система зафиксирована в репо |
| Stripe биллинг | ⬜ | не начат |

---

## Активные технические долги

| ID | Описание | Триггер возврата |
|----|----------|-----------------|
| TD-001 | Claude API вместо Kimi K2.6 | Пополнить DeepInfra ~$10 |
| TD-003 | Таймауты в orchestrator.ts | После 3 стабильных тестов |

Подробности — в TECH_DEBT.md

---

## Первые шаги сессии 7

1. Починить KPI карточки — показываются 2 из 4, расширить extractMetrics() под любую JSON структуру
2. Починить скролл чата — скроллит к середине summary, нужно к началу нового сообщения
3. Stripe биллинг — базовый paywall
4. TD-001 — пополнить DeepInfra ~$10, переключить kimi.ts на Kimi K2.6

---

## История сессий

### Сессия 0 — 2026-05-04
Разработана концепция, выбран стек.

### Сессия 1 — 2026-05-04
Worker задеплоен, все secrets добавлены.

### Сессия 2 — 2026-05-05
E2B несовместим с CF Workers → Piston API. Claude API временно вместо Kimi.

### Сессия 3 — 2026-05-05
kimi.ts починен. Worker задеплоен, /analyze отвечает.

### Сессия 4 — 2026-05-05
MCP filesystem подключён. Claude пишет файлы напрямую.

### Сессия 5 — 2026-05-05
Piston API → Judge0 CE. Pipeline: started → running. Создан TECH_DEBT.md.

### Сессия 6 — 2026-05-06
Pipeline end-to-end: completed + summary + KPI + график. TD-002 закрыт. UI переписан — тёмная premium тема, DM Sans, shimmer accent line. DESIGN.md создан. Протестировано на test.csv — результат корректный. Мелкие баги: KPI 2/4, скролл чата.
