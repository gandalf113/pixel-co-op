# 03 - Potwory, fale, trudność

Wersja: 0.20 (2026-11-05)

Liczby to **wartości startowe do balansu**. Zmieniamy je po testach (patrz `05-TEST-PLAN.md`, sekcja "Testy balansu"). Developer powinien trzymać je w jednym pliku konfiguracyjnym (np. `balance.json`), żeby dało się stroić bez grzebania w kodzie.

## 1. Typy potworów

| ID | Nazwa | HP | Obr. | Obr. obiektom / cios | Prędkość (kaf./s) | Atak | Od fali | Drop szansa | Uwagi |
|---|---|---|---|---|---|---|---|---|---|
| MOB-01 | **Ślimak** (slime) | 30 | 8 | 5 | 2.5 | wręcz, co 1 s | 1 | 25% | Mięso armatnie. Powolny. |
| MOB-02 | **Biegacz** | 20 | 6 | 3 | 6 | wręcz, co 0.6 s | 2 | 20% | Szybki, słaby. Omija fortyfikacje, szuka dziur. |
| MOB-03 | **Osiłek** | 150 | 25 | 50 | 1.8 | wręcz, co 1.5 s | 4 | 50% | Niszczy fortyfikacje. Priorytet: hard objecty na drodze. |
| MOB-04 | **Plujka** | 40 | 12 | 6 (pocisk) | 2.2 | pocisk **160 px/s** (R58, 2026-11-06: 250 bylo za szybkie, nie dalo sie uskoczyc), zasięg 7 kaf., co 2 s | 6 | 35% | Trzyma dystans 5 kafelków. Pocisku nie da się zestrzelić. Pocisk NIE przechodzi przez ściany. Celowo wolniejszy niż pociski graczy, żeby dało się uskoczyć. |
| MOB-05 | **Rój** (3 małe naraz) | 10 x 3 | 4 | 2 | 4 | wręcz, co 0.8 s | 8 | 10% każdy | **Zaimplementowany w v0.14.0.** Spawnuje się trójkami: jeden wpis kolejki fali = trzy potwory (`pack: 3`), koszt 2, waga 20, promień 4 px (najmniejszy w grze). Limity `groupMaxMobs` i `maxAliveMobs` liczą **potwory, nie wpisy** — inaczej fala 12 stawiała 105 żywych przy suficie 60. Kolce zadają mu obrażenia normalnie. |
| MOB-06 | **Boss** | 1200 | 40 | 100 | 1.5 | wręcz co 2 s (obszar 2 kaf.) + co 10 s wzywa 4 ślimaki | co 5 fal (5, 10, 15...) | 100% x3 | **Zaimplementowany w v0.14.0.** Cios obszarowy trafia **wszystkich** graczy w promieniu, nie tylko cel. Wezwane ślimaki podlegają sufitowi `maxAliveMobs` (bez tego długa walka zasypywała planszę). Promień ciała 28 px, sylwetka 64 x 64. Niszczy ściany jednym ciosem, niewrażliwy na klatkę, **nigdy nie jest obcinany przez area of interest** (klient musi widzieć jego HP na pasku). Nie przechodzi przez losowanie składu fali — stawiany osobno. |

### 1b. Potwory z Backlogu V3 (zaimplementowane 2026-11-06)

Pelne opisy zachowan: `10-BACKLOG-V3.md` punkt A. Tu sa liczby, bo to jest tabela prawdy dla balansu.

| ID | Nazwa | HP | Obr. | Obr. obiektom | Predkosc | Atak | Od fali | Drop | Koszt | Waga | Kropelki |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MOB-07 | **Granatnik** (64 px sylwetki nie ma, 16 px) | 60 | 18 (wybuch) | 10 | 2.0 | lob 110 px/s, zasieg 10 kaf., co 3 s, wybuch 1.5 kaf. (50% na krawedzi), marker upadku 0.7 s | 9 | 40% | 4 | 8 | 2 |
| MOB-08 | **Skradajacy sie** (32 x 32) | 45 | 14 | 6 | 3.2 | wrecz co 1 s; cykl ukrycie 4-6 s / jawny 3-4 s, w ukryciu **nietykalny** i okraza gracza stycznie | 7 | 35% | 3 | 12 | 2 |
| MOB-09 | **Ninja** (32 x 32) | 70 | 22 | 8 | - | wandering **1.6-3.2 s** -> telegraf **0.85 s** -> szarza **18 kaf./s** po **ustalonej** trajektorii, do **13 kafli**, jedno trafienie na szarze | 8 | 45% | 4 | 8 | 3 |
| MOB-10 | **Tank** (64 x 64) | 600 | 30 | 60 | 1.2 | wrecz; zmienia kolor w 4 progach HP; po smierci **rozpada sie na runnerow** (5/6/8/9 wg trudnosci) | 10 | 60% | 8 | 6 | 5 |

- Granatnik i Plujka strzelaja **wolniej niz pociski gracza** (450 px/s) celowo: 160 i 110 px/s. Uskok ma byc realna odpowiedzia, a nie loteria (R58).
- Potomstwo tanka powstaje poza kolejka spawnu, wiec `mobsLeft` liczy kazdego potwora **razem z jego przyszlym potomstwem**, a fala nie konczy sie, poki runnery zyja.
- Potwory 32 i 64 px wymagaja pathfindingu swiadomego szerokosci: kafelek jest przechodni tylko wtedy, gdy cialo potwora sie w nim miesci. Inaczej duzy potwor stoi w przejsciu i drga.

Zachowanie wspólne:

- Potwór idzie do **najbliższego żywego gracza** (powalony liczy się jako cel o niższym priorytecie: tylko gdy brak innych w zasięgu 10 kafelków).
- **Błądzenie** (feedback z testu silnika 2026-11-05): potwór NIE idzie idealnie po linii. Do kierunku z pathfindingu dodawany jest szum (wander): losowy kąt +/- 35 stopni zmieniany co 0.5-1.5 s, oraz co 4-8 s krótka faza "rozglądania" (1-2 s wolniejszego ruchu w losowym kierunku), o ile gracz jest dalej niż 4 kafelki. W zasięgu 4 kafelków od celu potwór idzie prosto. Biegacz błądzi najmniej (+/- 15 stopni), Ślimak najwięcej (+/- 50). Osiłek i Boss nie mają fazy rozglądania. Efekt ma być widoczny: stado nie tworzy jednej prostej kolejki.
- Pathfinding na siatce kafelków (A* lub flow field od graczy). Przeliczanie co 0.5 s lub po zmianie fortyfikacji.
- **Potwory MUSZĄ powoli niszczyć obiekty graczy** (decyzja właścicieli R30, w MVP). Fortyfikacja kupuje czas, nie daje nieśmiertelności. Zasady:
  - Pathfinding traktuje obiekty graczy (hard objecty, działka, klatki) jako **przechodnie z kosztem**, nie jako mur: koszt kafelka = `HP_obiektu / obr_obiektom_potwora` sekund marszu. Potwór wybiera, co szybsze: obejść czy przegryźć. W praktyce krótkie obejście wybiera, długi mur przegryza.
  - Potwór, który dotyka obiektu gracza leżącego na jego trasie (lub stoi zablokowany przez dowolny obiekt), **atakuje go swoim normalnym rytmem ataku** z obrażeniami z kolumny "Obr. obiektom / cios". Nie czeka, nie stoi bezczynnie.
  - Potwór atakujący obiekt przełącza się na gracza, gdy gracz wejdzie w zasięg ataku.
  - Kolce nie blokują, więc nie są celem; potwór stojący na kolcach uderza w nie co drugi atak (kolce 80 HP to ok. 32 ciosy ślimaka).
  - Platformy lecznicze nie blokują i nie są atakowane.
  - Tempo odniesienia na Normalnym: kawałek ściany (150 HP) pada po 30 ciosach ślimaka (30 s jednego ślimaka, 6 s pięciu), po 3 ciosach Osiłka (4.5 s), po 2 ciosach Bossa. Głaz (400 HP): 80 ciosów ślimaka, 8 Osiłka. Czyli mur bez obrony pada w jednej fali, mur broniony trzyma.
  - Trudność skaluje obrażenia obiektom tak samo jak obrażenia graczom (mnożnik z sekcji 4).
  - Obiekt atakowany pokazuje zużycie w 4 stanach (pęknięcia, wyszczerbione krawędzie, dziury), sypie odłamki przy zmianie stanu, przy ciosie robi jeden mikroruch 1 px w bok i z powrotem (bez wibracji), a przy 0 HP zawala się z animacją i zostawia rumowisko (PRD-FX-08). Gracze mają widzieć z daleka, gdzie mur pęka i który kawałek zaraz padnie.
- Potwory nie kolidują ze sobą sztywno (miękkie rozpychanie), żeby nie blokować się w korytarzach.
- Po śmierci potwór zostawia trupa i krew na ziemi (PRD-MAP-09). Trup to dekoracja: nie blokuje, nie jest celem, nie dropuje nic więcej.

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

Przepisane w v0.14.0 (R60) po zgłoszeniu z gry: „zawsze na początku idą runnery i tak w kółko". Stara wersja
losowała **płaską listę** typów i wypuszczała ją wymieszaną po 1-3 punktach naraz, więc o tym, co dobiegnie
pierwsze, decydowała wyłącznie prędkość potwora — a biegacz jest najszybszy. Fala po fali wyglądało to tak samo.

- Fala to **ciąg grup**, nie papka. Każda grupa jest zdominowana przez **jeden typ**, dostaje losowy kawałek
  budżetu fali (15-35%, `groupShareMin`/`groupShareMax`), maks. **24 potwory** (`groupMaxMobs`, liczone
  w potworach — Rój to trzy sztuki na wpis). Co czwarta grupa (`groupMixedChance`) jest mieszana: drugi typ
  bierze ok. 30% udziału. Kolejność grup losowa. Typowa fala 10 to 6-7 grup.
- **Jeden typ wypada z każdej fali od fali 3** (`excludeFromWave`), losowany ważony `weight`, czyli
  **najsłabsi wypadają najczęściej**. Zmierzone na fali 12: ślimak 32%, biegacz 18%, Rój 12%, plujka 8,9%,
  skradający 7,9%, osiłek 6,8%, granatnik i ninja po 5%, tank 3,7%. Nigdy nie wypada ostatni dostępny typ.
  Wymuszony osiłek (niżej) **nie wchodzi**, gdy to on wypadł.
- Wagi losowania typu są w `balance.mobs[*].weight` i to one są tabelą prawdy, nie ten akapit.
- Od fali 4: min. 1 Osiłek (chyba że wypadł). Od fali 6: min. 1 Plujka.
- Co 5. fala: Boss **plus 60% normalnego budżetu** (`bossWaveBudgetMul`). Do v0.13.0 ta reguła była tylko
  w dokumencie — kod nie miał bossa, a gdy go dostał, dawał bossa plus **pełną** falę. Od v0.14.0 się zgadza.
- Skalowanie HP potworów: `HP * (1 + 0.04 * (n - 1))` (fala 10: +36%, fala 20: +76%). Obrażenia bez skalowania (to przerwy i fortyfikacje mają decydować, nie one-shoty).
- Skalowanie z liczbą graczy: budżet `* (0.7 + 0.3 * liczba_graczy)` (1 gracz: 1.0; 2: 1.3; 3: 1.6; 4: 1.9). Liczy się liczba graczy w sesji na starcie (late join nie istnieje; rozłączenie nie zmniejsza budżetu).

### 2.3 Spawn w czasie

- Co 4 s (`batchIntervalS`) wychodzi **jedna cała grupa**, i to jest sedno zmiany z v0.14.0: grupa wychodzi
  **z jednego punktu** (z szansą `groupTwoPointChance` 0.3 także z sąsiedniego na pierścieniu), więc gracz
  widzi nadbiegające **stado z jednej strony**, a nie równomierny deszcz z całej mapy.
- Punkty spawnu: 12 równomiernie na obwodzie. Wybierany jest punkt **poza zasięgiem wzroku** graczy
  (`spawnHiddenDistPx`), a gdy żaden taki nie istnieje — dowolny.
- **Sufit `maxAliveMobs` (60) liczy potwory, nie wpisy kolejki.** Grupa, która się nie mieści, dolewa się
  w kolejnych krokach z tych samych punktów i nic z niej nie ginie. Jedyny wyjątek: paczka większa niż
  wolne miejsce wychodzi w całości, gdy w danym kroku nie wyszło jeszcze nic — inaczej przy pełnej planszy
  Rój nigdy by nie wyszedł i fala nie miałaby końca (przekroczenie najwyżej o 2 potwory).
- Boss stawiany jest przy starcie fali, na punkcie najdalszym od żywych graczy, obok normalnej kompozycji.
- Fala kończy się, gdy skład jest wyczerpany **i** wszystkie potwory martwe — boss wlicza się do licznika.

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

## 6. Płomień i ciemność (V3-Q-04, V3-Q-05, v0.19.0)

**Płomień** to byt świata na kafelku (`world.flames`, snapshot `flames: [[id, tx, ty, siła]]`), nie przedmiot.
Siła 1.0 → 0 liniowo przez `flames.lifeS` (8 s), potem znika. Co `tickS` (0.5 s) zadaje `dps · tickS · siła`
(12 obr./s przy pełnej sile) każdemu graczowi, potworowi i hard objectowi stojącemu na kafelku. Ten sam kafelek
zapalony ponownie dostaje max(siła), nie sumę. Limit `flames.max` (60), najstarsze wylatują. Źródła są
**wyłącznie wrogie**: granat Granatnika zapala kafelek trafienia pełną siłą i czterech sąsiadów połową
(`flames.grenade`); Kamikaze (V3-Q-03) i random eventy (V3-Q-06) dołożą swoje. Gracz nie ma niczego, co stawia
ogień: to decyzja właściciela, nie luka. Potwór spalony umiera bez zabójcy (nie liczy się nikomu do leaderboardu).

**Ciemność** to warstwa renderu nad światem, pod HUD: cała plansza zabarwiona (`dark: { alpha, tint, radiusTiles }`
w snapshocie, `null` = brak) z wyciętymi kołami światła wokół żywych graczy (promień `radiusTiles`, miękka
krawędź 1 kafelek, migotanie ±4% jak pochodnia) i wokół płomieni (promień 1 + 2 · siła kafelka). Serwer tylko niesie
pole (`setDark(world, cfg)` w `server/flames.js`); dziś nic go nie włącza poza testem. Klient dochodzi do celu w 1 s.
**F4** w grze i na poligonie włącza lokalny podgląd (czerwień 0.78, promień 4), żeby obejrzeć efekt bez eventu.
