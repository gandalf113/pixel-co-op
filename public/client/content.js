// Tresci ekranu glownego (V3-K-06): porady, bestiariusz, "co nowego". Czyste dane, bez DOM.
// Dwujezycznie (PL / EN): klucz typu potwora jest wspolny, teksty osobne. Funkcje zwracaja
// wersje w biezacym jezyku, zeby wolajacy nie musial wiedziec, ktory jest ustawiony.
// Bestiariusz: typ -> nazwa i jedno zdanie; kolejnosc = od pierwszej fali, w ktorej sie pojawia.
import { getLang } from './i18n.js';

const BESTIARY_PL = [
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

const BESTIARY_EN = [
  ['slime', 'Slime', 'Cannon fodder. Slow, from the first wave on.'],
  ['runner', 'Runner', 'Fast and weak. Goes around fortifications, looks for gaps.'],
  ['brute', 'Brute', 'Wrecks fortifications. Goes for walls, not for you.'],
  ['kamikaze', 'Kamikaze', 'Runs up, arms itself and blows up after 0.3 s. Killed while armed it still blows up, weaker. Shoot it from afar.'],
  ['spitter', 'Spitter', 'Keeps its distance and spits. You cannot shoot the projectile down.'],
  ['stalker', 'Stalker', 'Untouchable while hidden, circles you and strikes from the side.'],
  ['swarm', 'Swarm', 'Three at once, the smallest in the game. One shot, one less.'],
  ['ninja', 'Ninja', 'Telegraphs its charge, then flies in a straight line like a bullet.'],
  ['grenadier', 'Grenadier', 'Lobs from 10 tiles away. A marker shows where it will land.'],
  ['tank', 'Tank', '600 HP, changes colour as it takes damage. On death it breaks apart into runners.'],
  ['boss', 'Boss', 'Every 5 waves. Area slam, calls in slimes, always leaves a weapon boost.'],
];

const TIPS_PL = [
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

const TIPS_EN = [
  'The boss always leaves a weapon boost. Surviving to wave five pays off.',
  'Q rotates the wall you are holding. So does the mouse wheel.',
  'Space with an item in hand is a throw. A thrown power-up activates where it lands.',
  'G during the break between waves cuts the wait short once everyone is ready.',
  'You revive a downed ally by standing next to them. The arrow shows how many seconds they have left.',
  'Droplets charge the shared ULTIMATE bar. F fires the first one, C the second. One bar, so you choose at the moment you use it.',
  'Monsters slowly chew through walls. A cracked wall is a warning.',
  'Holding Tab shows the scoreboard during the game.',
  'Share the room link from the lobby with your friends. They walk straight in.',
  'The host picks the difficulty in the lobby and it stays until the end of the game.',
  'The Heart and the Boots are permanent. Throw them to whoever has less HP.',
  'A grenade leaves fire behind. Do not stand in it — walls burn too.',
];

// Co nowego: ostatnie wersje, po jednym-dwa zdania. Najnowsza pierwsza. Aktualizowane razem z tagiem.
const NEWS_PL = [
  ['0.26.0', 'Czat w pokoju i w grze, wejście do trwającej partii jako widz (widz pisze — gracze to widzą na ekranie), przełącznik POLSKI / ANGIELSKI przy podawaniu nicku i przycisk Opuść pokój.'],
  ['0.25.1', 'Trzęsienie ziemi: zapadnie otwierają się przy krawędzi ekranu, a nie pod nogami, i wychodzi z nich o ćwierć mniej potworów.'],
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

const NEWS_EN = [
  ['0.26.0', 'Chat in the room and in game, joining a match in progress as a spectator (spectators type — players see it on screen), a POLISH / ENGLISH switch on the nickname screen, and a Leave room button.'],
  ['0.25.1', 'Earthquake: the pits now open at the edge of the screen instead of under your feet, and a quarter fewer monsters come out of them.'],
  ['0.25.0', 'A new permanent drop: the Armorer. Whoever picks it up places stronger turrets, mines and spikes (+25% each).'],
  ['0.24.0', 'Ninja flyby event: it goes dark and ninjas streak across the whole map. Shot down in flight, one always leaves something behind.'],
  ['0.23.0', 'Earthquake event: the ground drags players together, 8 pits open around them and an extra wave climbs out.'],
  ['0.22.0', 'Post-wave events: sometimes, instead of a break, an Army of Builders runs in and puts up everything it can. More events on the way.'],
  ['0.21.0', 'A new monster: the Kamikaze. It runs up, flashes red and explodes after 0.3 s. Shoot it from afar — killed while armed it still blows up.'],
  ['0.20.0', 'Two ultimates per player: pick two in the lobby, F fires the first, C the second. One shared bar.'],
  ['0.19.1', 'The nailgun pierces monsters: each next one in the line takes 15% less.'],
  ['0.19.0', 'Grenades leave fire that burns out over 8 s and scorches everything on the tile. Darkness with a torch around the player is ready for events (F4 = preview).'],
  ['0.18.0', 'Two new permanent drops: the Heart (+10 max HP) and the Boots (+3% speed). They last the whole game and can be thrown to a teammate.'],
  ['0.17.1', 'A stronger rocket: more damage and radius, longer flight, and the blast stuns monsters for half a second.'],
  ['0.17.0', 'Rooms as their own section: a gold frame, a counter, a grid of cards with each room’s age. Settings tucked behind a button.'],
  ['0.16.0', 'A new home screen: the arena in the background, a logo, a player card, room cards, a bestiary. Controls as a live training range.'],
  ['0.15.0', 'New rifle and turret sounds with open-space reverb. The boss always drops a weapon boost.'],
  ['0.14.0', 'The Swarm and the Boss. Waves in groups with one monster type left out.'],
  ['0.13.0', 'A room list and a new way in. Shooting no longer waits for the server.'],
];

const pick = (pl, en) => (getLang() === 'en' ? en : pl);

export const bestiary = () => pick(BESTIARY_PL, BESTIARY_EN);
export const tips = () => pick(TIPS_PL, TIPS_EN);
export const news = () => pick(NEWS_PL, NEWS_EN);

// Zgodnosc wstecz dla kodu i testow, ktore siegaly po stale (zawsze polskie zrodlo).
export const BESTIARY = BESTIARY_PL;
export const TIPS = TIPS_PL;
export const NEWS = NEWS_PL;
