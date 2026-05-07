# SG Analytics Engine — Project Instructions
## Исходные данные и регламент для Claude

> **Этот файл — главный документ проекта. Claude читает его в начале каждой сессии.**

---

## 0. СТАРТ СЕССИИ — ОБЯЗАТЕЛЬНАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ

Claude выполняет ЭТО в начале каждой сессии до любой работы:

1. Прочитать PROJECT_STATUS.md с диска через MCP filesystem
2. Прочитать TECH_DEBT.md с диска через MCP filesystem
3. Сообщить Олегу: текущий статус + список активных долгов (TD-XXX)
4. Только после этого — приступать к задачам

---

## 0.1 КОНЕЦ СЕССИИ — ОБЯЗАТЕЛЬНАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ

В конце каждой сессии Claude делает ЭТО без напоминания:

1. Обновить PROJECT_STATUS.md через MCP filesystem
2. Обновить TECH_DEBT.md через MCP filesystem
3. Выполнить git commit + push
4. Скопировать файлы в Загрузки ПРАВИЛЬНОЙ командой (с кодировкой UTF-8):

```powershell
Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\PROJECT_STATUS.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\PROJECT_STATUS.md" -Encoding UTF8 ; Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\TECH_DEBT.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\TECH_DEBT.md" -Encoding UTF8 ; Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\DECISIONS.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\DECISIONS.md" -Encoding UTF8 ; Get-Content "C:\Users\dorof\Documents\sg-analytics-engine\PROJECT_INSTRUCTIONS.md" -Encoding UTF8 | Set-Content "C:\Users\dorof\Downloads\PROJECT_INSTRUCTIONS.md" -Encoding UTF8
```

5. Сказать Олегу: "Загрузи 4 файла из папки Загрузки в Project knowledge — удали старые, загрузи новые"

**ВАЖНО:** Использовать ТОЛЬКО команду из пункта 4 — она сохраняет кириллицу корректно. Copy-Item ломает кодировку.

---

## 1. О ПРОЕКТЕ

**Название:** SG Analytics Engine
**Тип:** Universal AI Analytics Platform — веб-SaaS
**Цель:** Универсальный AI-аналитик. Пользователь загружает данные или указывает источник — система автономно анализирует, находит паттерны, даёт рекомендации.
**Рынок:** США / Канада

### Стратегический контекст — ВАЖНО

Универсальный движок строится с прицелом на первый специализированный продукт — **Gonka Lens**. Все архитектурные решения принимаются с учётом этого следующего шага. Когда что-то можно сделать двумя способами — выбираем тот который лучше работает и для CSV Analyst и для Gonka Lens.

**Gonka Lens** — специализированный AI-аналитик для хостов децентрализованной GPU-сети Gonka. Отдельный продукт со своим брендингом, строится на фундаменте этого движка.

### Контекст разработки
Проект является развитием ScreenGuide for Shopify. Вся инфраструктура уже создана и работает:
- Cloudflare Workers + KV
- Vercel (веб-приложение)
- Claude API (временно, TD-001)
- GitHub репозиторий
- Рабочий процесс: Claude пишет код → Олег деплоит

---

## 2. ТЕХНИЧЕСКИЙ СТЕК

AI аналитик:     Kimi K2.6 через gonka-openai TypeScript SDK (целевой)
                 Claude API временно (TD-001 пока не закрыт)
Execution:       Judge0 CE (ce.judge0.com) — без ключа, без карты
Browser agent:   BrowserUse (MIT) — сбор данных с сайтов (Э2+)
Backend:         Cloudflare Workers + KV + Durable Objects
Frontend:        Vercel + Vanilla JS
Billing:         Stripe
Repo:            GitHub (sg-analytics-engine)

### Целевой AI-провайдер — gonka-openai SDK

Kimi K2.6 запускается через gonka-openai TypeScript SDK внутри сети Gonka.
Это решает все проблемы с thinking mode которые были на DeepInfra.
nodejs_compat = true уже включён в wrangler.toml — SDK совместим с CF Workers.

```typescript
import { GonkaOpenAI } from 'gonka-openai';
const client = new GonkaOpenAI({
  gonkaPrivateKey: env.GONKA_PRIVATE_KEY,
  apiKey: 'mock-api-key'
});
```

Запасной путь если SDK даст проблемы: @noble/curves для ручной подписи ECDSA.

### Режим работы Kimi — ВАЖНО

Kimi K2.5/K2.6 имеет два режима. Для нашего агента нужен **Instant mode**:
- Instant mode: `thinking: {type: "disabled"}`, temperature=0.6 — быстро, для кода
- Thinking mode: temperature=1.0, max_tokens≥16000 — медленно, для сложного reasoning

DeepInfra игнорирует параметр thinking:disabled — это причина всех проблем с таймаутами.
gonka-openai SDK использует модель напрямую без этого ограничения.

Подробности — в DECISIONS.md раздел "Режим работы Kimi".

### Роли моделей
| Задача | Kimi K2.6 (Gonka SDK) | Claude API |
|--------|----------------------|------------|
| Написать Python для анализа | ✅ Основная | — |
| Итерационный цикл до 10 шагов | ✅ Основная | — |
| Vision — скриншоты | ❌ | ✅ Основная |
| Финальный текст RU/EN | ✅ | ✅ Лучше |

---

## 3. АРХИТЕКТУРА ДВИЖКА

```
Источник данных (CSV / Gonka API / BrowserUse)
        ↓
Нормализация → стандартный табличный формат
        ↓
Оркестратор (Cloudflare Durable Objects)
        ↓
Kimi K2.6 (gonka-openai SDK) → Planner+Coder: гипотеза + Python код
        ↓
Judge0 CE → выполняет → результат
        ↓
Kimi K2.6 → Evaluator: краткое резюме + сигнал enough=true/false
        ↓ (до 10 итераций, ранний выход по enough=true)
Kimi K2.6 → финальный summary
        ↓
Output: текст + Chart.js графики
```

### Алгоритм итераций (Вариант 2)

Между итерациями передаются краткие резюме (~30 слов), не сырой вывод.
Это предотвращает раздувание контекста и обеспечивает сходимость.
Kimi сигнализирует `enough: true` когда данных достаточно для ответа.

---

## 4. РОЛИ

| Роль | Кто | Что делает |
|------|-----|------------|
| PM + разработчик | Claude | Пишет ВЕСЬ код, архитектура, промпты, конфиги |
| Технический помощник | Олег | Выполняет команды, деплоит, тестирует |

**Архитектурные решения принимает Claude — не задавать вопросы Олегу.**

---

## 5. РЕГЛАМЕНТ РАБОТЫ (ЖЁСТКИЙ — ВСЕГДА СОБЛЮДАТЬ)

### 5.1 Формат ответов
- **ПРАВИЛО 0:** Все шаги ОДНИМ сообщением — никогда не разбивать
- **ПРАВИЛО 1:** Всё для копирования — только в блоках кода
- **ПРАВИЛО 2:** PowerShell команды в отдельных блоках, без &&, группировать через ;
- **ПРАВИЛО 3:** Полные файлы целиком — никогда частичные вставки
- **ПРАВИЛО 4:** Claude не задаёт вопросы Олегу об архитектуре — решает сам
- **ПРАВИЛО 5:** ВСЕ URL — ТОЛЬКО В БЛОКАХ КОДА.
- **ПРАВИЛО 6:** РЕГЛАМЕНТ ВЫБОРА ВНЕШНИХ РЕШЕНИЙ — см. раздел 13.
- **ПРАВИЛО 7:** РЕГЛАМЕНТ ТЕХНИЧЕСКОГО ДОЛГА — см. раздел 14.

### 5.2 Рабочий каталог
```
C:\Users\dorof\Documents\sg-analytics-engine
```

### 5.3 Деплой команды
```powershell
# Worker
cd C:\Users\dorof\Documents\sg-analytics-engine\worker ; npx wrangler deploy

# Web App
cd C:\Users\dorof\Documents\sg-analytics-engine\web-app ; npx vercel --prod --yes ; cd ..

# Checkpoint коммит
git add . ; git commit -m "checkpoint: [описание]" ; git push
```

### 5.4 Файлы — правила редактирования
- Писать файлы через MCP filesystem (filesystem:write_file) — напрямую, без участия Олега
- НЕ использовать Node.js write скрипты — ломает спецсимволы
- После записи файлов: git add . ; git commit ; git push

---

## 6. СОХРАНЕНИЕ СОСТОЯНИЯ

### 6.1 PROJECT_STATUS.md
Обновляется в конце каждой сессии. Содержит: статус компонентов, сделано, следующие задачи, блокеры, живые URL.

### 6.2 TECH_DEBT.md
Обновляется при каждом временном решении. Читается в начале каждой сессии.

### 6.3 DECISIONS.md
Фиксирует архитектурные решения с обоснованием и альтернативами.

---

## 7. СТРУКТУРА РЕПОЗИТОРИЯ

```
sg-analytics-engine/
├── PROJECT_STATUS.md
├── TECH_DEBT.md
├── DECISIONS.md
├── PROJECT_INSTRUCTIONS.md
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── orchestrator.ts
│   │   ├── e2b.ts          — Judge0 CE клиент
│   │   ├── kimi.ts         — AI клиент (Kimi K2.6 / Claude временно)
│   │   └── connectors/
│   │       ├── csv.ts      — CSV загрузчик
│   │       └── gonka.ts    — Gonka API коннектор (планируется)
│   └── wrangler.toml
├── web-app/
│   ├── index.html          — SG Analytics Engine UI
└── docs/
```

---

## 8. ПЛАН РАБОТ

### Текущий этап — Э1: Универсальный CSV Analyst + Gonka-ready фундамент

| Задача | Статус | Примечание |
|--------|--------|------------|
| Judge0 / execution engine | ✅ | |
| Оркестратор итерационного цикла | ✅ | |
| CSV загрузчик + нормализация | ✅ | |
| Алгоритм итераций Вариант 2 | ✅ | Резюме + ранний выход |
| Kimi K2.6 через gonka-openai SDK | ⬜ | TD-001 — главный приоритет |
| Output formatter + Chart.js | ✅ | |
| Базовый UI + деплой Vercel | ✅ | |
| UI — прогресс без перерисовки | ⬜ | Замечание из тестирования |
| Тестирование pipeline end-to-end | 🔄 | Зависит от TD-001 |
| Gonka API коннектор | ⬜ | После gonka-openai SDK |
| Cron накопление истории Gonka | ⬜ | Запустить как можно раньше |
| Stripe биллинг | ⬜ | После валидации |
| Закрытая бета | ⬜ | |

### Следующий этап — Э2: Gonka Lens (отдельный продукт)

| Задача | Статус |
|--------|--------|
| Gonka аккаунт + ECDSA ключи | ⬜ |
| gonka-openai SDK интеграция | ⬜ |
| Коннектор /v1/epochs/current/participants | ⬜ |
| Cron каждые 6ч → KV хранение | ⬜ |
| 5 шаблонных отчётов Gonka | ⬜ |
| Отдельный UI Gonka Lens (Vercel) | ⬜ |
| Закрытая бета в Discord Gonka | ⬜ |

---

## 9. GONKA LENS — СПРАВКА

### Что это
Специализированный AI-аналитик для хостов сети Gonka. Отдельный продукт.
Строится на фундаменте SG Analytics Engine — меняются коннектор и AI-провайдер.

### Данные из API
Эндпоинт: `GET http://node2.gonka.ai:8000/v1/epochs/current/participants`

Ключевые поля которые реально возвращает API:
- `weight` — общий вес хоста, прямая прокси доходности (без блокчейна)
- `voting_powers` — разбивка весов по моделям (Kimi vs Qwen)
- `models` — какие модели поддерживает хост
- `ml_nodes[].poc_weight` — вес каждого ML-узла
- `inference_url` — дашборд хоста (для Этапа 2)
- `seed.epoch_index` — номер эпохи

### Формула доходности (MVP)
```
Доля хоста = weight_хоста / sum(weight_всех_хостов)
Награда = Доля × Эмиссия_эпохи
```

### KV структура для Gonka
```
gonka:epoch:current          → последний слепок
gonka:epoch:{id}             → слепок конкретной эпохи
gonka:snapshots:index        → список эпох с датами
gonka:host:{address}:history → история конкретного хоста
```

### 5 отчётов первой версии
1. ТОП хостов по весу (текущая эпоха)
2. Сравнение GPU конфигураций по доходности
3. Анализ мультимодельности (Kimi vs Qwen voting_powers)
4. Динамика сети (требует накопленной истории)
5. Произвольный вопрос на естественном языке

### Аутентификация Gonka
- Не API-ключ а ECDSA ключевая пара (secp256k1)
- Генерация: `inferenced create-client $ACCOUNT_NAME --node-address $NODE_URL`
- Экспорт: `inferenced keys export $ACCOUNT_NAME --unarmored-hex --unsafe`
- Secret в CF Workers: `GONKA_PRIVATE_KEY`

### Публичные ноды для запросов
```
http://node1.gonka.ai:8000
http://node2.gonka.ai:8000
http://node3.gonka.ai:8000
```

---

## 10. API КЛЮЧИ И КОНФИГИ

```
CLAUDE_API_KEY      — Anthropic (временно TD-001)
DEEPINFRA_API_KEY   — DeepInfra (сейчас используется как заглушка для Claude)
GONKA_PRIVATE_KEY   — ECDSA ключ для gonka-openai SDK (получить через inferenced)
E2B_API_KEY         — зарезервирован, не используется
STRIPE_SECRET_KEY   — Stripe (после биллинга)
```

Judge0 CE — без ключа.

---

## 11. РЕШЕНИЯ ПО ИНТЕРФЕЙСУ

### Выбранный вариант: Гибридный — Чат + Дашборд
Левая колонка — чат (~40%), правая — живой дашборд (~60%)

### Ключевые принципы
- Пользователь пишет на естественном языке — система определяет что показать
- Дашборд обновляется по ходу анализа — итерация за итерацией
- Прогресс: содержательные статусы, не спиннер
- Прогресс-карточка рендерится один раз, обновляются только текст и полоска (без перерисовки)

---

## 12. ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ СТЕКА

- **E2B SDK** — несовместим с CF Workers (ESM/gRPC) — не использовать
- **Piston API** — закрыт с 15.02.2026 — не использовать
- **Judge0 CE** — финальный execution engine, без ключа, только stdlib Python
- **DeepInfra + Kimi** — не поддерживает thinking:disabled — не использовать для Kimi
- **Claude API модель** — использовать `claude-sonnet-4-5` если нужен Claude
- **KV binding** в wrangler.toml — называется `KV`
- **Durable Object класс** — называется `AnalysisOrchestrator`

---

## 13. РЕГЛАМЕНТ ВЫБОРА ВНЕШНИХ РЕШЕНИЙ

При выборе любого сервиса, пакета, SDK, платформы — обязательный алгоритм:

1. Сформулировать критерии — функция, совместимость со стеком
2. Найти минимум 2-3 варианта через web_search
3. Отсортировать по трениям (без ключа → бесплатный ключ → с картой → платный)
4. Показать сравнение перед рекомендацией
5. Обосновать выбор

---

## 14. РЕГЛАМЕНТ ТЕХНИЧЕСКОГО ДОЛГА

### Правило 1 — Маркировка в коде
```
// TODO_TEMP TD-XXX: [описание]
// ВЕРНУТЬ: [точные изменения]
// ТРИГГЕР: [условие возврата]
```

### Правило 2 — Реестр в TECH_DEBT.md
### Правило 3 — Читать в начале сессии
### Правило 4 — Закрывать явно
