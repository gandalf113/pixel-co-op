# 09 - Tryb hostowany (internet)

Wersja: 0.1 (2026-11-05).

Gra pozostaje produktem z `01-PRD.md`: **LAN, bez internetu, bez instalacji**. Ten
dokument opisuje **drugi, opcjonalny tryb**, w którym ta sama baza kodu stoi pod
publicznym adresem. Wszystko tutaj jest włączane zmiennymi środowiskowymi i
**domyślnie wyłączone**.

## 1. Zgodność z TECH-01

`TECH-01` zakazuje telemetrii i zależności od internetu **w runtime gry LAN**. Tryb
LAN nie zmienia się ani o jotę: bez `STATS_URL` moduł telemetrii zwraca atrapę,
która nic nie wysyła i nie otwiera gniazd, a bez `ROOMS=1` serwer ma dokładnie
jedną sesję, jak dotąd. Artefakt dystrybucyjny skopiowany na pendrive działa na
odłączonym Wi-Fi.

## 2. Zmienne środowiskowe

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `PORT` | 3000 | port HTTP/WS |
| `HOST` | wszystkie interfejsy | adres nasłuchu; pod reverse proxy ustaw `127.0.0.1` |
| `ROOMS` | wył. | `1` = wiele pokoi z kodem zamiast jednej sesji |
| `TRUST_PROXY` | wył. | `1` = bierz adres klienta z `X-Real-IP`, ale tylko gdy połączenie przyszło z loopbacku |
| `STATS_URL` | brak | adres kolektora telemetrii; brak = telemetria wyłączona |
| `STATS_TOKEN` | brak | token w nagłówku `Authorization: Bearer` |
| `STATS_SALT` | losowa przy starcie | sól do hashowania identyfikatorów; **stała wartość** = rozpoznawanie powracających graczy przeżywa restart |
| `INSTANCE` | `local` | nazwa instancji w zdarzeniach |
| `MAX_ROOMS` | 40 | sufit liczby pokoi |
| `MAX_CONNECTIONS` | 200 | sufit połączeń WebSocket |
| `ROOMS_PER_IP` | 10 | ile nowych pokoi może założyć jeden adres w 10 minut |

## 3. Pokoje

- Kod pokoju: 4 znaki z alfabetu bez `I`, `O`, `0`, `1` (bo bywa dyktowany przez telefon).
- Wejście bez kodu zakłada nowy pokój; link `https://host/?r=KOD` wchodzi od razu do istniejącego.
- Host pokoju = **pierwszy gracz, który wszedł** (`hostPolicy: 'first'`). W LAN zostaje
  stara reguła: host to gracz z localhosta.
- Gdy host wychodzi w trakcie gry: w pokojach rola przechodzi na kolejnego gracza
  (komunikat `{t:'host'}`), gra toczy się dalej. W LAN - jak dotąd - sesja się kończy.
- Pusty pokój znika po 90 s. Ten margines jest dłuższy niż 30-sekundowy grace na
  powrót po utracie połączenia, więc odświeżenie karty nie kasuje pokoju.

## 4. Telemetria: co i po co

Cel jest jeden: odróżnić **faktyczną rozgrywkę** od wejścia na stronę, skanera i bota.

Partia liczy się jako faktyczna, gdy trwała **co najmniej 60 s** i serwer dostał
**co najmniej 200 pakietów inputu** (~7 s realnego sterowania przy 30 Hz). Liczy to
serwer, nie przeglądarka.

| Zdarzenie | Pola |
|---|---|
| `room_open` | `room`, `rooms` |
| `room_close` | `room`, `durationS`, `games`, `realGames` |
| `join` | `room`, `pid`, `nick`, `ipHash`, `players` |
| `leave` | `room`, `pid`, `nick`, `playedS`, `players` |
| `game_start` | `room`, `gameId`, `difficulty`, `players[{pid,nick,ultKind}]` |
| `game_end` | `room`, `gameId`, `reason`, `durationS`, `wave`, `difficulty`, `inputs`, `realPlay`, `players[{pid,nick,kills,downs,ultsUsed,ultKind}]` |
| `heartbeat` | `rooms`, `players`, `games`, `connections`, `uptimeS` |

Prywatność: serwer **nie wysyła adresów IP ani surowych identyfikatorów**. `pid`
pochodzi z losowej wartości w `localStorage` przeglądarki, a serwer hashuje ją z solą
(`sha256(salt:wartość)`, 16 znaków). `ipHash` powstaje tak samo z adresu IP. Nicki idą
wprost, bo są widoczne w grze i w leaderboardzie.

## 5. Leaderboard

Klient pobiera `GET /api/leaderboard` (ten endpoint wystawia kolektor statystyk, nie
serwer gry) i pokazuje go na ekranie startowym i po zakończeniu partii. Gdy endpointu
nie ma - a w LAN go nie ma - panel po prostu się nie renderuje.

Wyniki pochodzą z **autorytatywnej symulacji serwerowej** (`TECH-06`) i trafiają do
kolektora z serwera gry, z tokenem. Przeglądarka nie ma drogi, żeby wstawić tam własny
wynik.

## 6. Czego ten tryb nie zmienia

- Rozgrywka, balans, protokół snapshotów: bez zmian.
- `maxPlayers` nadal 4 - na pokój.
- Klient używa `wss://` zamiast `ws://`, gdy strona stoi na HTTPS. To jedyna zmiana w
  warstwie sieciowej klienta (wcześniej `ws://` było na sztywno, co pod HTTPS blokuje
  przeglądarka).
