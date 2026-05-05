# SG Analytics Engine — Статус проекта
**Этап:** Э1 — Универсальный CSV Analyst
**Обновлено:** 2026-05-04
**Сессия:** 0 (инициализация)

---

## Репозиторий
- GitHub: github.com/[username]/sg-analytics-engine
- Папка: C:\Users\dorof\Documents\sg-analytics-engine
- Ветка: main

---

## КРИТИЧНО — Команды запуска и деплоя

```powershell
# Рабочий каталог
cd C:\Users\dorof\Documents\sg-analytics-engine

# Деплой Worker
npx wrangler deploy

# Деплой Web App
cd web-app ; npx vercel --prod --yes ; cd ..

# Checkpoint коммит
git add . ; git commit -m "checkpoint: [описание]"
```

---

## КРИТИЧНО — Правила работы с файлами
- Все файлы через GitHub (карандаш → Ctrl+A → вставить → Commit)
- НЕ писать через Node.js скрипты — ломает спецсимволы
- После GitHub коммита: git pull

---

## Текущее состояние компонентов

| Компонент | Статус | Комментарий |
|-----------|--------|-------------|
| Репозиторий | ⬜ Не создан | Создать sg-analytics-engine |
| E2B интеграция | ⬜ | Нужен API ключ |
| Kimi K2.6 (Gonka AI) | ⬜ | Нужен API ключ |
| Оркестратор итераций | ⬜ | |
| CSV загрузчик | ⬜ | |
| Output formatter | ⬜ | |
| Базовый UI | ⬜ | |
| Stripe биллинг | ⬜ | |
| Деплой Vercel | ⬜ | |

---

## Живые URL
- Web App: [заполнить после деплоя]
- Worker: [заполнить после деплоя]

---

## API ключи (нужно получить)
- [ ] E2B API key — e2b.dev
- [ ] Kimi K2.6 key — Gonka AI или DeepInfra
- [ ] Claude API key — уже есть из ScreenGuide
- [ ] Stripe — уже есть из ScreenGuide

---

## Следующие задачи (по приоритету)
1. Создать репозиторий sg-analytics-engine
2. Получить E2B API ключ
3. Получить Kimi K2.6 API ключ
4. Начать День 1: E2B интеграция в Worker

---

## История сессий

### Сессия 0 — 2026-05-04 (инициализация)
**Сделано:**
- Разработана концепция продукта
- Выбран технический стек: Kimi K2.6 + E2B + Claude Vision
- Создан PROJECT_INSTRUCTIONS.md
- Создан PROJECT_STATUS.md
- Создана инструкция по открытию проекта

**Следующая сессия:**
- Начать с создания репозитория и Дня 1
