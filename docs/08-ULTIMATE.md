# 08 - ULTIMATE

Wersja: 0.5 (2026-11-05). **W zakresie MVP** (decyzja właścicieli R17). Założenia w sekcji 1 są zatwierdzone. Liczby w sekcjach 2-4 to wartości startowe do balansu.

## 1. Założenia (zatwierdzone)

| ID | Zasada |
|---|---|
| ULT-01 | Zabity potwór zostawia **shiny droplets** (świecące kropelki). Osobny byt od dropu przedmiotów; potwór może zostawić i jedno, i drugie. |
| ULT-02 | Kropelki ładują pasek ULTIMATE. Ładowanie jest **wspólne**: kropelka podniesiona przez dowolnego gracza ładuje pasek **każdemu** graczowi o tę samą wartość. |
| ULT-03 | Każdy gracz **używa swojego ultimate, kiedy chce**. Użycie zeruje **tylko jego** pasek. |
| ULT-04 | Pasek jest **trzystopniowy**: progi I / II / III. Użycie jest możliwe od progu I, siła efektu zależy od osiągniętego progu. Pasek zeruje się niezależnie od progu, z którego użyto. |
| ULT-05 | Ultimate wybiera się **w lobby**, przed startem, na całą sesję. Dwóch graczy może wybrać ten sam. |
| ULT-06 | Pasek **nie resetuje się** między falami. |
| ULT-07 | Kropelki są **przyciągane magnesem o bardzo dużym zasięgu** (R44, po teście 2026-11-05): promień magnesu **9 kafelków** (R55, 2026-11-05: 14 ściągało kropelki z drugiego końca ekranu), prędkość przyciągania rośnie, im bliżej gracza: `v(d) = clamp(40 + 380 * (1 - d/R)^2, 40, 420)` px/s, gdzie `d` to odległość do najbliższego żywego gracza, `R` = 9 kafelków (R55). Czyli na skraju zasięgu kropelka pełznie 40 px/s, w połowie drogi ok. 135 px/s, tuż przy graczu 420. Wartość kropelki zostaje 5 punktów: zmienia się zbieranie, nie tempo ładowania paska. Kropelka wybiera najbliższego żywego gracza i zmienia cel, jeśli inny stanie się bliższy. Znika po **30 s**, jeśli nikt jej nie zebrał (praktycznie tylko, gdy wszyscy są dalej niż 14 kafelków). Pochłonięcie w promieniu 6 px od środka gracza. |

## 2. Kropelki i pasek

| Element | Wartość |
|---|---|
| Kropelki per potwór | Ślimak 1, Biegacz 1, Osiłek 3, Plujka 2, Rój 1 (każdy z trójki), Boss 15 |
| Wartość kropelki | **5 punktów** (R43, po teście 2026-11-05: 1 punkt ładował 5 razy za wolno). Łatwy 6.5, Trudny 4.25, Koszmar 3.5 |
| Pasek | 300 punktów. Próg I = 100, II = 200, III = 300 |
| Wygląd kropelki | 6 x 6 px, jasny, pulsujący; lot do gracza 0.3 s po wejściu w promień magnesu |
| Powalony / martwy gracz | Pasek ładuje się dalej (zbierają inni). Nie może użyć, dopóki leży |
| Rozłączony gracz | Jego pasek znika razem z nim |

Przy standardowej fali na Normalnym: fala 1 to ok. 17 potworów = ok. 85-100 punktów (próg I w trakcie fali 1), fala 2 dobija do II, pełny pasek ok. fali 3 bez używania. Potem każda fala to 1-2 pełne paski do rozdysponowania. Boss daje skok o 75. Do strojenia po testach.

## 3. Sterowanie i HUD

| ID | Wymóg |
|---|---|
| ULT-CTRL-01 | `F` - użyj ultimate. Działa od progu I. Poniżej progu I: krótki sygnał "za mało". |
| ULT-CTRL-02 | Ultimate celowane (Działko szerokie, Rakieta) używają kierunku kursora w momencie naciśnięcia `F`. |
| ULT-CTRL-03 | Użycie nie przerywa ruchu ani nie wymaga pustych rąk (działa z przedmiotem w rękach). Wyjątek: Szał nie zmienia zasad rzutu. |
| ULT-HUD-01 | Pasek ULTIMATE **w lewym górnym rogu**, poziomy, w stylu paska super z bijatyk 16-bit (Street Fighter na SNES): 3 segmenty z przerwami, wypełnianie od lewej, połysk na pełnych segmentach, pulsowanie i napis `ULTI GOTOWE [F]` przy pełnym pasku, licznik `I / II / III`. Szczegóły PRD-HUD-10. |
| ULT-HUD-02 | Ikona wybranego ultimate 32 x 32 po lewej stronie paska. Nad sojusznikiem mała kropka w kolorze progu (szara / I / II / III), żeby wiedzieć, kto ma gotowe. |
| ULT-HUD-03 | Lobby: 7 kafelków w jednym rzędzie, bez przewijania, każdy z **ikoną 32 x 32 pixel-art** (`ult_*` w `sprites.js`: `ult_shockwave`, `ult_wall`, `ult_heal`, `ult_rage`, `ult_wide_cannon`, `ult_rocket`, `ult_freeze`), nazwą i jednym zdaniem; progi po najechaniu. Układ: PRD-SES-05. |

## 4. Lista ultimate (7)

Zasady wspólne: ultimate **nie rani sojuszników** (brak friendly fire), **niszczy hard objecty graczy tylko tam, gdzie zaznaczono**, na bossa działa z mnożnikiem 0.5 obrażeń i bez kontroli (zamrożenie / ogłuszenie skrócone do 1 s).

| # | Ultimate | Typ | Próg I | Próg II | Próg III |
|---|---|---|---|---|---|
| U-01 | **Fala uderzeniowa** | obszar wokół gracza | Promień 4 kafelki, 40 obr., odrzut 2 kafelki | Promień 6, 80 obr., odrzut 3, ogłuszenie 1 s | Promień 8, 150 obr., odrzut 4, ogłuszenie 2 s |
| U-02 | **Mur awaryjny** | obrona | 3 kawałki ściany w linii przed graczem (80 HP każdy, znikają po 30 s) | 5 kawałków, 150 HP, 45 s | Okrąg 8 kawałków wokół gracza, 150 HP, 60 s |
| U-03 | **Uzdrowienie** | wsparcie | +40 HP graczom w promieniu 6 kafelków | +80 HP, podnosi powalonych w zasięgu | Pełne HP wszystkim na mapie, podnosi powalonych, 3 s nietykalności |
| U-04 | **Szał** | buff własny | 8 s: obrażenia x2, cooldown x0.5 | 12 s: jak I + pociski przebijają | 15 s: jak II + potrójny strzał + prędkość x1.3 |
| U-05 | **Działko szerokie** (celowane) | stożek w kierunku kursora | Stożek 30 stopni, zasięg 8 kafelków, 60 obr. każdemu w stożku, 1 strzał | Stożek 45 stopni, zasięg 10, 100 obr. | Stożek 60 stopni, zasięg 12, 180 obr., przebija hard objecty potworów (nie graczy) |
| U-06 | **Rakieta** (celowana) | pocisk AoE w kierunku kursora | Leci 10 kafelków lub do trafienia, wybuch promień 2 kafelki, 80 obr. | Promień 3, 150 obr., podpalenie 3 s (10 obr./s) | 3 rakiety w wachlarzu, promień 3, 150 obr. każda, podpalenie 5 s |
| U-07 | **Zamrożenie** | kontrola obszarowa | Wszystkie potwory w promieniu 6 kafelków stoją 3 s | Promień 10, 5 s, zamrożeni przyjmują 150% obrażeń | Wszystkie potwory na mapie, 6 s, 150% obrażeń, po odmrożeniu spowolnienie 50% na 5 s |

Zasady szczegółowe:

- Ściany z Muru awaryjnego to zwykłe hard objecty (potwory je atakują), ale **nie da się ich podnieść ani przestawić** - znikają po swoim czasie albo padają pod ciosami (R53 uchyla R27).
- Rakieta nie niszczy fortyfikacji graczy. Zatwierdzone (R28).
- Zamrożony potwór nie atakuje, nie rusza się, nie wzywa posiłków (boss).
- Działko szerokie i Rakieta: celowanie w kierunku kursora w chwili `F`, bez dodatkowego potwierdzania.

## 5. Wygląd (dla generacji pixel art)

- Kropelka: 6 x 6, 2 klatki pulsu, kolor wspólny dla wszystkich (np. cyjan), inny niż power-upy.
- Każdy ultimate: **ikona 32 x 32** do lobby i HUD (gotowe w `sprites.js` jako `ult_*`, z ciemnym tłem kafelka i obrysem), efekt ekranowy 0.3 s przy użyciu (błysk w kolorze gracza) i efekt obszarowy (okrąg fali, stożek, wybuch, lód, tarcza).
- Próg III ma wyraźniejszy efekt niż I (większy, dłuższy, więcej klatek), żeby było widać, że ktoś użył "pełnego".

## 6. Testy

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| UL1 | Gracz A zbiera 10 kropelek, gracz B stoi w kącie | ULT-02 | Obaj mają +10 punktów |
| UL2 | Kropelka 8 kafelków od gracza, gracz stoi | ULT-07 | Pełznie w stronę gracza, przyspiesza wyraźnie w ostatnich 3 kafelkach |
| UL2b | Zabij 20 ślimaków w fali 1 na Normalnym | sekcja 2 | Pasek ok. 100 punktów, próg I osiągnięty w trakcie fali 1 |
| UL3 | Kropelka 11 kafelków od wszystkich graczy przez 30 s | ULT-07 | Nie rusza się, znika po 30 s |
| UL4 | `F` przy 99 punktach | ULT-CTRL-01 | Sygnał "za mało", nic się nie dzieje |
| UL5 | `F` przy 100 (próg I), 200 (II), 300 (III) | ULT-04 | Efekt wg kolumny progu, pasek = 0, paski innych bez zmian |
| UL6 | Fala uderzeniowa III przy 10 ślimakach i sojuszniku w zasięgu | U-01 | Ślimaki martwe (150 > HP), sojusznik 0 obrażeń |
| UL7 | Mur awaryjny I, potem podnieś jeden kawałek | U-02 | 3 ściany przed graczem, podniesiony zostaje na stałe, pozostałe znikają po 30 s |
| UL8 | Uzdrowienie II z powalonym sojusznikiem 4 kafelki dalej | U-03 | Sojusznik wstaje |
| UL9 | Działko szerokie I w 5 ślimaków w stożku, 1 poza | U-05 | 5 trafionych po 60, 1 nietknięty |
| UL10 | Rakieta I w ścianę gracza | U-06 | Wybuch, ściana bez obrażeń, potwory obok ranne |
| UL11 | Zamrożenie I przy bossie i ślimakach | U-07, sekcja 4 | Ślimaki 3 s, boss 1 s |
| UL12 | Pasek 150 po fali 3, start fali 4 | ULT-06 | Nadal 150 |
| UL13 | Zmiana ultimate po starcie | ULT-05 | Brak możliwości |
