# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst + Gonka-ready фундамент
**Обновлено:** 2026-05-06
**Сессия:** 8

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
| Оркестратор | ✅ | AnalysisOrchestrator, 10 итераций, алгоритм Вариант 2 |
| Judge0 CE | ✅ | ce.judge0.com, без ключа |
| kimi.ts | ⚠️ | Kimi K2.5 на DeepInfra — thinking mode не отключается (TD-001) |
| CSV загрузчик | ✅ | connectors/csv.ts |
| Output formatter | ✅ | output.ts |
| Алгоритм итераций | ✅ | Вариант 2: резюме между итерациями + ранний выход |
| Диагностическое логирование | ✅ | SSE chunks, TTFT, reasoning_chunks, usage stats |
| e2b.ts | ✅ | Unicode-safe base64 (TextEncoder/TextDecoder) |
| UI — базовый | ✅ | тёмная тема, DM Sans, shimmer accent |
| UI — прогресс без перерисовки | ⬜ | замечание из тестирования сессии 8 |
| DESIGN.md | ✅ | дизайн-система зафиксирована в репо |
| DECISIONS.md | ✅ | Instant vs Thinking mode задокументирован |
| Gonka API коннектор | ⬜ | connectors/gonka.ts — не начат |
| Cron накопление истории Gonka | ⬜ | не начат |
| Stripe биллинг | ⬜ | не начат |

---

## Активные технические долги

| ID | Описание | Триггер возврата |
|----|----------|-----------------|
| TD-001 | Kimi на DeepInfra не работает (thinking mode) → нужен gonka-openai SDK | Получить GONKA_PRIVATE_KEY через inferenced CLI |
| TD-003 | Таймауты в orchestrator.ts — оценить после стабилизации | После 3 успешных тестов подряд |

Подробности — в TECH_DEBT.md

---

## Что сделано в сессии 8

### Диагностика AI-провайдера (главный результат сессии)
- Найдена корневая причина всех проблем: Kimi K2.5/K2.6 — thinking модель
- Thinking mode включён по умолчанию и тратит все токены на reasoning_content
- DeepInfra игнорирует параметр `thinking: {type: "disabled"}` — баг провайдера
- Итерации 2+ возвращают content_chars=0, reasoning_chunks=1400+ при max_tokens=1500
- Добавлено детальное SSE логирование: TTFT, chunks, reasoning_chunks, usage stats

### Стратегическое решение
- Принято решение перейти на gonka-openai TypeScript SDK как целевой AI-провайдер
- SDK совместим с CF Workers (nodejs_compat=true уже включён)
- Kimi K2.6 через Gonka — решает thinking mode, бесплатно, стратегически правильно

### Gonka Lens — концепция утверждена
- Разработана и зафиксирована полная концепция Gonka Lens
- Проверен реальный JSON от Gonka API: weight, voting_powers, models — всё для MVP
- Архитектура и план до первой версии задокументированы в PROJECT_INSTRUCTIONS.md
- Gonka Lens — отдельный продукт, строится на фундаменте этого движка

### Технические правки
- wrangler.toml: MAX_ITERATIONS="5" (было "10") — исправлен root cause бага 4/10
- orchestrator.ts: KIMI_TIMEOUT_MS=30000, алгоритм Вариант 2
- DECISIONS.md: задокументированы Instant vs Thinking mode, архитектура агента

---

## Первые шаги сессии 9

### Приоритет 1 — Закрыть TD-001: gonka-openai SDK

1. Установить inferenced CLI (Linux/WSL):
```bash
# Скачать с https://gonka.ai/docs/developer/quickstart/
chmod +x inferenced
inferenced create-client sg-analytics --node-address http://node2.gonka.ai:8000
inferenced keys export sg-analytics --unarmored-hex --unsafe
```

2. Добавить ключ в Cloudflare:
```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler secret put GONKA_PRIVATE_KEY
```

3. Установить gonka-openai SDK и переписать kimi.ts:
```powershell
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npm install gonka-openai
```

4. Тест pipeline: загрузить test-analytics.csv, вопрос "Какие категории растут, какие падают?"

### Приоритет 2 — UI: прогресс без перерисовки
Прогресс-карточка рендерится один раз при старте анализа.
При каждом poll обновляются только: текст сообщения, счётчик, ширина полоски.
Без innerHTML = ... на каждом обновлении.

### Приоритет 3 — Gonka коннектор + Cron (запустить накопление истории)
Каждый день промедления — потерянная история эпох которую не восстановить.

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
