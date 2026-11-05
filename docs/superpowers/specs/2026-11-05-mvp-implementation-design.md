# Projekt implementacji MVP: pixel-co-op

Data: 2026-11-05. Autor: Aleksander Szczepaniak (z Claude).
Źródło prawdy o produkcie: `docs/01-PRD.md` … `docs/05-TEST-PLAN.md` (v0.3). Ten dokument mówi **jak** budujemy MVP i **co dokładnie** w nim jest; nie powtarza wymagań, tylko się do nich odwołuje po ID.

## 1. Po co i kiedy sukces

Obecny `server.js` + `public/client.js` to prototyp napisany równolegle z docs; nie jest wiążący. Cel: pierwsza grywalna sesja **we dwójkę na LAN-ie**, przechodząca pełną pętlę: lobby → przerwa 0 → fale → przerwy z budową → game over → ekran wyniku → nowa gra.

Sukces pierwszej sesji = checklista PRD §12 poza punktami wymagającymi 4 laptopów i pomiarem wydajności (te w kolejnej rundzie). Testy z `05-TEST-PLAN.md` mają dać się wykonać na tym buildzie, poza W3 (boss), I9b/I15 (boost broni) i testami dotyczącymi przedmiotów spoza MVP.

## 2. Zakres MVP (zawartość)

| Obszar | W MVP | Poza MVP |
|---|---|---|
| Potwory | MOB-01 Ślimak, MOB-02 Biegacz, MOB-03 Osiłek | Plujka, Rój, Boss |
| Hard objects | ITM-H-01 Kawałek ściany (2x1, obrót R) | Głaz, Kolce |
| Power-upy | ITM-P-01 Działko 30 s, ITM-P-07 Mina | Działka 60/90, platformy, klatka, boost broni |
| Broń | Pistolet LV1 (PRD-PLR-03), HUD pokazuje "BROŃ LV 1" | Poziomy 2-5 (PRD-PLR-04) |
| Audio | brak | wszystko |
| Menu Esc | wróć, pełny ekran, wyjdź | głośność |

Konsekwencje dla reguł z `03`/`02`:
- **Boss**: brak. Fale 5, 10, 15… to zwykłe fale z **pełnym** budżetem (bez cięcia do 60%). Decyzja właściciela produktu.
- Reguła "od fali 6 min. 1 Plujka" nie obowiązuje (brak Plujki). "Od fali 4 min. 1 Osiłek" obowiązuje.
- Wagi losowania składu: tylko odblokowane typy z MVP (Ślimak 50, Biegacz 30, Osiłek 10).
- Drop: kategoria 55/45 bez zmian (ITM-DROP-02); w kategorii losujemy tylko z przedmiotów MVP wg ich wag z tabel (hard: ściana 100%; power-up: działko 30 s 20 : mina 20). ITM-DROP-06 (gwarantowana ściana w fali 1) obowiązuje.
- Reszta liczb dokładnie wg `02` i `03`, przez `balance.json`.

Wszystko pozostałe z PRD §3-§9 i §11 jest w zakresie, w tym: lobby z nickami i kolorami (SES-04/05), wybór trudności 4-pozycyjny z opisami (03 §4), brak late join (SES-06), friendly fire 10% (PLR-05), powalenie / podnoszenie / śmierć do końca fali / respawn w przerwie (PLR-07..09), regeneracja tylko w przerwie (PLR-01), "Gotowy" pod `G` (LOOP-04), limit 200 przedmiotów (LOOP-05), ekran końcowy z zabójstwami per gracz (LOOP-06), cały HUD PRD-HUD-01..09, Tab z listą graczy (CTRL-08), predykcja i interpolacja (PERF-03).

## 3. Decyzje techniczne (podjęte)

Odpowiedzi na pytania developerskie T1-T6 z `06-OPEN-QUESTIONS.md`:

- **T1**: przeglądarka (vanilla JS + Canvas 2D) + serwer Node.js z `ws`. Zero frameworków i bundlera.
- **T2**: na razie zakładamy Node na hoście (`node server.js` / `npm start`). Binarka Bun później, jeśli będzie potrzebna.
- **T3**: pełny snapshot JSON 20 Hz; delta dopiero, jeśli pomiar pokaże problem.
- **T4**: sprite'y jako dane w kodzie (stringi z indeksami wspólnej palety), rysowane przy starcie do offscreen canvasów.
- **T5**: flow field od graczy (patrz §5).
- **T6**: kod żyje w **tym** repo, obok `docs/`. README zaktualizować.

Sieć i pętla (04 §4): tick symulacji 30 Hz, snapshot 20 Hz, input z klienta z numerem sekwencji (60 Hz lub co klatkę), heartbeat 2 s / timeout 6 s, zdarzenia jednorazowe (strzał, trafienie, drop, podniesienie, wybuch, śmierć) jako osobne komunikaty dla efektów.

Klient: predykcja ruchu własnej postaci z rekonsyliacją do snapshotu (ponowne zaaplikowanie niepotwierdzonych inputów); inni gracze, potwory i pociski interpolowane z opóźnieniem 100 ms. Ruch gracza i kolizja z kafelkami (granica mapy + postawione hard objecty) to **wspólny kod** używany przez serwer i klienta, żeby predykcja dawała ten sam wynik. Strzał, rzut, podnoszenie: tylko serwer (bez predykcji), efekt po snapshocie/zdarzeniu.

Render (PRD-MAP-05, 04 §3): wewnętrzny canvas 480 x 270, skalowany całkowitą krotnością do okna, `imageSmoothingEnabled = false`; reszta okna ciemna. Kamera wycentrowana na własnej postaci, bez zatrzymywania na krawędzi (MAP-04). Postać rotowana płynnie o dowolny kąt (CTRL-09). Celowanie: kursor przeliczany do współrzędnych świata względem kamery.

Świat: arena 80 x 60 kafelków po 16 px (MAP-01). Kafelek to jednostka siatki dla budowy, flow fielda i odkładania.

## 4. Sesja, host, lobby

- "Host" w grze = klient, który połączył się z tego samego komputera co serwer (adres loopback). Tylko on widzi suwak trudności i przycisk Start; reszta widzi "czekam na hosta" (SES-05). Jeśli żaden klient nie jest lokalny, Start jest zablokowany.
- Lobby pokazuje adresy IP hosta w LAN (TECH-04), te same, które serwer wypisuje w konsoli.
- Nick: max 12 znaków, walidowany na serwerze (przycięcie, odrzucenie pustego, filtrowanie znaków sterujących). Kolory w kolejności: zielony, niebieski, żółty, różowy (SES-04).
- Po starcie: nowe połączenia odrzucane komunikatem "gra w toku" (SES-06).
- **Powrót po rozłączeniu (decyzja właściciela produktu)**: przy dołączeniu serwer wydaje graczowi token sesji (klient trzyma go w `sessionStorage`). Gdy gracz się rozłączy w trakcie gry, jego postać zostaje "zawieszona" przez 30 s: trzymany przedmiot od razu spada (ITM-GEN-10), postać jest nietykalna, nieaktywna i nie jest celem potworów, gra toczy się dalej. Powrót z tym samym tokenem w ciągu 30 s przywraca tę samą postać (nick, kolor, HP, stan, zabójstwa). Po 30 s: postać znika (SES-07). Dotyczy też hosta: rozłączenie hosta daje 30 s na powrót, po nich koniec sesji dla wszystkich z komunikatem i powrót do lobby (serwer dalej działa). Rola hosta jest przypięta do tokenu, nie do bieżącego połączenia. Połączenie bez ważnego tokenu po starcie = "gra w toku". Zawieszeni gracze liczą się do warunku game over jak powaleni (jeśli wszyscy pozostali są powaleni/martwi, jest koniec gry). Do "Gotowy" (LOOP-04) liczą się tylko podłączeni gracze. 30 s w `balance.json`.
- Game over → ekran wyniku (fala, czas, zabójstwa per gracz) → host może wrócić do lobby i wystartować ponownie.

## 5. Potwory i drogi

Flow field liczony na siatce kafelków od pozycji żywych graczy (powaleni jako cel tylko wg reguły z 03 §1), przeliczany co 0.5 s i po każdej zmianie fortyfikacji. Postawione hard objecty i działka są nieprzechodnie dla zwykłego pola.

Reguła "obejście > 3x dłuższe lub brak → atakuj najbliższy hard object" (03 §1) i "Osiłek atakuje ścianę od razu": implementacja zostawiona builderowi; sugestia: drugie pole, w którym ściany są przechodnie z kosztem, i porównanie odległości obu pól w kafelku potwora. Miękkie rozpychanie między potworami (bez sztywnych kolizji). Spawn: 12 punktów na obwodzie, porcje wg 03 §2.3.

**Limit żywych potworów (decyzja właściciela produktu)**: max 60 naraz (`balance.json`). Gdy porcja by go przekroczyła, spawnuje się tylko tyle, ile się mieści, reszta czeka na kolejne okno spawnu. Fala kończy się jak dotąd: skład wyczerpany i wszystkie martwe. Licznik pozostałych potworów w HUD (HUD-02) obejmuje też czekające.

**Powalony gracz (decyzja właściciela produktu)**: jeśli fala skończy się, gdy gracz jest powalony, na starcie przerwy wstaje z 30 HP (jak przy podniesieniu, z 1 s nietykalności). Potwory mogą obrać powalonego za cel (03 §1) i stać przy nim, ale ich ciosy nie mają na niego wpływu (nie skracają licznika do śmierci).

## 6. Pliki i balans

- `balance.json` (w `public/`, żeby klient też mógł z niego czytać): wszystkie liczby z `02` i `03` (HP, obrażenia, prędkości, cooldowny, zasięgi w kafelkach, wagi, formuły budżetu i przerw jako współczynniki, mnożniki trudności, limity). Czytany przez serwer przy starcie; zmiana = restart serwera, bez przebudowy (TECH-07). Kod nie zawiera magicznych liczb balansu.
- Limit 200 przedmiotów (LOOP-05) liczy tylko przedmioty `NA_ZIEMI`; postawione ściany i aktywne power-upy się nie liczą (żeby fortyfikacje nie znikały same). Decyzja buildera.
- HP i obrażenia jako liczby zmiennoprzecinkowe; HUD zaokrągla w dół do całości do wyświetlenia (friendly fire 1 HP z 10 obr. musi być widoczne dokładnie, F1).
- Struktura katalogu jest decyzją buildera; ograniczenia: całość w jednym katalogu, uruchamiana `npm start`, jedyna zależność runtime `ws` (TECH-02/03).

## 7. Testy

- Logika deterministyczna (formuły fal i przerw, mnożniki trudności, friendly fire, losowanie dropu i gwarancja fali 1, reguły E/Spacja/R z tabeli 02 §3.4, limity aktywnych, walidacja nicku, kolizja kafelkowa) testowana jednostkowo przez wbudowany `node:test` (bez nowych zależności). Symulacja musi dać się uruchomić bez sieci, z wstrzykiwanym losowaniem.
- Testy akceptacyjne z `05-TEST-PLAN.md` wykonuje zespół produktowy ręcznie.

## 8. Docs do zaktualizowania razem z kodem

- `06-OPEN-QUESTIONS.md`: T1-T6 jako rozstrzygnięte (wg §3); nowe decyzje: "MVP bez bossa, fale co 5. pełny budżet", "powrót po rozłączeniu w 30 s", "limit 60 żywych potworów", "powalony na koniec fali wstaje z 30 HP, ciosy w powalonego bez skutku".
- `01-PRD.md`: SES-07 i PLR-07/08 uzupełnione o powyższe.
- `03-WAVES-DIFFICULTY.md` / `05-TEST-PLAN.md`: adnotacja, że W3 i reguła bossa dotyczą wersji z bossem.
- `README.md`: kod jest w tym repo + jak uruchomić (5 linii).
- `CHANGELOG.md`: wpis 0.5.

## 9. Zostawione builderowi

Podział na moduły, format komunikatów, projekt sprite'ów i palety, szczegóły flow fielda i ataku na ściany (w granicach §5), wygląd lobby, HUD i menu (w granicach PRD §9), efekty wizualne, kolejność implementacji.

## 10. Nie robimy

Boss, przedmioty spoza §2, audio, pad, exe/binarka, delta snapshoty, statystyki, mapy inne niż płaska, wszystko z `07-BACKLOG-V2.md`.
