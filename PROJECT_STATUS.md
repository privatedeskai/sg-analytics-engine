# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst
**Обновлено:** 2026-05-06
**Сессия:** 7

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
| Оркестратор | ✅ | AnalysisOrchestrator, 5 итераций (TD-002) |
| Judge0 CE | ✅ | ce.judge0.com, без ключа |
| kimi.ts | ✅ | claude-sonnet-4-5 временно (TD-001) |
| CSV загрузчик | ✅ | connectors/csv.ts |
| Output formatter | ✅ | output.ts |
| Pipeline end-to-end | ✅ | completed + summary + KPI + график |
| e2b.ts | ✅ | Unicode-safe base64 (TextEncoder/TextDecoder) |
| UI — базовый | ✅ | тёмная тема, DM Sans, shimmer accent |
| UI — poll timeout | ✅ | 300 попыток × 2 сек = 10 минут |
| UI — extractMetrics | ✅ | универсальный сканер любой JSON структуры |
| UI — скролл чата | ✅ | scrollIntoView к началу нового сообщения |
| DESIGN.md | ✅ | дизайн-система зафиксирована в репо |
| Stripe биллинг | ⬜ | не начат |

---

## Активные технические долги

| ID | Описание | Триггер возврата |
|----|----------|-----------------|
| TD-001 | Claude API вместо Kimi K2.6 | Пополнить DeepInfra ~$10 |
| TD-002 | MAX_ITERATIONS=5 вместо 10 | После переключения на Kimi K2.6 (TD-001) |
| TD-003 | Таймауты 15s в orchestrator.ts | После стабилизации оценить увеличить |

Подробности — в TECH_DEBT.md

---

## Первые шаги сессии 8

1. **Тест pipeline** — задеплоен новый orchestrator (5 итераций, таймауты 15s), нужно проверить что анализ доходит до completed. Загрузить test-analytics.csv, задать вопрос "Какие категории растут, какие падают?"
2. **maxIterations в UI** — в web-app/index.html изменить `maxIterations: 10` на `maxIterations: 5` (строка с JSON.stringify в startAnalysis)
3. **Stripe биллинг** — после успешного теста pipeline

---

## ВАЖНО — обновление Project Knowledge в конце сессии
Скопировать 4 файла в Загрузки и загрузить в Project knowledge:
```powershell
Copy-Item "C:\Users\dorof\Documents\sg-analytics-engine\PROJECT_STATUS.md" "C:\Users\dorof\Downloads\PROJECT_STATUS.md" ; Copy-Item "C:\Users\dorof\Documents\sg-analytics-engine\TECH_DEBT.md" "C:\Users\dorof\Downloads\TECH_DEBT.md" ; Copy-Item "C:\Users\dorof\Documents\sg-analytics-engine\DECISIONS.md" "C:\Users\dorof\Downloads\DECISIONS.md" ; Copy-Item "C:\Users\dorof\Documents\sg-analytics-engine\PROJECT_INSTRUCTIONS.md" "C:\Users\dorof\Downloads\PROJECT_INSTRUCTIONS.md"
```

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
Pipeline end-to-end: completed + summary + KPI + график. TD-002 закрыт. UI переписан — тёмная premium тема, DM Sans, shimmer accent. DESIGN.md создан.

### Сессия 7 — 2026-05-06
- Восстановлен контекст после потери Project Knowledge — разобрались с процессом обновления
- Исправлен e2b.ts: Unicode-safe base64 через TextEncoder/TextDecoder (btoa ломался на кириллице)
- Исправлен kimi.ts: charset=utf-8, промпты Python только на английском
- UI: poll timeout увеличен до 10 минут (300×2s), исправлен extractMetrics (универсальный), исправлен скролл чата
- orchestrator.ts: MAX_ITERATIONS=5, таймауты снижены до 15s — вписывается в DO CPU лимит
- Создан test-analytics.csv — 3 месяца, 5 продуктов, 60 строк, аномалии
- Pipeline застревал на итерации 5/10 — причина: DO CPU лимит ~30s, 10 итераций не вмещались
- Задеплоен финальный fix: 5 итераций × 15s = укладывается в лимит
- Тест не завершён до конца сессии — проверить в начале сессии 8
