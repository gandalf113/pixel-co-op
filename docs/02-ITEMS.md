# 02 - Przedmioty

Wersja: 0.22 (2026-11-05)

Logika akcji (sekcja 3) jest **zatwierdzona przez właścicieli produktu**. Statystyki w sekcjach 4-5 to wartości startowe do balansu, do strojenia po testach.

## 1. Dwie kategorie

| Kategoria | Nazwa robocza | Co to | Po co |
|---|---|---|---|
| **Hard object** | przedmiot "martwy" | Fizyczne klocki: kawałek ściany, głaz, kolce | Budowa fortyfikacji, głównie w przerwach |
| **Power-up** | przedmiot "używalny" | Działka, platformy lecznicze, mina, klatka, boost broni | Przewaga w walce; rozstawiane w przerwie lub awaryjnie w trakcie fali |

Obie kategorie dropią z potworów i leżą na ziemi do podniesienia. **Używalny zachowuje się dokładnie jak martwy** (podnieś / odłóż / rzuć) **plus** ma jedną akcję więcej: użycie klawiszem `R`.

## 2. Zasady wspólne

| ID | Zasada |
|---|---|
| ITM-GEN-01 | Gracz trzyma **jeden** przedmiot naraz. Nie ma plecaka. |
| ITM-GEN-02 | Trzymany przedmiot jest widoczny na sprite'cie gracza (nad głową, w dwóch rękach). |
| ITM-GEN-03 | Z przedmiotem w rękach gracz **nie strzela** (spacja służy wtedy do rzutu). Prędkość: z hard objectem 60%, z power-upem 100%. |
| ITM-GEN-04 | Przedmioty **leżące na ziemi** mają promień podnoszenia 1 kafelka od środka postaci. Przy kilku w zasięgu podnosi się najbliższy. **Ten najbliższy jest podświetlony** (PRD-HUD-09), żeby gracz widział, co podniesie przed naciśnięciem `E`. Obiekty postawione i aktywne nie są podświetlane, bo nie da się ich podnieść (R53). |
| ITM-GEN-05 | Stany przedmiotu: `NA_ZIEMI`, `TRZYMANY(gracz)`, `W_LOCIE`, `POSTAWIONY` (hard object), `AKTYWNY` (użyty power-up z czasem), `ZUŻYTY`. |
| ITM-GEN-06 | Host jest źródłem prawdy o stanie przedmiotu. Dwóch graczy nie może podnieść tego samego: pierwsza akcja, która dotrze do hosta, wygrywa. |
| ITM-GEN-07 | Hard objectu nie da się odłożyć na inny obiekt, gracza ani potwora. Ghost pokazuje, czy miejsce jest dozwolone (zielony / czerwony). **Zasięg nie jest powodem czerwonego ghosta**: gdy kursor jest dalej niż zasięg stawiania, ghost **przyciąga się do najdalszego dozwolonego kafelka w kierunku kursora** i tam się stawia (ITM-PLACE-01). Czerwony oznacza tylko zajęte miejsce, kolizję z graczem / potworem, brak linii widzenia przez ścianę albo osiągnięty limit. |
| ITM-GEN-08 | **Raz postawione zostaje postawione** (R53, 2026-11-05): obiekt w stanie `POSTAWIONY` albo `AKTYWNY` **nie da się podnieść** - stoi do zniszczenia. Dotyczy ścian i głazów stawianych przez graczy, startowych ruin (PRD-MAP-10), ścian z Muru awaryjnego (uchyla R27), działek, min, kolców i klatek. Podnieść da się wyłącznie to, co leży `NA_ZIEMI`. Powód: budowanie ma być decyzją, a nie przesuwanką w trakcie fali. |
| ITM-GEN-09 | Hard objecty mają HP i **są powoli niszczone przez każdego potwora, który je dotyka na swojej drodze** (nie tylko gdy nie ma obejścia), oraz przez pociski graczy (pełne obrażenia, nie 10%). Tempo i obrażenia per potwór w `03-WAVES-DIFFICULTY.md`, sekcja 1. Obiekt przechodzi przez **4 stany zużycia** (pęknięcia, wyszczerbione krawędzie, dziury), sypie odłamki przy każdym przejściu, a przy 0 HP **zawala się z animacją** i zostawia rumowisko; znika dopiero po animacji (PRD-FX-08). |
| ITM-GEN-10 | Gracz powalony lub rozłączony upuszcza trzymany przedmiot pod nogi (`NA_ZIEMI`). |
| ITM-GEN-11 | **`E` z przedmiotem w rękach zawsze dotyczy trzymanego przedmiotu** (użyj / postaw), nigdy nie podnosi innego przedmiotu z okolicy. Zamiana przedmiotów nie istnieje: żeby wziąć coś innego, najpierw odkładasz to, co masz (`R`). |
| ITM-PLACE-01 | **Celowanie przy stawianiu**: kafelek docelowy = kafelek pod kursorem, jeśli jest w zasięgu (`placeRangeTiles`, metryka Czebyszewa jak dotąd); jeśli kursor jest dalej, kafelek docelowy = **ostatni kafelek w zasięgu na odcinku od środka gracza do kursora** (idąc po kafelkach od gracza w stronę kursora, bierzemy najdalszy, który jest w zasięgu i dozwolony; jeśli po drodze trafimy na niedozwolony, bierzemy ostatni dozwolony przed nim). Ghost zawsze jest zielony, gdy istnieje jakikolwiek dozwolony kafelek na tym odcinku, i leży na nim. Czerwony tylko, gdy żaden kafelek na odcinku nie jest dozwolony (np. gracz stoi przy ścianie i celuje w nią) albo limit. To samo dla `E` (hard object) i `R` (power-up). Klient i serwer liczą ten sam kafelek z tych samych danych (pozycja gracza, pozycja kursora, siatka), żeby ghost i wynik się zgadzały. |

## 3. Logika akcji (zatwierdzona)

### 3.1 Przedmioty "martwe" (hard objects)

| Klawisz | Warunek | Efekt |
|---|---|---|
| `E` | ręce puste, przedmiot w zasięgu | **Podnieś.** Przedmiot znika z ziemi, pojawia się nad głową. Animacja 0.2 s, w trakcie gracz stoi. |
| `E` | trzymam przedmiot | **Postaw.** Hard object stawiany na kafelku docelowym wg ITM-PLACE-01 (pod kursorem, a gdy kursor za daleko: najdalej w zasięgu w kierunku kursora), przyciągany do siatki. Przed postawieniem widać ghost. Postawiony = `POSTAWIONY`, staje się kolizją / fortyfikacją i **nie da się go już podnieść** (ITM-GEN-08). Jeśli ghost czerwony: nic, krótki sygnał. `E` z przedmiotem w rękach **nigdy nie podnosi innego przedmiotu** (ITM-GEN-11). |
| `Spacja` | trzymam przedmiot | **Rzuć** w kierunku kursora. Zasięg 4 kafelki, lot 0.5 s (wizualny łuk). **Rzut zadaje obrażenia**: pierwszy potwór trafiony w locie dostaje obrażenia wg tabeli w sekcji 4 i ogłuszenie 0.5 s. Po wylądowaniu przedmiot leży `NA_ZIEMI` (nie jest fortyfikacją, trzeba go odłożyć przez `E`). |
| `R` | trzymam hard object | **Odłóż** pod nogi jako `NA_ZIEMI` (do podniesienia, nie fortyfikacja). |
| `Q` / kółko myszy | trzymam hard object | Obróć o 90 stopni (tylko kawałek ściany, który jest 2 x 1). Głaz i kolce: brak efektu. |

Rzucony hard object trafiający sojusznika: 10% obrażeń (friendly fire), lot przerwany.

### 3.2 Przedmioty "używalne" (power-upy)

To samo co martwe (`E` podnieś, `R` odłóż na ziemię, `Spacja` / LPM rzuć z obrażeniami) **plus**:

| Klawisz | Warunek | Efekt |
|---|---|---|
| `E` | trzymam power-up | **Użyj.** Power-up stawialny (działko, platforma, mina, klatka) spawnuje się na kafelku docelowym wg ITM-PLACE-01 (ghost jak przy odkładaniu) i od tej chwili jest `AKTYWNY`: liczy się czas, nie da się go podnieść z powrotem. Boost broni: działa natychmiast na gracza, przedmiot znika. |

Różnica między `E` (użyj) a `R` (odłóż) dla power-upa: `E` aktywuje, `R` kładzie go na ziemi jako przedmiot do podniesienia (np. żeby podać koledze albo zostawić na później). Rzadsza akcja dostała rzadszy klawisz (R54).

Rzucony power-up: zadaje obrażenia trafionemu potworowi (wartość z tabeli w sekcji 5) i **aktywuje się tam, gdzie spadł**, tak jakby użyto `R` na tym kafelku. Działko zaczyna strzelać, platforma działa, mina się uzbraja, klatka łapie potwora, na którego spadła (albo pierwszego, który wejdzie). Jeśli miejsce lądowania jest niedozwolone (na obiekcie, poza mapą), przedmiot ląduje na najbliższym wolnym kafelku. Przy limicie aktywnych (sekcja 5) rzucony power-up leży `NA_ZIEMI` nieaktywny. Wyjątek: **boost broni, Serce, Buty i Zbrojmistrz** rzucone nie aktywują się, leżą na ziemi (rzut = podanie koledze). Rzucony power-up nie rani sojuszników.

### 3.3 Zamiana

**Nie ma zamiany** (decyzja R40, 2026-11-05). `E` z przedmiotem w rękach zawsze odkłada / stawia trzymany przedmiot, niezależnie od tego, co leży obok. Powód: w ferworze walki gracz z murem w rękach podnosił minę zamiast postawić mur.

### 3.4 Tabela zbiorcza

| Sytuacja | `E` | `Spacja` | `R` |
|---|---|---|---|
| Ręce puste, nic w zasięgu | - | seria z karabinu (spacja albo LPM) | przeładuj (gdy magazynek niepełny) |
| Ręce puste, przedmiot w zasięgu | podnieś | seria z karabinu | przeładuj |
| Trzymam hard object | postaw (najdalej w zasięgu w kierunku kursora) | rzuć (obrażenia) | odłóż pod nogi (obrót: `Q` / kółko) |
| Trzymam power-up stawialny | użyj = postaw i aktywuj (najdalej w zasięgu w kierunku kursora) | rzuć (obrażenia) + aktywacja w miejscu lądowania | odłóż na ziemię pod nogi |
| Trzymam boost broni | użyj na sobie | rzuć (obrażenia), nie aktywuje | odłóż na ziemię pod nogi |

## 4. Hard objects

| ID | Nazwa | Rozmiar | HP | Kolizja | Efekt postawionego | Obr. z rzutu | Drop (waga) |
|---|---|---|---|---|---|---|---|
| ITM-H-01 | **Kawałek ściany** | 2 x 1 kafelki (obracalny) | 150 | Blokuje potwory, graczy i pociski | - | 15 | 60 |
| ITM-H-02 | **Głaz** | 1 x 1 | 400 | Blokuje potwory, graczy i pociski | - | 30 | 25 |
| ITM-H-03 | **Kolce** | **2 x 2** (R59) | 80 | NIE blokuje (przechodzi się po nich) | 8 obrażeń / 0.5 s każdemu potworowi stojącemu na **dowolnym z czterech kafelków**; graczom 10% tego | 20 + krwawienie 2 obr./s przez 3 s | 15 |

Zasady:

- Potwory wybierają między obejściem a przegryzieniem na podstawie kosztu (HP obiektu / ich obrażenia obiektom). Każdy potwór dotykający obiektu na trasie atakuje go. Mur bez obrony pada w ciągu jednej fali; broniony trzyma. Szczegóły w `03`, sekcja 1.
- Zniszczony hard object zawala się (animacja 0.4 s, odłamki, pył) i zostawia bezkolizyjne rumowisko. Nie zostawia dropu. Szczegóły PRD-FX-08.
- Stawianie: do 2 kafelków od gracza, nie przez ścianę; kursor dalej = stawianie na granicy zasięgu w kierunku kursora (ITM-PLACE-01).
- Na start gry wokół spawnu stoi 7 losowych kawałków ściany na różnym poziomie zniszczenia (PRD-MAP-10). To zwykłe `wall` w stanie `POSTAWIONY` z obniżonym HP: **nie da się ich podnieść ani przestawić** (R53), zostają jako osłona do zniszczenia.

## 5. Power-upy

| ID | Nazwa | Czas | Efekt po użyciu (`R`) | Obr. z rzutu | Drop (waga) |
|---|---|---|---|---|---|
| ITM-P-01 | **Działko 30 s** | 30 s | Automatyczne działko. Zasięg 8 kafelków, obrażenia 8, cooldown 0.3 s, cel: najbliższy potwór. HP 100 (potwory mogą zniszczyć). Nie trafia graczy. | 10 | 20 |
| ITM-P-02 | **Działko 60 s** | 60 s | Jak wyżej. | 10 | 10 |
| ITM-P-03 | **Działko 90 s** | 90 s | Jak wyżej. | 10 | 4 |
| ITM-P-04 | **Platforma lecząca 30 s** | 30 s | Kwadrat 3 x 3 kafelki. Gracz na niej: +5 HP / 0.5 s. Powalony na niej wstaje po 2 s bez sojusznika. Nie blokuje ruchu, potwory ignorują. | 10 | 15 |
| ITM-P-05 | **Platforma lecząca 60 s** | 60 s | Jak wyżej. | 10 | 8 |
| ITM-P-06 | **Platforma lecząca 90 s** | 90 s | Jak wyżej. | 10 | 3 |
| ITM-P-07 | **Mina** | do detonacji | Uzbraja się 1 s po użyciu. Wybucha, gdy potwór wejdzie na kafelek: 60 obrażeń w promieniu 1.5 kafelka, graczom 10%. Widoczna dla graczy (miga), potwory jej nie omijają. | 10 | 20 |
| ITM-P-08 | **Pułapka-klatka** | 8 s | Rozmiar **2 x 2** (R59). Wyzwala się, gdy potwór wejdzie na **którykolwiek** z czterech kafelków, i łapie **wszystko, co stoi w obrysie** w chwili wyzwolenia. Unieruchomione 8 s, przyjmują 150% obrażeń. Nie działa na bossa. Po 8 s znika. | 10 | 12 |
| ITM-P-10 | **Serce** (V3-Q-01, v0.18.0) | trwały | Stały bonus: **+10 maksymalnego HP** dla tego, kto użyje (`E`), od razu doleczone o 10. Sufit **+100** na gracza; przy suficie `E` odmawia, przedmiot zostaje w rękach (odłóż albo rzuć koledze). Działa do końca partii, także po powaleniu i respawnie. Rzucony **nie aktywuje się** (podanie). Czerwona poświata. | 5 | 3 |
| ITM-P-11 | **Buty** (V3-Q-02, v0.18.0) | trwały | Stały bonus: **+3% prędkości** na sztukę (bardzo lekki, odczuwalny dopiero po kilku), sufit **+30%** (10 sztuk). Mnoży się z Szałem i z karą za noszenie hard objectu. Jak Serce: `E` używa, przy suficie odmowa, rzut = podanie. Niebieska poświata. | 5 | 2 |
| ITM-P-12 | **Zbrojmistrz** (V3-Q-09, v0.25.0) | trwały | Stały bonus: kto użyje (`E`), ten od tej chwili **stawia mocniejsze ofensywne przedmioty**: działka (obrażenia), miny (obrażenia i promień: +15% na sztukę), kolce (obrażenia) oraz rzut (obrażenia z rzutu). **+25%** na sztukę, sufit **+100%** (4 sztuki). Bonus jest zapisywany w przedmiocie **w chwili postawienia** (`power`), nie liczony na żywo: przedmiot postawiony wcześniej albo przez kolegę bez dropu zostaje zwykły. Klatka, platformy, głaz i ściana bez bonusu. Przedmioty z wydarzeń (Armia budowniczych) mają 1. Wzmocniony przedmiot ma złoty znacznik w rogu, HUD pokazuje `+25%` przy trzymanym ofensywnym. Jak Serce: przy suficie odmowa, rzut = podanie. Pomarańczowa poświata. | 5 | 2 |
| ITM-P-09 | **Boost poziomu broni** | trwały | **Dwie rzeczy naraz** (R56): +1 poziom broni (max 5: obrażenia +30%, magazynek +10, przeładunek -0.2 s) **oraz wylosowanie jednego z trzech modyfikatorów**, który **zastępuje** poprzedni: **wachlarz** (3 pociski, rozrzut 12°, obrażenia pojedynczego x0.6), **samonaprowadzanie** (pocisk zakręca do najbliższego potwora w stożku 25°, max 180°/s) albo **gwoździarka** (900 px/s, strzał co 0.05 s, cienka kreska, obrażenia x0.3, rozrzut 8°, **przebija potwory**: każdy kolejny trafiony dostaje 15% mniej niż poprzedni, zgłoszenie 2026-11-07, v0.19.1). Na poziomie 5 kolejny boost dalej przelosowuje modyfikator. **Szał (ultimate) nadpisuje modyfikator na czas trwania** i wraca po nim. Modyfikator jest w snapshocie i w HUD, więc sojusznicy widzą, kto czym strzela. Złoty, pulsuje, wyraźnie inny niż reszta. | 5 | **4** (rzadki; 2 -> 4 w v0.14.0 na zgłoszenie z gry, R61) |

Zasady:

- Limity aktywnych na mapie: działka 8, platformy 4, miny 20 (zatwierdzone). Przy limicie ghost czerwony, `R` nie działa, można dalej trzymać.
- Power-up z czasem po wygaśnięciu znika z animacją.
- Czas działania liczy się **także w przerwie** (decyzja właścicieli). Gracz sam decyduje, kiedy użyć; HUD pokazuje czas.

## 6. Drop

| ID | Zasada |
|---|---|
| ITM-DROP-01 | Każdy zabity potwór ma szansę na drop (per typ i trudność, `03-WAVES-DIFFICULTY.md`). Jeden przedmiot na drop. |
| ITM-DROP-02 | Najpierw losowana kategoria: hard object 55% / power-up 45%. Potem przedmiot w kategorii wg wag z tabel powyżej. |
| ITM-DROP-03 | Boss dropuje zawsze 3 przedmioty. **Jeden z nich to zawsze boost broni** (R64, v0.15.0, `guaranteedDrops` w balansie); pozostale dwa losowane jak zwykly drop z gwarancja wypadniecia. |
| ITM-DROP-04 | Drop pojawia się w miejscu śmierci potwora z małym odbiciem (żeby nie leżał w jednym punkcie przy wielu zabójstwach). |
| ITM-DROP-05 | Dropy są wspólne. Kto pierwszy podniesie, ten ma. |
| ITM-DROP-06 | Fala 1 gwarantuje min. 1 hard object w dropie (jeśli losowanie nie dało, ostatni potwór fali dropuje kawałek ściany). |

## 7. Wygląd (dla generacji pixel art)

Każdy przedmiot: sprite na ziemi (16 x 16), w rękach gracza (ten sam, nad głową), postawiony / aktywny (rozmiar wg tabel, 2-4 klatki animacji dla działka i platformy). Power-upy mają wspólną cechę wizualną (lampka / obwódka), hard objecty są kamienne / betonowe. Boost broni: złoty, animacja pulsowania.
