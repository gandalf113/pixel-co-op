# 03 - Potwory, fale, trudność

Wersja: 0.3 (2026-11-05)

Liczby to **wartości startowe do balansu**. Zmieniamy je po testach (patrz `05-TEST-PLAN.md`, sekcja "Testy balansu"). Developer powinien trzymać je w jednym pliku konfiguracyjnym (np. `balance.json`), żeby dało się stroić bez grzebania w kodzie.

## 1. Typy potworów

| ID | Nazwa | HP | Obr. | Prędkość (kaf./s) | Atak | Od fali | Drop szansa | Uwagi |
|---|---|---|---|---|---|---|---|---|
| MOB-01 | **Ślimak** (slime) | 30 | 8 | 2.5 | wręcz, co 1 s | 1 | 25% | Mięso armatnie. Powolny. |
| MOB-02 | **Biegacz** | 20 | 6 | 6 | wręcz, co 0.6 s | 2 | 20% | Szybki, słaby. Omija fortyfikacje, szuka dziur. |
| MOB-03 | **Osiłek** | 150 | 25 | 1.8 | wręcz, co 1.5 s; ścianom x2 | 4 | 50% | Niszczy fortyfikacje. Priorytet: hard objecty na drodze. |
| MOB-04 | **Plujka** | 40 | 12 | 2.2 | pocisk, zasięg 7 kaf., co 2 s | 6 | 35% | Trzyma dystans 5 kafelków. Pocisk da się zestrzelić? **[PROPOZYCJA]** nie. Pocisk NIE przechodzi przez ściany. |
| MOB-05 | **Rój** (3 małe naraz) | 10 x 3 | 4 | 4 | wręcz, co 0.8 s | 8 | 10% każdy | Spawnuje się trójkami. Przechodzi przez kolce bez obrażeń? Nie: otrzymuje. |
| MOB-06 | **Boss** | 1200 | 40 | 1.5 | wręcz co 2 s (obszar 2 kaf.) + co 10 s wzywa 4 ślimaki | co 5 fal (5, 10, 15...) | 100% x3 | Niszczy ściany jednym ciosem (100 obr. ścianom). Niewrażliwy na klatkę. Pasek HP na górze ekranu. |

Zachowanie wspólne:

- Potwór idzie do **najbliższego żywego gracza** (powalony liczy się jako cel o niższym priorytecie: tylko gdy brak innych w zasięgu 10 kafelków).
- Pathfinding na siatce kafelków (A* lub flow field od graczy). Przeliczanie co 0.5 s lub po zmianie fortyfikacji.
- Gdy droga zablokowana: Osiłek i Boss atakują ścianę od razu. Reszta szuka obejścia; jeśli obejście > 3x dłuższe lub nie istnieje, atakują najbliższy hard object.
- Potwory nie atakują działek celowo, ale działko stojące na drodze traktują jak hard object.
- Potwory nie kolidują ze sobą sztywno (miękkie rozpychanie), żeby nie blokować się w korytarzach.

## 2. Skalowanie fal

Fala `n` (od 1) ma budżet punktów `B(n)` i skład.

### 2.1 Budżet

```
B(n) = 10 + 6 * n + floor(n^1.5)
```

| Fala | Budżet |
|---|---|
| 1 | 17 |
| 2 | 24 |
| 3 | 33 |
| 5 | 51 |
| 8 | 80 |
| 10 | 101 |
| 15 | 158 |
| 20 | 219 |

Koszt potwora w punktach: Ślimak 1, Biegacz 1.5, Osiłek 6, Plujka 3, Rój (trójka) 3, Boss 0 (dodawany osobno).

### 2.2 Skład

- Losujemy potwory z puli dostępnej od danej fali, aż budżet się skończy. Wagi losowania: Ślimak 50, Biegacz 30, Osiłek 10, Plujka 15, Rój 10 (tylko te, które są odblokowane).
- Od fali 4: min. 1 Osiłek. Od fali 6: min. 1 Plujka.
- Co 5. fala: Boss **plus** 60% normalnego budżetu.
- Skalowanie HP potworów: `HP * (1 + 0.04 * (n - 1))` (fala 10: +36%, fala 20: +76%). Obrażenia bez skalowania (to przerwy i fortyfikacje mają decydować, nie one-shoty).
- Skalowanie z liczbą graczy: budżet `* (0.7 + 0.3 * liczba_graczy)` (1 gracz: 1.0; 2: 1.3; 3: 1.6; 4: 1.9). Liczy się liczba graczy w sesji na starcie (late join nie istnieje; rozłączenie nie zmniejsza budżetu).

### 2.3 Spawn w czasie

- Fala spawnuje potwory w porcjach po `max(3, budżet / 6)` sztuk co 4 s, aż wyczerpie skład. Boss spawnuje się w pierwszej porcji.
- Punkty spawnu: 12 punktów równomiernie na obwodzie mapy. Każda porcja losuje 1-3 punkty (żeby nie szło z jednej strony).
- Fala kończy się, gdy skład jest wyczerpany **i** wszystkie potwory martwe.

## 3. Przerwy między falami

Przerwa `P(n)` po fali `n` rośnie, bo jest więcej dropu do zagospodarowania i więcej do odbudowy.

```
P(n) = 20 + 6 * n     (sekundy), max 120
```

| Po fali | Przerwa |
|---|---|
| 0 (przed 1. falą) | 15 s (stała, na rozejrzenie się) |
| 1 | 26 s |
| 3 | 38 s |
| 5 | 50 s |
| 10 | 80 s |
| 15 | 110 s |
| 17+ | 120 s |

- W przerwie HUD pokazuje odliczanie. Ostatnie 5 s: miganie i sygnał.
- Przyspieszenie przerwy przez "Gotowy" (PRD-LOOP-04) wymaga wszystkich graczy; potem 5 s odliczania.
- W przerwie gracze regenerują +2 HP/s (PRD-PLR-01).

## 4. Suwak trudności: 4 poziomy

Trudność mnoży parametry. Host wybiera w lobby, stała przez sesję.

| Parametr | 1 - Łatwy | 2 - Normalny | 3 - Trudny | 4 - Koszmar |
|---|---|---|---|---|
| HP potworów | x0.7 | x1.0 | x1.4 | x2.0 |
| Obrażenia potworów | x0.6 | x1.0 | x1.3 | x1.8 |
| Budżet fali | x0.8 | x1.0 | x1.25 | x1.5 |
| Prędkość potworów | x0.9 | x1.0 | x1.05 | x1.15 |
| Szansa na drop | x1.3 | x1.0 | x0.85 | x0.7 |
| Długość przerwy | x1.3 | x1.0 | x0.85 | x0.7 |
| HP gracza | 120 | 100 | 100 | 80 |
| Czas do śmierci po powaleniu | 20 s | 10 s | 8 s | 5 s |
| Friendly fire | 10% | 10% | 10% | 10% |

Friendly fire jest stałe na wszystkich poziomach (wymóg produktu).

Nazwy w UI: **Łatwy / Normalny / Trudny / Koszmar**. Suwak z 4 pozycjami i opisem jednym zdaniem pod spodem (np. Koszmar: "Krótkie przerwy, mało dropu, potwory x2 HP").

## 5. Cel balansu (do weryfikacji testami)

- Normalny, 2 graczy, którzy grają pierwszy raz: dochodzą do fali 5-7.
- Normalny, 4 graczy, zgrani: fala 12-15.
- Koszmar, 4 graczy, zgrani: fala 8-10.
- Łatwy, 1 gracz: fala 8+.
- Fala 1 na dowolnym poziomie nie powinna powalić nikogo, kto się rusza.
- Pierwsza ściana powinna dać się postawić już po fali 1 (czyli min. 1 hard object w dropie z fali 1: gwarantowany, jeśli losowanie nie dało).
