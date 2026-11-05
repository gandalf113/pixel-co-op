# pixel-co-op

Top-down, pixel-artowa gra co-op na WLAN. Fale potworów, przerwy na fortyfikację, przedmioty do podnoszenia i ustawiania. Bez internetu, bez instalacji, lekka do skopiowania między komputerami.

To repo trzyma **dokumentację produktu**. Podział ról:

- **Produkt + testy** (ten zespół): PRD, specyfikacje, plan testów, raporty z testów.
- **Implementacja + deploy** (drugi developer): kod gry na podstawie `docs/`.

## Dokumenty

| Plik | Co zawiera |
|---|---|
| [docs/01-PRD.md](docs/01-PRD.md) | Wymagania produktowe: wizja, sterowanie, kamera, pętla rozgrywki, HUD, kryteria akceptacji |
| [docs/02-ITEMS.md](docs/02-ITEMS.md) | Przedmioty: hard objects i power-upy, statystyki, logika podnoszenia / używania / rzucania |
| [docs/03-WAVES-DIFFICULTY.md](docs/03-WAVES-DIFFICULTY.md) | Potwory, skalowanie fal, długość przerw, 4 poziomy trudności, tabele liczbowe |
| [docs/04-TECH-ARCH.md](docs/04-TECH-ARCH.md) | Ograniczenia techniczne i rekomendowana architektura (przeglądarka, host w LAN, pixel art z kodu) |
| [docs/05-TEST-PLAN.md](docs/05-TEST-PLAN.md) | Plan testów: scenariusze akceptacyjne per feature, testy LAN, testy balansu |
| [docs/06-OPEN-QUESTIONS.md](docs/06-OPEN-QUESTIONS.md) | Decyzje do podjęcia i rzeczy czekające na doprecyzowanie |
| [docs/07-BACKLOG-V2.md](docs/07-BACKLOG-V2.md) | Backlog V2: boss, dźwięk, mapy, statystyki |
| [docs/08-ULTIMATE.md](docs/08-ULTIMATE.md) | ULTIMATE (w MVP): shiny droplets, wspólny pasek, 3 progi, 7 umiejętności, testy |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Historia zmian w dokumentacji |

## Jak czytać

1. Zacznij od `01-PRD.md`. Sekcja "Zakres MVP" mówi, co ma działać w pierwszej wersji.
2. Liczby (HP, obrażenia, czasy) są w `02-ITEMS.md` i `03-WAVES-DIFFICULTY.md`. To wartości startowe do balansu, nie dogmat. Zmieniamy je po testach.
3. Każdy wymóg ma identyfikator (np. `PRD-CTRL-03`). Testy w `05-TEST-PLAN.md` odwołują się do tych identyfikatorów.
4. Wszystko oznaczone `[PROPOZYCJA]` to nasz draft, który nie został jeszcze potwierdzony przez właściciela produktu. Wszystko oznaczone `[TBD]` czeka na doprecyzowanie.

## Zasady

- Dokumentacja jest źródłem prawdy. Jeśli kod robi coś inaczej niż docs, to albo błąd w kodzie, albo docs trzeba zaktualizować. Nie zostawiamy rozjazdu.
- Zmiany w wymaganiach idą przez PR do tego repo i wpis w `docs/CHANGELOG.md`.
- Pixel art generuje Claude. Żadnych zewnętrznych paczek grafik.
