// Tresci ekranu glownego (V3-K-06): porady, bestiariusz, "co nowego". Czyste dane, bez DOM.
// Bestiariusz: typ -> nazwa i jedno zdanie; kolejnosc = od pierwszej fali, w ktorej sie pojawia.

export const BESTIARY = [
  ['slime', 'Ślimak', 'Mięso armatnie. Powolny, od pierwszej fali.'],
  ['runner', 'Biegacz', 'Szybki i słaby. Omija fortyfikacje, szuka dziur.'],
  ['brute', 'Osiłek', 'Niszczy fortyfikacje. Idzie na ściany, nie na ciebie.'],
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
  'Kropelki ładują wspólny pasek ULTIMATE. Każdy używa swojego, kiedy chce.',
  'Potwory powoli niszczą ściany. Spękana ściana to ostrzeżenie.',
  'Tab przytrzymany pokazuje tablicę wyników w trakcie gry.',
  'Link do pokoju z lobby wrzuć znajomym. Wchodzą prosto do środka.',
  'Trudność wybiera host w lobby i nie zmienia się do końca partii.',
];

// Co nowego: ostatnie wersje, po jednym-dwa zdania. Najnowsza pierwsza. Aktualizowane razem z tagiem.
export const NEWS = [
  ['0.16.0', 'Nowy ekran główny: arena w tle, logo, wizytówka, karty pokojów, bestiariusz. Sterowanie jako poligon na żywo.'],
  ['0.15.0', 'Nowy dźwięk karabinu i działka z pogłosem otwartej przestrzeni. Boss zawsze dropuje boost broni.'],
  ['0.14.0', 'Rój i Boss. Fale w grupach z wykluczonym typem potwora.'],
  ['0.13.0', 'Lista pokojów i nowy flow wejścia. Strzał bez czekania na serwer.'],
];
