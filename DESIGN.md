# SG Analytics Engine — Дизайн-система

> Все дизайн-решения зафиксированы здесь и в SG_Analytics_Engine_UI_Mockups.html
> Открой UI_Mockups.html в браузере — там визуальный референс всех компонентов.

---

## Цветовая палитра

| Назначение | HEX | Где используется |
|------------|-----|-----------------|
| Primary (тёмно-синий) | `#1A3A6B` | Кнопки, заголовки, акценты, send button |
| Primary Light | `#378ADD` | Ссылки, border-left у AI сообщений, иконки |
| Background | `#F5F5F5` | Фон страницы |
| Surface | `#FFFFFF` | Карточки, KPI блоки |
| Surface Alt | `#FAFAFA` | Фон дашборда |
| Border | `#E0E0E0` | Границы карточек |
| Border Light | `#EEEEEE` | Внутренние разделители |
| Text Primary | `#222222` | Основной текст |
| Text Secondary | `#888888` | Подписи, метки |
| Text Placeholder | `#AAAAAA` | Placeholder в input |
| Success | `#1D9E75` | Прогресс-dot, позитивные метрики |
| Success BG | `#EAF3DE` | Бейджи "Готов" |
| Success Text | `#27500A` | Текст на success BG |
| Error | `#E24B4A` | Негативные бары, метрики вниз |
| Error Text | `#A32D2D` | Текст негативных метрик |
| Warning BG | `#FAEEDA` | Бейджи алертов |
| Warning Text | `#633806` | Текст на warning BG |
| Info BG | `#E6F1FB` | AI сообщения, info бейджи |
| Info Text | `#0C447C` | Текст на info BG |
| Neutral BG | `#E8E8E8` | Серые бейджи |
| Neutral Text | `#555555` | Текст на neutral BG |

---

## Типографика

| Элемент | Размер | Вес | Цвет |
|---------|--------|-----|------|
| Page title | 24px | 500 | #1A3A6B |
| Page subtitle | 13px | 400 | #888 |
| Section label | 11px | 500 | #888, uppercase, letter-spacing 0.06em |
| KPI значение | 17px | 500 | #222 |
| KPI label | 10px | 400 | #888 |
| Сообщение чата | 11px | 400 | #222 / #1A3A6B |
| Кнопки | 11px | 400 | — |
| Meta / timestamp | 10px | 400 | #888 |

**Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`

---

## Компоненты

### Карточка (mock)
- background: #fff
- border: 1px solid #E0E0E0
- border-radius: 12px
- overflow: hidden

### Заголовок карточки (mock-header)
- background: #F8F8F8
- padding: 8px 14px
- font-size: 11px, color: #888
- border-bottom: 1px solid #E8E8E8
- Три точки: красная #FF5F57, жёлтая #FEBC2E, зелёная #28C840

### KPI блок
- background: #fff
- border: 1px solid #EEEEEE
- border-radius: 8px
- padding: 8px 10px
- Сетка: grid-template-columns: 1fr 1fr, gap: 6px

### Сообщение пользователя
- background: #F0F0F0
- border-radius: 8px
- padding: 7px 10px
- font-size: 11px
- align-self: flex-end (выравнивание вправо)

### Сообщение AI
- background: #E8F0FE
- border-radius: 8px
- border-left: 2px solid #378ADD
- padding: 7px 10px
- font-size: 11px, color: #1A3A6B
- line-height: 1.5

### Прогресс-бар итераций
- background: #F0F0F0
- border-radius: 6px
- padding: 7px 10px
- font-size: 10px, color: #555
- Анимированная точка: 6x6px, background #1D9E75, pulse анимация

### Поле ввода чата
- border: 1px solid #DDD
- border-radius: 8px
- padding: 5px 10px
- background: #fff

### Кнопка Send
- 22x22px
- border-radius: 5px
- background: #1A3A6B
- SVG стрелка белая

### Кнопки (btn-sm)
- font-size: 11px
- padding: 4px 10px
- border-radius: 6px
- border: 1px solid #D8D8D8
- background: #fff, color: #333

### Кнопка Primary (btn-sm-primary)
- background: #1A3A6B
- color: #fff
- border-color: #1A3A6B

### Карточка шаблона (tpl-card)
- background: #fff
- border: 1px solid #EEEEEE
- border-radius: 10px
- padding: 10px 14px
- display: flex, align-items: center, gap: 10px

### Иконка шаблона (tpl-icon)
- 34x34px
- border-radius: 8px
- Зелёная: background #E8F5E9
- Синяя: background #E6F1FB
- Жёлтая: background #FFF8E1

### Бейдж (badge)
- font-size: 10px
- padding: 2px 8px
- border-radius: 4px
- font-weight: 500

---

## Лэйаут — Гибридный интерфейс (Э1)

```
┌─────────────────────────────────────────┐
│  Чат (~40% / 270px)  │  Дашборд (~60%)  │
│                      │                  │
│  История диалога     │  KPI метрики     │
│  Прогресс итераций   │  2x2 сетка       │
│  Поле ввода          │  График          │
└─────────────────────────────────────────┘
```

- Чат: width 270px, flex-shrink 0, border-right 1px solid #EEEEEE
- Дашборд: flex 1, background #FAFAFA
- Высота блока: 360px
- Разделитель: 1px solid #EEEEEE

---

## Визуальный референс

Открыть в браузере:
```
C:\Users\dorof\Documents\sg-analytics-engine\SG_Analytics_Engine_UI_Mockups.html
```

Содержит 5 мокапов:
1. Гибридный интерфейс (чат + дашборд) — **выбранный вариант Э1**
2. Сохранение шаблона из чата
3. Дашборд шаблонов
4. История отчётов
5. Два режима запуска (быстрый / полный)
