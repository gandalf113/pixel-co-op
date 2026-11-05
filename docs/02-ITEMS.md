# 02 - Przedmioty

Wersja: 0.5 (2026-11-05)

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
| ITM-GEN-04 | Przedmioty na ziemi mają promień podnoszenia 1 kafelka od środka postaci. Przy kilku w zasięgu podnosi się najbliższy. |
| ITM-GEN-05 | Stany przedmiotu: `NA_ZIEMI`, `TRZYMANY(gracz)`, `W_LOCIE`, `POSTAWIONY` (hard object), `AKTYWNY` (użyty power-up z czasem), `ZUŻYTY`. |
| ITM-GEN-06 | Host jest źródłem prawdy o stanie przedmiotu. Dwóch graczy nie może podnieść tego samego: pierwsza akcja, która dotrze do hosta, wygrywa. |
| ITM-GEN-07 | Hard objectu nie da się odłożyć na inny obiekt, gracza ani potwora. Ghost pokazuje, czy miejsce jest dozwolone (zielony / czerwony). |
| ITM-GEN-08 | Odłożony hard object **da się ponownie podnieść** (`E` przy nim), o ile nie jest zniszczony. Power-up po użyciu (`R`) już nie. |
| ITM-GEN-09 | Hard objecty mają HP: niszczą je potwory (gdy blokują drogę) i pociski graczy (pełne obrażenia, nie 10%). |
| ITM-GEN-10 | Gracz powalony lub rozłączony upuszcza trzymany przedmiot pod nogi (`NA_ZIEMI`). |

## 3. Logika akcji (zatwierdzona)

### 3.1 Przedmioty "martwe" (hard objects)

| Klawisz | Warunek | Efekt |
|---|---|---|
| `E` | ręce puste, przedmiot w zasięgu | **Podnieś.** Przedmiot znika z ziemi, pojawia się nad głową. Animacja 0.2 s, w trakcie gracz stoi. |
| `E` | trzymam przedmiot | **Odłóż.** Hard object stawiany na kafelku wskazanym kursorem, max 2 kafelki od gracza, przyciągany do siatki. Przed odłożeniem widać ghost. Odłożony = `POSTAWIONY`, staje się kolizją / fortyfikacją. Jeśli miejsce niedozwolone: nic, krótki sygnał. |
| `Spacja` | trzymam przedmiot | **Rzuć** w kierunku kursora. Zasięg 4 kafelki, lot 0.5 s (wizualny łuk). **Rzut zadaje obrażenia**: pierwszy potwór trafiony w locie dostaje obrażenia wg tabeli w sekcji 4 i ogłuszenie 0.5 s. Po wylądowaniu przedmiot leży `NA_ZIEMI` (nie jest fortyfikacją, trzeba go odłożyć przez `E`). |
| `R` | trzymam hard object | Obróć o 90 stopni (tylko kawałek ściany, który jest 2 x 1). Głaz i kolce: brak efektu. |

Rzucony hard object trafiający sojusznika: 10% obrażeń (friendly fire), lot przerwany.

### 3.2 Przedmioty "używalne" (power-upy)

To samo co martwe (`E` podnieś, `E` odłóż na ziemię, `Spacja` rzuć z obrażeniami) **plus**:

| Klawisz | Warunek | Efekt |
|---|---|---|
| `R` | trzymam power-up | **Użyj.** Power-up stawialny (działko, platforma, mina, klatka) spawnuje się na kafelku wskazanym kursorem (max 2 kafelki, ghost jak przy odkładaniu) i od tej chwili jest `AKTYWNY`: liczy się czas, nie da się go podnieść z powrotem. Boost broni: działa natychmiast na gracza, przedmiot znika. |

Różnica między `E` (odłóż) a `R` (użyj) dla power-upa: `E` kładzie go na ziemi jako przedmiot do podniesienia (np. żeby podać koledze albo zostawić na później). `R` aktywuje.

Rzucony power-up: zadaje obrażenia trafionemu potworowi (wartość z tabeli w sekcji 5) i **aktywuje się tam, gdzie spadł**, tak jakby użyto `R` na tym kafelku. Działko zaczyna strzelać, platforma działa, mina się uzbraja, klatka łapie potwora, na którego spadła (albo pierwszego, który wejdzie). Jeśli miejsce lądowania jest niedozwolone (na obiekcie, poza mapą), przedmiot ląduje na najbliższym wolnym kafelku. Przy limicie aktywnych (sekcja 5) rzucony power-up leży `NA_ZIEMI` nieaktywny. Wyjątek: **boost broni** rzucony nie aktywuje się, leży na ziemi (rzut = podanie koledze). Rzucony power-up nie rani sojuszników.

### 3.3 Zamiana

`E` z przedmiotem w rękach, gdy **inny** przedmiot jest w zasięgu podnoszenia: odkłada trzymany pod nogi i podnosi nowy (jedna akcja). **[PROPOZYCJA]**

### 3.4 Tabela zbiorcza

| Sytuacja | `E` | `Spacja` | `R` |
|---|---|---|---|
| Ręce puste, nic w zasięgu | - | strzał | - |
| Ręce puste, przedmiot w zasięgu | podnieś | strzał | - |
| Trzymam hard object | odłóż (lub zamień) | rzuć (obrażenia) | obróć ścianę |
| Trzymam power-up stawialny | odłóż na ziemię (lub zamień) | rzuć (obrażenia) + aktywacja w miejscu lądowania | użyj = postaw i aktywuj |
| Trzymam boost broni | odłóż na ziemię (lub zamień) | rzuć (obrażenia), nie aktywuje | użyj na sobie |

## 4. Hard objects

| ID | Nazwa | Rozmiar | HP | Kolizja | Efekt postawionego | Obr. z rzutu | Drop (waga) |
|---|---|---|---|---|---|---|---|
| ITM-H-01 | **Kawałek ściany** | 2 x 1 kafelki (obracalny) | 150 | Blokuje potwory, graczy i pociski | - | 15 | 60 |
| ITM-H-02 | **Głaz** | 1 x 1 | 400 | Blokuje potwory, graczy i pociski | - | 30 | 25 |
| ITM-H-03 | **Kolce** | 1 x 1 | 80 | NIE blokuje (przechodzi się po nich) | 8 obrażeń / 0.5 s każdemu potworowi na kolcach; graczom 10% tego | 20 + krwawienie 2 obr./s przez 3 s | 15 |

Zasady:

- Potwory, którym fortyfikacja blokuje najkrótszą drogę, próbują obejść. Jeśli obejście > 3x dłuższe lub nie istnieje, atakują najbliższy hard object (Osiłek i Boss atakują od razu).
- Zniszczony hard object znika z animacją odłamków. Nie zostawia dropu.
- Odkładanie: max 2 kafelki od gracza, nie przez ścianę.

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
| ITM-P-08 | **Pułapka-klatka** | 8 s | Postawiona: łapie pierwszego potwora, który wejdzie na kafelek. Unieruchomiony 8 s, przyjmuje 150% obrażeń. Nie działa na bossa. Po 8 s znika. | 10 | 12 |
| ITM-P-09 | **Boost poziomu broni** | trwały | +1 poziom broni gracza (max 5). Natychmiast. Złoty, pulsuje, wyraźnie inny niż reszta. | 5 | 2 (rzadki) |

Zasady:

- Limity aktywnych na mapie: działka 8, platformy 4, miny 20 (zatwierdzone). Przy limicie ghost czerwony, `R` nie działa, można dalej trzymać.
- Power-up z czasem po wygaśnięciu znika z animacją.
- Czas działania liczy się **także w przerwie** (decyzja właścicieli). Gracz sam decyduje, kiedy użyć; HUD pokazuje czas.

## 6. Drop

| ID | Zasada |
|---|---|
| ITM-DROP-01 | Każdy zabity potwór ma szansę na drop (per typ i trudność, `03-WAVES-DIFFICULTY.md`). Jeden przedmiot na drop. |
| ITM-DROP-02 | Najpierw losowana kategoria: hard object 55% / power-up 45%. Potem przedmiot w kategorii wg wag z tabel powyżej. |
| ITM-DROP-03 | Boss dropuje zawsze 3 przedmioty, w tym gwarantowany jeden power-up 60 s lub 90 s. Szansa na boost broni z bossa: 25%. |
| ITM-DROP-04 | Drop pojawia się w miejscu śmierci potwora z małym odbiciem (żeby nie leżał w jednym punkcie przy wielu zabójstwach). |
| ITM-DROP-05 | Dropy są wspólne. Kto pierwszy podniesie, ten ma. |
| ITM-DROP-06 | Fala 1 gwarantuje min. 1 hard object w dropie (jeśli losowanie nie dało, ostatni potwór fali dropuje kawałek ściany). |

## 7. Wygląd (dla generacji pixel art)

Każdy przedmiot: sprite na ziemi (16 x 16), w rękach gracza (ten sam, nad głową), postawiony / aktywny (rozmiar wg tabel, 2-4 klatki animacji dla działka i platformy). Power-upy mają wspólną cechę wizualną (lampka / obwódka), hard objecty są kamienne / betonowe. Boost broni: złoty, animacja pulsowania.
