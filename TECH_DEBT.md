# SG Analytics Engine — Реестр технического долга

> Читается Claude в начале каждой сессии — сразу после PROJECT_STATUS.md.
> Каждый активный долг имеет маркер TODO_TEMP в коде.

---

## АКТИВНЫЕ ДОЛГИ

### TD-001 | Claude API вместо Kimi K2.6
- **Файл:** worker/src/kimi.ts, строки с baseUrl и model
- **Маркер в коде:** `// TODO_TEMP TD-001`
- **Текущее:** claude-sonnet-4-5 через Anthropic API
- **Вернуть:** baseUrl = 'https://api.deepinfra.com/v1/openai', model = 'moonshotai/Kimi-K2-Instruct'
- **Триггер возврата:** Пополнить баланс DeepInfra (~$10) → проверить DEEPINFRA_API_KEY в Cloudflare secrets
- **Влияние:** Стоимость в 20 раз выше при масштабе; медленнее чем Kimi

### TD-002 | MAX_ITERATIONS = 5 вместо 10
- **Файл:** worker/src/orchestrator.ts, константа maxIter
- **Маркер в коде:** `// TODO_TEMP TD-002`
- **Текущее:** Жёсткий cap на 5 итераций
- **Вернуть:** maxIter = 10 после переключения на Kimi K2.6 (TD-001) — Kimi быстрее, укладывается в DO CPU лимит
- **Триггер возврата:** После закрытия TD-001
- **Влияние:** Качество анализа ниже — 5 итераций вместо 10

### TD-003 | Таймауты 15s в orchestrator.ts
- **Файл:** worker/src/orchestrator.ts, метод withTimeout
- **Маркер в коде:** `// TODO_TEMP TD-003`
- **Текущее:** Schema 15s, Kimi 15s, Judge0 15s, summary 20s
- **Вернуть:** Оценить после стабилизации — возможно оставить как есть
- **Триггер возврата:** После 3 успешных тестов подряд
- **Влияние:** При медленном Judge0 или Claude анализ может обрываться

---

## ЗАКРЫТЫЕ ДОЛГИ

### TD-000 | Piston API → Judge0 CE | Закрыто 2026-05-05
- **Было:** Piston API (emkc.org) — закрылся 15.02.2026
- **Стало:** Judge0 CE (ce.judge0.com) — без ключа, без карты

### TD-004 | btoa/atob не поддерживают Unicode | Закрыто 2026-05-06
- **Было:** btoa(csvContent) падал на кириллице и Unicode
- **Стало:** TextEncoder/TextDecoder — корректная работа с любым Unicode
