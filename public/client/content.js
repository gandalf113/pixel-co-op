// Tresci ekranu glownego (V3-K-06): porady, bestiariusz, "co nowego". Czyste dane, bez DOM.
// Bestiariusz: typ -> nazwa i jedno zdanie; kolejnosc = od pierwszej fali, w ktorej sie pojawia.

export const BESTIARY = [
  ['slime', 'Ślimak', 'Mięso armatnie. Powolny, od pierwszej fali.'],
  ['runner', 'Biegacz', 'Szybki i słaby. Omija fortyfikacje, szuka dziur.'],
  ['brute', 'Osiłek', 'Niszczy fortyfikacje. Idzie na ściany, nie na ciebie.'],
  ['kamikaze', 'Kamikaze', 'Podbiega, uzbraja się i po 0,3 s wybucha. Zabity uzbrojony też wybucha, słabiej. Strzelaj z daleka.'],
  ['spitter', 'Plujka', 'Trzyma dystans i pluje. Pocisku nie zestrzelisz.'],
  ['stalker', 'Skradający się', 'W ukryciu nietykalny, okrąża cię i dopada z boku.'],
  ['swarm', 'Rój', 'Trzy naraz, najmniejszy w grze. Jeden strzał, jeden mniej.'],
  ['ninja', 'Ninja', 'Telegrafuje szarżę, potem leci po linii jak pocisk.'],
  ['grenadier', 'Granatnik', 'Rzuca po łuku z 10 kafli. Marker pokazuje, gdzie spadnie.'],
  ['tank', 'Tank', '600 HP, zmienia kolor od ran. Po śmierci rozpada się na biegaczy.'],
  ['boss', 'Boss', 'Co 5 fal. Cios obszarowy, wzywa ślimaki, zawsze zostawia boost broni.'],
];

export const TIPS = [
  'Boss zawsze zostawia boost broni. Warto dożyć piątej fali.',
  'Q obraca trzymaną ścianę. Kółko myszy też.',
  'Spacja z przedmiotem w rękach to rzut. Rzucony power-up aktywuje się tam, gdzie spadnie.',
  'G w przerwie między falami skraca czekanie, gdy wszyscy są gotowi.',
  'Powalonego sojusznika podnosisz stojąc obok. Strzałka pokazuje, ile ma sekund.',
  'Kropelki ładują wspólny pasek ULTIMATE. F odpala pierwsze, C drugie. Jeden pasek, więc wybierasz w chwili użycia.',
  'Potwory powoli niszczą ściany. Spękana ściana to ostrzeżenie.',
  'Tab przytrzymany pokazuje tablicę wyników w trakcie gry.',
  'Link do pokoju z lobby wrzuć znajomym. Wchodzą prosto do środka.',
  'Trudność wybiera host w lobby i nie zmienia się do końca partii.',
  'Serce i Buty zostają na stałe. Rzuć je koledze, który ma mniej HP.',
  'Po granacie zostaje ogień. Nie stój w nim, ściany też się palą.',
];

// Co nowego: ostatnie wersje, po jednym-dwa zdania. Najnowsza pierwsza. Aktualizowane razem z tagiem.
export const NEWS = [
  ['0.25.0', 'Nowy drop na stałe: Zbrojmistrz. Kto go podniesie, stawia mocniejsze działka, miny i kolce (+25% na sztukę).'],
  ['0.24.0', 'Wydarzenie Przelot ninja: robi się ciemno, a przez całą mapę przelatują ninja. Zestrzelony w locie zawsze coś zostawia.'],
  ['0.23.0', 'Wydarzenie Trzęsienie ziemi: ziemia ciągnie graczy do siebie, wokół otwiera się 8 zapadni i wychodzi z nich dodatkowa fala.'],
  ['0.22.0', 'Wydarzenia po fali: czasem zamiast przerwy wbiega Armia budowniczych i stawia wszystko, co da się postawić. Kolejne wydarzenia w drodze.'],
  ['0.21.0', 'Nowy potwór: Kamikaze. Podbiega, miga na czerwono i wybucha po 0,3 s. Strzelaj z daleka, zabity uzbrojony też wybucha.'],
  ['0.20.0', 'Dwa ultimate na gracza: wybierasz dwa w lobby, F odpala pierwsze, C drugie. Pasek jeden, wspólny.'],
  ['0.19.1', 'Gwoździarka przebija potwory: każdy kolejny na linii dostaje 15% mniej.'],
  ['0.19.0', 'Granaty zostawiają ogień, który gaśnie przez 8 s i pali wszystko na kafelku. Ciemność z pochodnią wokół gracza gotowa pod wydarzenia (F4 = podgląd).'],
  ['0.18.0', 'Dwa nowe dropy na stałe: Serce (+10 max HP) i Buty (+3% prędkości). Działają do końca partii, rzucone można podać koledze.'],
  ['0.17.1', 'Rakieta mocniejsza: większe obrażenia i promień, dalszy lot, wybuch ogłusza potwory na pół sekundy.'],
  ['0.17.0', 'Pokoje jako osobna sekcja: złota ramka, licznik, siatka kart z wiekiem pokoju. Ustawienia schowane pod przyciskiem.'],
  ['0.16.0', 'Nowy ekran główny: arena w tle, logo, wizytówka, karty pokojów, bestiariusz. Sterowanie jako poligon na żywo.'],
  ['0.15.0', 'Nowy dźwięk karabinu i działka z pogłosem otwartej przestrzeni. Boss zawsze dropuje boost broni.'],
  ['0.14.0', 'Rój i Boss. Fale w grupach z wykluczonym typem potwora.'],
  ['0.13.0', 'Lista pokojów i nowy flow wejścia. Strzał bez czekania na serwer.'],
];
