# 07 - Backlog V2

Wersja: 0.1 (2026-11-05). Rzeczy poza MVP. Każdy wpis ma status: `pomysł` (do omówienia), `zatwierdzony` (robimy w V2), `odrzucony`.

## B1. ULTIMATE: wspólny pasek, osobne użycie [zatwierdzony przez właścicieli, 2026-11-05]

### Założenia (od właścicieli)

- Zabijane potwory zostawiają dodatkowo **"shiny droplets"** (świecące kropelki), osobny byt od dropów przedmiotów.
- Kropelki budują pasek **ULTIMATE**. Pasek jest **wspólny w ładowaniu**: podniesienie kropelki przez dowolnego gracza ładuje pasek **wszystkim** graczom.
- Każdy gracz **używa swojego ultimate, kiedy chce**. Użycie zeruje **tylko jego** pasek. Pozostali zachowują swój stan.
- Ultimate jest **trzystopniowy**: pasek ma 3 progi; im wyżej naładowany, tym mocniejszy efekt użycia.
- Na start gry każdy gracz **wybiera ultimate** z listy (w lobby).

### Propozycja mechaniki [PROPOZYCJA]

| Element | Propozycja |
|---|---|
| Kropelka | Spawn z każdego zabitego potwora (100%), 1-3 sztuki wg typu (ślimak 1, osiłek 3, boss 15). Mały świecący sprite 6 x 6 px, przyciągany do gracza w promieniu 2 kafelków (magnes), znika po 20 s. |
| Ładowanie | Jedna kropelka = +1 punkt do paska każdego gracza. Pasek ma 300 punktów. Progi: I = 100, II = 200, III = 300. |
| Użycie | Klawisz `F`. Dozwolone od progu I. Siła efektu wg aktualnego progu. Po użyciu pasek gracza = 0. Paski innych bez zmian. |
| HUD | Pasek ULTIMATE nad paskiem HP, z trzema znacznikami progów. Świeci, gdy osiągnięty próg I. Ikona wybranego ultimate. |
| Powalony / martwy gracz | Pasek ładuje się dalej (kropelki podnoszą inni). Nie może użyć, dopóki leży. |
| Trudność | Koszmar: kropelki dają 0.7 punktu. Łatwy: 1.3. |

### Propozycja listy ultimate (4 na start, po jednym na gracza nie jest wymagane: dwóch może wziąć to samo) [PROPOZYCJA]

| Ultimate | Próg I | Próg II | Próg III |
|---|---|---|---|
| **Fala uderzeniowa** | Odpycha potwory w promieniu 4 kafelków, 40 obr. | Promień 6, 80 obr., ogłuszenie 1 s | Promień 8, 150 obr., ogłuszenie 2 s |
| **Mur awaryjny** | Spawnuje 3 kawałki ściany przed graczem (po 80 HP, znikają po 30 s) | 5 kawałków, 150 HP, 45 s | Pełny okrąg wokół gracza (8 kawałków), 150 HP, 60 s |
| **Uzdrowienie** | +40 HP wszystkim graczom w promieniu 6 kafelków | +80 HP, podnosi powalonych w zasięgu | Pełne HP wszystkim na mapie, podnosi powalonych, 3 s nietykalności |
| **Szał** | Przez 8 s: strzał x2 obrażeń, cooldown x0.5 | 12 s, pociski przebijają | 15 s, dodatkowo potrójny strzał, prędkość gracza x1.3 |

### Pytania do właścicieli

| # | Pytanie | Nasza propozycja |
|---|---|---|
| U1 | Czy ultimate można zmienić między falami, czy wybór tylko w lobby? | Tylko w lobby |
| U2 | Czy użycie na progu I jest dozwolone, czy trzeba czekać do pełnego? | Dozwolone od I (decyzja gracza: teraz słabiej czy później mocniej) |
| U3 | Czy kropelki znikają z czasem? | Tak, 20 s, żeby nie zaśmiecać mapy i wymuszać ruch |
| U4 | Czy kropelki są przyciągane (magnes), czy trzeba na nie wejść? | Magnes 2 kafelki, inaczej przy 60 potworach nie da się ich zbierać |
| U5 | Czy pasek resetuje się między falami? | Nie, przenosi się |

## B2. Boss co 5 fal [zatwierdzony, 2026-11-05]

Spec w `03-WAVES-DIFFICULTY.md`, MOB-06. Poza MVP decyzją właścicieli (R14).

## B3. Dźwięk [pomysł]

Syntetyczne efekty (Web Audio), bez plików. Strzał, trafienie, drop, podniesienie, odliczanie, wybuch, ultimate.

## B4. Inne mapy niż płaska [pomysł]

Stałe przeszkody na starcie (skały, woda), różne kształty areny.

## B5. Statystyki po grze per gracz [pomysł]

Zabójstwa, obrażenia, przyjęte obrażenia, podniesienia sojuszników, postawione obiekty, friendly fire zadany (z nazwiskiem winnego).
