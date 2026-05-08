# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst + Gonka-ready фундамент
**Обновлено:** 2026-05-08
**Сессия:** 10

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
Web App:    cd C:\Users\dorof\Documents\sg-analytics-engine\web-app ; npx vercel --prod --yes
Checkpoint: git add . ; git commit -m "checkpoint: [описание]" ; git push

---

## Текущее состояние компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Репозиторий | ✅ | github.com/privatedeskai/sg-analytics-engine |
| Worker деплой | ✅ | /status, /analyze, /result/:id |
| KV хранилище | ✅ | сессии пишутся и читаются корректно |
| Оркестратор | ✅ | AnalysisOrchestrator, 10 итераций, алгоритм Вариант 2 |
| Judge0 CE | ✅ | ce.judge0.com, polling по статусу, ~2 сек |
| kimi.ts (llm.ts) | ✅ | Qwen3-235B через Gonka node4, прямой вызов без прокси |
| ECDSA подпись | ✅ | @noble/curves, secp256k1, lowS, compact base64 |
| CSV загрузчик | ✅ | connectors/csv.ts |
| Output formatter | ✅ | output.ts |
| Алгоритм итераций | ✅ | Вариант 2: резюме + ранний выход по enough=true |
| UI — базовый | ✅ | тёмная тема, DM Sans, shimmer accent |
| UI — дашборд результатов | ✅ | переключается на результат после completed |
| UI — resizer | ✅ | drag между чатом и дашбордом работает |
| UI — график | ⚠️ | не отображается когда модель возвращает строки вместо чисел (TD-008) |
| UI — прогресс без перерисовки | ✅ | обновляются только текст и полоска |
| vercel.json Cache-Control | ✅ | no-store для HTML |
| DESIGN.md | ✅ | дизайн-система зафиксирована в репо |
| DECISIONS.md | ✅ | все решения задокументированы |
| Gonka API коннектор | ⬜ | connectors/gonka.ts — не начат |
| Cron накопление истории Gonka | ⬜ | не начат — каждый день промедления потеря истории |
| Stripe биллинг | ⬜ | не начат |

---

## Активные технические долги

| ID | Описание | Триггер возврата |
|----|----------|-----------------|
| TD-003 | Таймауты в orchestrator.ts — оценить после стабилизации | После 3 успешных тестов подряд |
| TD-006 | @cosmjs/crypto security warning в gonka-openai SDK | Выход gonka-openai 0.3.x+ |
| TD-007 | kimi.ts — переименовать в llm.ts, логи [KIMI] → [LLM] | Следующая сессия |
| TD-008 | График пустой когда output содержит строки вместо чисел | Следующая сессия |

Подробности — в TECH_DEBT.md

---

## Что сделано в сессии 10

### Главный результат — TD-007 закрыт
- kimi.ts переписан: прямой вызов Gonka API из CF Worker без Vercel прокси
- ECDSA подпись через @noble/curves: secp256k1.sign возвращает Uint8Array напрямую (compact 64 байта)
- Схема подписи: SHA256(body + timestampNs + providerAddress) → compact base64
- Заголовки: Authorization, X-Requester-Address, X-Timestamp
- Fallback по нодам: node4 → node1 → node2 → node3

### Тестирование моделей
- **Kimi-K2.6** на node4.gonka.ai → chars=0 (модель недоступна на этой ноде)
- **Qwen/Qwen3-235B-A22B-Instruct-2507-FP8** на node4.gonka.ai → работает, 6-15 сек на итерацию, ранний выход

### Judge0 ускорение
- Было: wait=true + фиксированный таймаут 15 сек → реально 25-30 сек
- Стало: async polling по статусу 500ms интервал → реально 2 сек
- Orchestrator: жёсткие таймауты → потолки (ceiling) как страховка

### UI исправления
- Дашборд переключается на результат после completed ✅
- Poll останавливается при completed (флаг done) ✅
- Resizer между панелями — drag работает ✅
- vercel.json Cache-Control no-store для HTML ✅
- Парсинг Python dict с одинарными кавычками → JSON ✅

### Производительность
- Полный pipeline: ~25 сек (было ~38 сек)
- Judge0: ~2 сек (было ~25 сек)
- Qwen на Gonka: 6-15 сек на итерацию

---

## Первые шаги сессии 11

### Приоритет 1 — TD-007: переименование
- kimi.ts → llm.ts (или оставить kimi.ts но исправить логи)
- Логи [KIMI] → [LLM] или [QWEN]

### Приоритет 2 — TD-008: график
- buildChartData: поддержка когда result содержит {category: 'growth'/'decline'}
- Показывать bar chart с +1/-1 или цветовую легенду растущих/падающих

### Приоритет 3 — Gonka коннектор + Cron
- Каждый день промедления — потерянная история эпох которую не восстановить
- GET http://node2.gonka.ai:8000/v1/epochs/current/participants
- Cron каждые 6ч → KV: gonka:epoch:{id}

---

## ВАЖНО — обновление Project Knowledge в конце сессии
```powershell
Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\PROJECT_STATUS.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\PROJECT_STATUS.md" -Encoding UTF8 ; Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\TECH_DEBT.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\TECH_DEBT.md" -Encoding UTF8 ; Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\DECISIONS.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\DECISIONS.md" -Encoding UTF8 ; Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\PROJECT_INSTRUCTIONS.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\PROJECT_INSTRUCTIONS.md" -Encoding UTF8
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
Pipeline end-to-end: completed + summary + KPI + график. UI переписан — тёмная premium тема, DM Sans, shimmer accent. DESIGN.md создан.

### Сессия 7 — 2026-05-06
Unicode-safe base64, исправлен kimi.ts, UI poll timeout 10 минут, orchestrator MAX_ITERATIONS=5.

### Сессия 8 — 2026-05-06
Диагностика: найдена корневая причина — thinking mode съедает все токены на DeepInfra.
DeepInfra игнорирует thinking:disabled. Решение: gonka-openai SDK (TD-001).
Утверждена концепция Gonka Lens. Все документы обновлены.

### Сессия 9 — 2026-05-07
GONKA_PRIVATE_KEY сгенерирован. Vercel прокси архитектура реализована.
Найдена реальная структура Gonka API: response.active_participants[0].participants[N].

### Сессия 10 — 2026-05-08
TD-007 закрыт: прямой вызов Gonka API через @noble/curves ECDSA.
Модель переключена на Qwen3-235B (Kimi недоступна на node4).
Judge0 ускорен с 25 сек до 2 сек через polling по статусу.
UI: дашборд работает, resizer работает, poll останавливается корректно.
