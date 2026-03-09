#!/usr/bin/env node
/**
 * genre-fill.js — Local genre classifier for ROMs missing genre metadata.
 * Uses title pattern matching, franchise mapping, and arcade ROM name DB.
 * No API keys required.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'mollys-arcade.db');

// ─── Arcade/Neo Geo/FBNeo short ROM name → genre ───
const ARCADE_GENRES = {
    // Fighting
    '3countb': 'Fighting', 'aof': 'Fighting', 'aof2': 'Fighting', 'aof3': 'Fighting',
    'aodk': 'Fighting', 'breakers': 'Fighting', 'breakrev': 'Fighting',
    'doubledr': 'Fighting', 'eightman': 'Beat em Up', 'fatfursp': 'Fighting',
    'fatfury1': 'Fighting', 'fatfury2': 'Fighting', 'fatfury3': 'Fighting',
    'fightfev': 'Fighting', 'garou': 'Fighting', 'gowcaizr': 'Fighting',
    'kabukikl': 'Fighting', 'kizuna': 'Fighting', 'lastblad': 'Fighting',
    'lastbld2': 'Fighting', 'matrim': 'Fighting', 'mslug': 'Action',
    'mslug2': 'Action', 'mslug3': 'Action', 'mslug4': 'Action', 'mslug5': 'Action',
    'mslugx': 'Action', 'neobombe': 'Puzzle', 'ninjamas': 'Fighting',
    'rbff1': 'Fighting', 'rbff2': 'Fighting', 'rbffspec': 'Fighting',
    'roboarmy': 'Beat em Up', 'rotd': 'Fighting', 'samsh5sp': 'Fighting',
    'samsho': 'Fighting', 'samsho2': 'Fighting', 'samsho3': 'Fighting',
    'samsho4': 'Fighting', 'samsho5': 'Fighting', 'savagere': 'Fighting',
    'sengoku': 'Beat em Up', 'sengoku2': 'Beat em Up', 'sengoku3': 'Beat em Up',
    'svc': 'Fighting', 'wh1': 'Fighting', 'wh2': 'Fighting', 'wh2j': 'Fighting',
    'whp': 'Fighting', 'kof94': 'Fighting', 'kof95': 'Fighting', 'kof96': 'Fighting',
    'kof97': 'Fighting', 'kof98': 'Fighting', 'kof99': 'Fighting', 'kof2000': 'Fighting',
    'kof2001': 'Fighting', 'kof2002': 'Fighting', 'kof2003': 'Fighting',
    'sf2': 'Fighting', 'sf2ce': 'Fighting', 'sf2hf': 'Fighting', 'sf2t': 'Fighting',
    'ssf2': 'Fighting', 'ssf2t': 'Fighting', 'sfa': 'Fighting', 'sfa2': 'Fighting',
    'sfa3': 'Fighting', 'sfiii': 'Fighting', 'sfiii2nd': 'Fighting', 'sfiii3rd': 'Fighting',
    'vsav': 'Fighting', 'vsav2': 'Fighting', 'vhunt2': 'Fighting',
    'dstlk': 'Fighting', 'nwarr': 'Fighting', 'vampj': 'Fighting',
    'msh': 'Fighting', 'mshvsf': 'Fighting', 'mvsc': 'Fighting', 'mvsc2': 'Fighting',
    'xmvsf': 'Fighting', 'xmcota': 'Fighting', 'cybots': 'Fighting',
    'warzard': 'Fighting', 'jojo': 'Fighting', 'jojoban': 'Fighting',
    'tekken': 'Fighting', 'tekken2': 'Fighting', 'tekken3': 'Fighting',
    'soulclbr': 'Fighting', 'mk': 'Fighting', 'mk2': 'Fighting', 'mk3': 'Fighting',
    'umk3': 'Fighting', 'turfmast': 'Sports', 'suprspo': 'Sports',

    // Shooters (shmups)
    '1941': 'Shooter', '1942': 'Shooter', '1943': 'Shooter', '1943kai': 'Shooter',
    '1944': 'Shooter', '19xx': 'Shooter', 'alpham2': 'Shooter',
    'batsugun': 'Shooter', 'blazstar': 'Shooter', 'bstar': 'Shooter',
    'ddonpach': 'Shooter', 'donpachi': 'Shooter', 'esprade': 'Shooter',
    'guwange': 'Shooter', 'progear': 'Shooter', 'strikers': 'Shooter',
    's1945': 'Shooter', 's1945ii': 'Shooter', 's1945iii': 'Shooter',
    'aero': 'Shooter', 'aerofgt': 'Shooter', 'ajax': 'Shooter',
    'gforce2': 'Shooter', 'gradius': 'Shooter', 'gradius2': 'Shooter',
    'gradius3': 'Shooter', 'lifefrce': 'Shooter', 'parodius': 'Shooter',
    'trigon': 'Shooter', 'twinbee': 'Shooter', 'lastresrt': 'Shooter',
    'pulstar': 'Shooter', 'viewpoin': 'Shooter', 'andro': 'Shooter',
    'androdun': 'Shooter', 'crsword': 'Action', 'ctomaday': 'Shooter',
    'cyberlip': 'Action', 'flipshot': 'Action', 'ghostlop': 'Puzzle',
    'irritat': 'Shooter', 'janshin': 'Puzzle', 'joyjoy': 'Shooter',
    'kotm': 'Fighting', 'kotm2': 'Fighting', 'lresort': 'Shooter',
    'magdrop2': 'Puzzle', 'magdrop3': 'Puzzle', 'maglord': 'Action',
    'miexchng': 'Puzzle', 'minasan': 'Puzzle', 'mosyougi': 'Strategy',
    'nam1975': 'Shooter', 'ncombat': 'Beat em Up', 'ncommand': 'Shooter',
    'overtop': 'Racing', 'panicbom': 'Puzzle', 'pbobbl2n': 'Puzzle',
    'pbobblen': 'Puzzle', 'pgoal': 'Sports', 'pnyaa': 'Puzzle',
    'popbounc': 'Puzzle', 'preisle2': 'Shooter', 'pspikes2': 'Sports',
    'ragnagrd': 'Fighting', 'ridhero': 'Racing', 'socbrawl': 'Sports',
    'sonicwi2': 'Shooter', 'sonicwi3': 'Shooter', 'spinmast': 'Platformer',
    'ssideki': 'Sports', 'ssideki2': 'Sports', 'ssideki3': 'Sports',
    'ssideki4': 'Sports', 'stakwin': 'Sports', 'stakwin2': 'Sports',
    'strhoop': 'Sports', 'superspy': 'Beat em Up', 'tophuntr': 'Action',
    'tpgolf': 'Sports', 'trally': 'Racing', 'turfmast': 'Sports',
    'twsoc96': 'Sports', 'tws96': 'Sports', 'viewpoin': 'Shooter',
    'vliner': 'Puzzle', 'wakuwak7': 'Fighting', 'wjammers': 'Sports',
    'zedblade': 'Shooter', 'zintrckb': 'Puzzle', 'zupapa': 'Platformer',
    'bstars': 'Sports', 'bstars2': 'Sports',

    // Beat em ups
    'avsp': 'Beat em Up', 'baddudes': 'Beat em Up', 'captcomm': 'Beat em Up',
    'ddtod': 'Beat em Up', 'ddsom': 'Beat em Up', 'dino': 'Beat em Up',
    'ffight': 'Beat em Up', 'ffightu': 'Beat em Up',
    'knights': 'Beat em Up', 'punisher': 'Beat em Up', 'tmnt': 'Beat em Up',
    'tmnt2': 'Beat em Up', 'simpsons': 'Beat em Up', 'xmen': 'Beat em Up',
    'turtles': 'Beat em Up', 'fbfrenzy': 'Sports', 'burningf': 'Beat em Up',
    'burningfh': 'Beat em Up',

    // Platformers
    'bombjack': 'Platformer', 'bjourney': 'Platformer', 'snowbros': 'Platformer',
    'snowbro2': 'Platformer', 'bubblem': 'Platformer', 'bublbobl': 'Platformer',
    'bublboblr': 'Platformer', 'bublbob2': 'Platformer',
    'pinocchio': 'Platformer', 'congo': 'Platformer', 'mtwins': 'Platformer',
    'willow': 'Action', 'todruaga': 'Action', 'pengo': 'Puzzle',
    'rbisland': 'Platformer', 'twinspri': 'Platformer', 'spinmast': 'Platformer',
    'zupapa': 'Platformer',

    // More Shooters
    'raiden2': 'Shooter', 'raidendx': 'Shooter', 'rtype': 'Shooter',
    'rtype2': 'Shooter', 'varth': 'Shooter', 'xevious': 'Shooter',
    'gyruss': 'Shooter', 'invaders': 'Shooter', 'mooncrst': 'Shooter',
    'milliped': 'Shooter', 'centiped': 'Shooter', 'galaxyfg': 'Shooter',
    'stargate': 'Shooter', 'timeplt': 'Shooter', 'salamand': 'Shooter',
    'thunderx': 'Shooter', 'gpilots': 'Shooter', 'shocktro': 'Shooter',
    'nitd': 'Beat em Up', 'ganryu': 'Action', 'garoupy': 'Fighting',
    'sf2thndr': 'Fighting', 'alpha1v': 'Shooter', 'astrob': 'Shooter',
    'astrof': 'Shooter', 'area88': 'Shooter', 'cawing': 'Shooter',
    'forgottn': 'Action', 'drgnbstr': 'Action',

    // More Beat em Ups
    'vendetta': 'Beat em Up', 'crimfght': 'Beat em Up',
    'growl': 'Beat em Up', 'hook': 'Beat em Up', 'kod': 'Beat em Up',
    'btoads': 'Beat em Up', 'denjinmk': 'Beat em Up',

    // More Fighting
    'kinst': 'Fighting', 'kinst2': 'Fighting', 'matmania': 'Wrestling',
    'kof99hp': 'Fighting',

    // Action/Run-n-Gun
    'cabal': 'Shooter', 'commando': 'Shooter', 'mercs': 'Shooter',
    'gunsmoke': 'Shooter', 'jackal': 'Shooter', 'robocop': 'Action',
    'sdodgeb': 'Sports', 'punkshot': 'Sports', 'neocup98': 'Sports',
    'ironhors': 'Action', 'contcirc': 'Racing', 'cruisin': 'Racing',
    'gtmr': 'Racing', 'hotrod': 'Racing',

    // Classics
    'btime': 'Platformer', 'foodf': 'Action', 'ladybug': 'Action',
    'mappy': 'Platformer', 'rallyx': 'Racing', 'rastan': 'Action',
    'tapper': 'Action', 'tutankhm': 'Action', 'pooyan': 'Shooter',
    'popeye': 'Action', 'pong': 'Sports', 'kangaroo': 'Platformer',
    'kungfum': 'Beat em Up', 'karnovr': 'Action',
    'cameltry': 'Puzzle', 'puzzledp': 'Puzzle', 'pbobble': 'Puzzle',
    'pbobble2': 'Puzzle', 'jockeygp': 'Racing', 'journey': 'Action',
    'gng': 'Platformer', 'ghouls': 'Platformer',
    'airwolf': 'Shooter', 'altbeast': 'Beat em Up', 'blktiger': 'Platformer',
    'circusc': 'Action', 'chikij': 'Action', 'aa': 'Shooter',
    'alpine': 'Sports', '3wonders': 'Action', 'asuka': 'Action',
    'b2b': 'Action', 'mutnat': 'Shooter',
    // Wave 3 arcade
    'rygar': 'Platformer', 'ddragon': 'Beat em Up', 'ddragon2': 'Beat em Up',
    'aliens': 'Beat em Up', 'atarisy1': 'Action',
    'goalx3': 'Sports', 'gururin': 'Puzzle', 'irrmaze': 'Puzzle',
    'legendos': 'Action', 'mahretsu': 'Puzzle', 'marukodq': 'Puzzle',
    'neodrift': 'Racing', 'neomrdo': 'Platformer',
    'puzzldpr': 'Puzzle', 'quizdai2': 'Puzzle', 'quizdais': 'Puzzle',
    'quizkof': 'Puzzle', 'rbff1a': 'Fighting', 'shocktr2': 'Shooter',

    // Puzzle
    'arkanoid': 'Puzzle', 'columns': 'Puzzle', 'puyo': 'Puzzle',
    'puyopuyo': 'Puzzle', 'tetris': 'Puzzle', 'qbert': 'Puzzle',
    'bangbead': 'Puzzle', 'klax': 'Puzzle',

    // Sports
    '2020bb': 'Sports', 'nbahangt': 'Sports', 'nbajam': 'Sports',
    'nbajamte': 'Sports', 'nbamaximumhangtime': 'Sports',

    // Racing
    'crusnusa': 'Racing', 'crusnwld': 'Racing', 'daytona': 'Racing',
    'outrun': 'Racing',

    // Classic
    'pacman': 'Action', 'mspacman': 'Action', 'galaga': 'Shooter',
    'galaxian': 'Shooter', 'digdug': 'Action', 'amidar': 'Action',
    'asteroid': 'Shooter', 'berzerk': 'Shooter', 'bosco': 'Shooter',
    'bagman': 'Platformer', 'bakatono': 'Puzzle', 'arabianm': 'Platformer',

    'dkong': 'Platformer', 'dkongjr': 'Platformer', 'dkong3': 'Platformer',
    'mario': 'Platformer', 'mariobrothers': 'Platformer',
    'frogger': 'Action', 'centipede': 'Shooter', 'millipede': 'Shooter',
    'defender': 'Shooter', 'joust': 'Action', 'robotron': 'Shooter',
    'scramble': 'Shooter', 'phoenix': 'Shooter', 'zaxxon': 'Shooter',
    'tempest': 'Shooter', 'battlezone': 'Shooter', 'starwars': 'Shooter',
    'gauntlet': 'Action', 'gauntlet2': 'Action', 'paperboy': 'Action',
    'rampage': 'Action', 'spyhunter': 'Racing', 'polepos': 'Racing',
    'polepos2': 'Racing', 'mrdo': 'Platformer', 'burgertime': 'Platformer',
    'venture': 'Action', 'tron': 'Action',
};

// ─── Franchise / series → genre (matches anywhere in title) ───
const FRANCHISE_GENRES = [
    // Fighting
    [/street fighter|streetfighter/i, 'Fighting'],
    [/mortal kombat|mortalkombat/i, 'Fighting'],
    [/tekken/i, 'Fighting'],
    [/soul calibur|soulcalibur|soul blade/i, 'Fighting'],
    [/king of fighters|kof \d/i, 'Fighting'],
    [/fatal fury/i, 'Fighting'],
    [/samurai shodown|samurai spirits/i, 'Fighting'],
    [/dead or alive/i, 'Fighting'],
    [/virtua fighter/i, 'Fighting'],
    [/guilty gear/i, 'Fighting'],
    [/blazblue/i, 'Fighting'],
    [/dragon ball.*(fighter|budokai|tenkaichi|butouden|raging)/i, 'Fighting'],
    [/killer instinct/i, 'Fighting'],
    [/primal rage/i, 'Fighting'],
    [/clayfighter/i, 'Fighting'],
    [/power instinct/i, 'Fighting'],
    [/world heroes/i, 'Fighting'],
    [/battle arena toshinden/i, 'Fighting'],
    [/bloody roar/i, 'Fighting'],
    [/rival schools/i, 'Fighting'],
    [/marvel.*capcom|capcom.*marvel/i, 'Fighting'],
    [/x-men.*street fighter/i, 'Fighting'],
    [/darkstalkers/i, 'Fighting'],
    [/cosmic carnage/i, 'Fighting'],
    [/bushido blade/i, 'Fighting'],
    [/ehrgeiz/i, 'Fighting'],
    [/dissidia/i, 'Fighting'],
    [/pocket fighter/i, 'Fighting'],

    // Beat em Up
    [/streets of rage/i, 'Beat em Up'],
    [/final fight/i, 'Beat em Up'],
    [/double dragon/i, 'Beat em Up'],
    [/golden axe/i, 'Beat em Up'],
    [/river city/i, 'Beat em Up'],
    [/battletoads/i, 'Beat em Up'],
    [/teenage mutant|tmnt|turtles in time/i, 'Beat em Up'],
    [/x-men.*mutant apocalypse/i, 'Beat em Up'],
    [/captain commando/i, 'Beat em Up'],
    [/cadillacs.*dinosaurs/i, 'Beat em Up'],
    [/punisher/i, 'Beat em Up'],
    [/knights of the round/i, 'Beat em Up'],
    [/aliens vs.*predator/i, 'Beat em Up'],
    [/scott pilgrim/i, 'Beat em Up'],
    [/dynasty warriors/i, 'Beat em Up'],
    [/warriors orochi/i, 'Beat em Up'],

    // Platformer
    [/mario\b(?!.*kart|.*tennis|.*golf|.*party|.*baseball|.*strikers|.*basketball)/i, 'Platformer'],
    [/sonic\b(?!.*racing|.*riders|.*shuffle)/i, 'Platformer'],
    [/mega man|megaman|rockman/i, 'Platformer'],
    [/castlevania|akumaj/i, 'Platformer'],
    [/metroid/i, 'Platformer'],
    [/kirby/i, 'Platformer'],
    [/donkey kong(?!.*konga)/i, 'Platformer'],
    [/rayman/i, 'Platformer'],
    [/crash bandicoot/i, 'Platformer'],
    [/spyro/i, 'Platformer'],
    [/ratchet.*clank/i, 'Platformer'],
    [/jak.*daxter/i, 'Platformer'],
    [/banjo/i, 'Platformer'],
    [/klonoa/i, 'Platformer'],
    [/shovel knight/i, 'Platformer'],
    [/ghosts.*goblins|ghouls.*ghosts|makaimura/i, 'Platformer'],
    [/contra\b/i, 'Platformer'],
    [/strider/i, 'Platformer'],
    [/shinobi/i, 'Platformer'],
    [/vectorman/i, 'Platformer'],
    [/earthworm jim/i, 'Platformer'],
    [/ristar/i, 'Platformer'],
    [/aladdin/i, 'Platformer'],
    [/lion king/i, 'Platformer'],
    [/jungle book/i, 'Platformer'],
    [/pitfall/i, 'Platformer'],
    [/blackthorne/i, 'Platformer'],
    [/choplifter/i, 'Platformer'],
    [/crazy climber/i, 'Platformer'],
    [/lode runner/i, 'Platformer'],
    [/rainbow islands/i, 'Platformer'],
    [/bubble bobble/i, 'Platformer'],
    [/snow bros/i, 'Platformer'],
    [/wonder boy/i, 'Platformer'],
    [/alex kidd/i, 'Platformer'],
    [/ecco.*dolphin/i, 'Platformer'],
    [/pinocchio/i, 'Platformer'],
    [/bonk/i, 'Platformer'],
    [/adventure island/i, 'Platformer'],
    [/kid icarus/i, 'Platformer'],
    [/ducktales|duck tales/i, 'Platformer'],
    [/chip.*dale/i, 'Platformer'],
    [/little nemo/i, 'Platformer'],

    // RPG
    [/final fantasy(?!.*tactics)/i, 'RPG'],
    [/dragon quest|dragon warrior/i, 'RPG'],
    [/pokemon|pok.?mon/i, 'RPG'],
    [/chrono trigger|chrono cross/i, 'RPG'],
    [/breath of fire/i, 'RPG'],
    [/suikoden/i, 'RPG'],
    [/tales of /i, 'RPG'],
    [/phantasy star/i, 'RPG'],
    [/shining force/i, 'Strategy RPG'],
    [/fire emblem/i, 'Strategy RPG'],
    [/final fantasy tactics/i, 'Strategy RPG'],
    [/ogre battle|tactics ogre/i, 'Strategy RPG'],
    [/disgaea/i, 'Strategy RPG'],
    [/langrisser/i, 'Strategy RPG'],
    [/wizardry/i, 'RPG'],
    [/ultima/i, 'RPG'],
    [/earthbound|mother\b/i, 'RPG'],
    [/xenogears|xenosaga/i, 'RPG'],
    [/persona\b/i, 'RPG'],
    [/shin megami|megami tensei/i, 'RPG'],
    [/kingdom hearts/i, 'Action RPG'],
    [/secret of mana|seiken densetsu/i, 'Action RPG'],
    [/ys\b/i, 'Action RPG'],
    [/digimon/i, 'RPG'],
    [/saga\b.*frontier|romancing saga|makai.*saga/i, 'RPG'],
    [/star ocean/i, 'RPG'],
    [/lufia/i, 'RPG'],
    [/golden sun/i, 'RPG'],
    [/mario.*rpg|paper mario/i, 'RPG'],
    [/lunar\b/i, 'RPG'],
    [/grandia/i, 'RPG'],
    [/valkyrie profile/i, 'RPG'],
    [/wild arms/i, 'RPG'],
    [/legend of dragoon/i, 'RPG'],
    [/skies of arcadia/i, 'RPG'],
    [/shenmue/i, 'Adventure'],
    [/neverland/i, 'RPG'],
    [/medabots|medarot/i, 'RPG'],
    [/hunter.*hunter/i, 'RPG'],

    // Adventure / Action Adventure
    [/zelda|link.*past|link.*awakening/i, 'Adventure'],
    [/resident evil|biohazard/i, 'Survival Horror'],
    [/silent hill/i, 'Survival Horror'],
    [/metal gear/i, 'Stealth'],
    [/tomb raider/i, 'Adventure'],
    [/legacy of kain|soul reaver/i, 'Adventure'],
    [/onimusha/i, 'Action'],
    [/devil may cry/i, 'Action'],
    [/god of war/i, 'Action'],
    [/neon genesis evangelion|evangelion/i, 'Action'],
    [/gundam/i, 'Action'],

    // Shooter
    [/gradius|nemesis/i, 'Shooter'],
    [/r-type/i, 'Shooter'],
    [/thunder force/i, 'Shooter'],
    [/darius/i, 'Shooter'],
    [/raiden\b/i, 'Shooter'],
    [/galaga/i, 'Shooter'],
    [/space invaders/i, 'Shooter'],
    [/star fox|starfox/i, 'Shooter'],
    [/doom\b/i, 'FPS'],
    [/quake\b/i, 'FPS'],
    [/wolfenstein/i, 'FPS'],
    [/duke nukem/i, 'FPS'],
    [/hexen/i, 'FPS'],
    [/turok/i, 'FPS'],
    [/goldeneye/i, 'FPS'],
    [/perfect dark/i, 'FPS'],
    [/judgement silversword/i, 'Shooter'],
    [/last resort/i, 'Shooter'],
    [/asteroids?$/i, 'Shooter'],
    [/centipede/i, 'Shooter'],
    [/missile command/i, 'Shooter'],
    [/tempest/i, 'Shooter'],
    [/afterburner|after burner/i, 'Shooter'],
    [/twinbee/i, 'Shooter'],
    [/parodius/i, 'Shooter'],
    [/gunbird/i, 'Shooter'],
    [/strikers 1945|s1945/i, 'Shooter'],
    [/batsugun/i, 'Shooter'],

    // Racing
    [/mario kart/i, 'Racing'],
    [/gran turismo/i, 'Racing'],
    [/need for speed/i, 'Racing'],
    [/ridge racer/i, 'Racing'],
    [/f-zero/i, 'Racing'],
    [/wave race/i, 'Racing'],
    [/top gear|road rash/i, 'Racing'],
    [/wipeout/i, 'Racing'],
    [/cruis.*usa|cruis.*world/i, 'Racing'],
    [/daytona/i, 'Racing'],
    [/outrun|out run/i, 'Racing'],
    [/motocross|supercross/i, 'Racing'],
    [/nascar/i, 'Racing'],
    [/pole position/i, 'Racing'],
    [/final lap/i, 'Racing'],
    [/formula\b.*\b(one|1|grand prix)/i, 'Racing'],
    [/micro machines/i, 'Racing'],
    [/super off road/i, 'Racing'],
    [/rock.*roll racing/i, 'Racing'],
    [/excitebike/i, 'Racing'],
    [/rad racer/i, 'Racing'],
    [/rc pro.am/i, 'Racing'],

    // Sports
    [/fifa\b|fifa soccer/i, 'Sports'],
    [/madden\b/i, 'Sports'],
    [/nba\b.*\b(jam|live|2k|hangtime|showtime)/i, 'Sports'],
    [/nfl\b/i, 'Sports'],
    [/nhl\b/i, 'Sports'],
    [/mlb\b/i, 'Sports'],
    [/tennis/i, 'Sports'],
    [/golf\b/i, 'Sports'],
    [/baseball/i, 'Sports'],
    [/basketball/i, 'Sports'],
    [/football\b(?!.*fantasy)/i, 'Sports'],
    [/soccer\b/i, 'Sports'],
    [/hockey/i, 'Sports'],
    [/bowling/i, 'Sports'],
    [/boxing\b/i, 'Boxing'],
    [/punch.?out/i, 'Boxing'],
    [/volleyball/i, 'Sports'],
    [/skating/i, 'Sports'],
    [/snowboard/i, 'Sports'],
    [/surfing/i, 'Sports'],
    [/track.*field|olympic/i, 'Sports'],
    [/pro yakyuu|baseball star|world stadium/i, 'Sports'],
    [/wonder stadium/i, 'Sports'],
    [/pro wrestling|fire pro|shin nihon pro/i, 'Wrestling'],
    [/wwf|wwe|wcw/i, 'Wrestling'],
    [/wrestling/i, 'Wrestling'],
    [/fishing/i, 'Sports'],

    // Puzzle
    [/tetris/i, 'Puzzle'],
    [/puyo/i, 'Puzzle'],
    [/puzzle bobble|bust.a.move/i, 'Puzzle'],
    [/dr\.\s?mario/i, 'Puzzle'],
    [/columns/i, 'Puzzle'],
    [/panel de pon|puzzle league/i, 'Puzzle'],
    [/arkanoid|breakout/i, 'Puzzle'],
    [/lemmings/i, 'Puzzle'],
    [/magical drop/i, 'Puzzle'],
    [/gunpey/i, 'Puzzle'],
    [/mr\.?\s?driller/i, 'Puzzle'],
    [/mahjong|mahjongg/i, 'Puzzle'],
    [/reversi|othello/i, 'Puzzle'],
    [/shanghai/i, 'Puzzle'],
    [/sokoban/i, 'Puzzle'],
    [/picross|nonogram/i, 'Puzzle'],
    [/hanafuda/i, 'Card Game'],
    [/trump.*collection/i, 'Card Game'],
    [/card.*game|card.*battle/i, 'Card Game'],
    [/chess|shogi/i, 'Strategy'],
    [/gomoku/i, 'Strategy'],

    // Simulation
    [/sim city|simcity/i, 'Simulation'],
    [/harvest moon|bokujou monogatari/i, 'Simulation'],
    [/animal crossing/i, 'Simulation'],
    [/flight.*sim/i, 'Simulation'],
    [/densha de go/i, 'Simulation'],
    [/derby|keiba|horse racing/i, 'Simulation'],
    [/pachinko|pachi.?slot/i, 'Simulation'],

    // Strategy
    [/advance wars/i, 'Strategy'],
    [/civilization/i, 'Strategy'],
    [/nobunaga/i, 'Strategy'],
    [/romance.*three kingdoms/i, 'Strategy'],
    [/worms\b/i, 'Strategy'],

    // Rhythm
    [/dance dance|ddr\b/i, 'Rhythm'],
    [/guitar hero/i, 'Rhythm'],
    [/parappa/i, 'Rhythm'],
    [/rhythm\b/i, 'Rhythm'],

    // Party
    [/mario party/i, 'Party'],
    [/wario.*ware/i, 'Party'],
    [/bomberman/i, 'Action'],

    // Light Gun
    [/duck hunt/i, 'Light Gun'],
    [/house of.*dead/i, 'Light Gun'],
    [/time crisis/i, 'Light Gun'],
    [/alien brigade/i, 'Light Gun'],

    // Pinball
    [/pinball/i, 'Pinball'],
    [/pinbot/i, 'Pinball'],
    [/devil's crush|alien crush|dragon's fury/i, 'Pinball'],

    // More Platformers
    [/batman\b/i, 'Platformer'],
    [/spider.?man/i, 'Platformer'],
    [/tiny toon|animaniacs/i, 'Platformer'],
    [/bugs bunny/i, 'Platformer'],
    [/daffy duck/i, 'Platformer'],
    [/darkwing duck/i, 'Platformer'],
    [/toki\b/i, 'Platformer'],
    [/air zonk/i, 'Platformer'],
    [/bonk|pc kid/i, 'Platformer'],
    [/bravoman/i, 'Platformer'],
    [/scrapyard dog/i, 'Platformer'],
    [/viking child/i, 'Platformer'],
    [/shadow of the beast/i, 'Platformer'],
    [/asterix\b/i, 'Platformer'],
    [/cool spot/i, 'Platformer'],
    [/chuck rock/i, 'Platformer'],
    [/plucky duck/i, 'Platformer'],
    [/zool\b/i, 'Platformer'],
    [/bubsy/i, 'Platformer'],
    [/flappy bird/i, 'Platformer'],
    [/pac.?man|pac.?land|ms\s*pac/i, 'Action'],
    [/alien\s*3/i, 'Action'],
    [/captain america/i, 'Action'],
    [/ninja gaiden/i, 'Action'],
    [/ikari warriors/i, 'Shooter'],
    [/commando\b/i, 'Shooter'],
    [/blazing lazers/i, 'Shooter'],
    [/dead moon/i, 'Shooter'],
    [/soldier blade|final soldier|super star soldier|star soldier/i, 'Shooter'],
    [/cyber core/i, 'Shooter'],
    [/aero blasters/i, 'Shooter'],
    [/bloody wolf/i, 'Action'],

    // More classic games
    [/frogger/i, 'Action'],
    [/joust\b/i, 'Action'],
    [/robotron/i, 'Shooter'],
    [/scramble\b/i, 'Shooter'],
    [/moon patrol/i, 'Shooter'],
    [/defender\b/i, 'Shooter'],
    [/rampage\b/i, 'Action'],
    [/rampart\b/i, 'Strategy'],
    [/gauntlet/i, 'Action'],
    [/marble madness/i, 'Puzzle'],
    [/karateka/i, 'Fighting'],
    [/kung.?fu/i, 'Beat em Up'],
    [/desert strike|jungle strike|urban strike/i, 'Action'],
    [/star wars\b/i, 'Action'],
    [/iron soldier/i, 'Action'],
    [/cybermorph/i, 'Shooter'],
    [/alien vs|avp\b/i, 'Action'],
    [/syndicate/i, 'Strategy'],
    [/theme park/i, 'Simulation'],
    [/california games|summer games|winter games/i, 'Sports'],
    [/hard drivin|road riot/i, 'Racing'],
    [/checkered flag/i, 'Racing'],
    [/super burnout/i, 'Racing'],
    [/atari karts/i, 'Racing'],
    [/club drive/i, 'Racing'],
    [/roadblasters/i, 'Racing'],
    [/chase h\s*q/i, 'Racing'],
    [/qix\b/i, 'Puzzle'],
    [/loopz/i, 'Puzzle'],
    [/klax\b/i, 'Puzzle'],
    [/baku baku/i, 'Puzzle'],
    [/dr\.?\s*robotnik.*mean bean/i, 'Puzzle'],
    [/devilish/i, 'Puzzle'],
    [/casino|poker|blackjack/i, 'Card Game'],
    [/battleship/i, 'Strategy'],
    [/impossible mission/i, 'Action'],
    [/power factor|electrocop/i, 'Action'],
    [/sailor moon/i, 'Action'],
    [/beavis.*butt/i, 'Action'],
    [/total carnage/i, 'Shooter'],
    [/cadash/i, 'Action RPG'],
    [/d\s*&\s*d|dungeons.*dragons/i, 'RPG'],
    [/fantasy zone/i, 'Shooter'],
    [/don doko don/i, 'Platformer'],
    [/doraemon/i, 'Platformer'],
    [/biomotor/i, 'RPG'],
    [/cool boarders/i, 'Sports'],
    [/neo turf masters|big tournament golf/i, 'Sports'],

    // Wave 3 — remaining recognizable titles
    [/tony hawk/i, 'Sports'],
    [/crazy taxi/i, 'Racing'],
    [/jet set radio/i, 'Action'],
    [/space channel 5/i, 'Rhythm'],
    [/hydro thunder/i, 'Racing'],
    [/twisted metal/i, 'Action'],
    [/syphon filter/i, 'Action'],
    [/parasite eve/i, 'RPG'],
    [/dino crisis/i, 'Survival Horror'],
    [/tenchu/i, 'Stealth'],
    [/medievo|medievil/i, 'Platformer'],
    [/gex\b/i, 'Platformer'],
    [/driver\s*2|driver\b/i, 'Racing'],
    [/panzer dragoon/i, 'Shooter'],
    [/fighters megamix/i, 'Fighting'],
    [/elevator action/i, 'Action'],
    [/christmas nights|nights into dreams/i, 'Platformer'],
    [/vandal hearts|vanguard bandits/i, 'Strategy RPG'],
    [/thousand arms/i, 'RPG'],
    [/um jammer lammy/i, 'Rhythm'],
    [/starcraft/i, 'Strategy'],
    [/super smash bros/i, 'Fighting'],
    [/mischief makers/i, 'Platformer'],
    [/mystical ninja|goemon/i, 'Platformer'],
    [/yoshi/i, 'Platformer'],
    [/demons? crest/i, 'Platformer'],
    [/sunset riders/i, 'Shooter'],
    [/zombies ate|ghoul patrol/i, 'Shooter'],
    [/joe and mac|joe.*mac/i, 'Platformer'],
    [/cybernator/i, 'Action'],
    [/shadowrun/i, 'RPG'],
    [/evo search/i, 'RPG'],
    [/toy story/i, 'Platformer'],
    [/wario\b/i, 'Platformer'],
    [/tom clancy|rainbow six/i, 'FPS'],
    [/pursuit force/i, 'Action'],
    [/resistance.*retribution/i, 'Shooter'],
    [/lumines/i, 'Puzzle'],
    [/daxter/i, 'Platformer'],
    [/jeanne d'arc/i, 'Strategy RPG'],
    [/3rd birthday/i, 'Shooter'],
    [/fist of.*north star|hokuto/i, 'Fighting'],
    [/blasto/i, 'Platformer'],
    [/space harrier/i, 'Shooter'],
    [/zaxxon/i, 'Shooter'],
    [/kenseiden/i, 'Action'],
    [/zillion/i, 'Action'],
    [/enduro racer/i, 'Racing'],
    [/aerial assault/i, 'Shooter'],
    [/metropolis street racer|msr\b/i, 'Racing'],
    [/alien front/i, 'Shooter'],
    [/gigawing/i, 'Shooter'],
    [/confidential mission/i, 'Light Gun'],
    [/carrier\b/i, 'Survival Horror'],
    [/incoming\b/i, 'Shooter'],
    [/soul fighter/i, 'Fighting'],
    [/silver\b/i, 'RPG'],
    [/slave zero/i, 'Action'],
    [/demolition racer/i, 'Racing'],
    [/test drive/i, 'Racing'],
    [/tokyo.*racer/i, 'Racing'],
    [/ooga booga/i, 'Action'],
    [/typing of the dead/i, 'Action'],
    [/wetrix/i, 'Puzzle'],
    [/wacky races/i, 'Racing'],
    [/18 wheeler/i, 'Racing'],
    [/virtua cop/i, 'Light Gun'],
    [/virtua striker/i, 'Sports'],
    [/powerslave|exhumed/i, 'FPS'],
    [/shellshock/i, 'Action'],
    [/soviet strike/i, 'Action'],
    [/space jam/i, 'Sports'],
    [/last bronx/i, 'Fighting'],
    [/skeleton warrior/i, 'Action'],
    [/johnny bazookatone/i, 'Platformer'],
    [/independence day/i, 'Shooter'],
    [/blazing heroes/i, 'RPG'],
    [/black dawn/i, 'Shooter'],
    [/enemy zero/i, 'Survival Horror'],
    [/steep slope sliders/i, 'Sports'],
    [/winter heat|winter games/i, 'Sports'],
    [/nba\b/i, 'Sports'],
    [/off.?world interceptor/i, 'Racing'],
    [/legend of oasis/i, 'Adventure'],
    [/cotton\b/i, 'Shooter'],
    [/snk.*capcom.*card|card fighters/i, 'Card Game'],
    [/snk gals.*fighters/i, 'Fighting'],
    [/last blade/i, 'Fighting'],
    [/metal slug/i, 'Action'],
    [/dark arms/i, 'RPG'],
    [/delta warp/i, 'Shooter'],
    [/evolution.*dungeons|evolution.*eternal/i, 'RPG'],
    [/dynamite slugger/i, 'Sports'],
    [/dive alert/i, 'Action'],
    [/faselei/i, 'Strategy'],
    [/landstalker|beyond oasis/i, 'Adventure'],
    [/MUSHA|musha/i, 'Shooter'],
    [/dynamite headdy/i, 'Platformer'],
    [/king of the monsters/i, 'Fighting'],
    [/ren.*stimpy/i, 'Platformer'],
    [/aero.*acro.?bat|awesome possum/i, 'Platformer'],
    [/alien storm/i, 'Beat em Up'],
    [/arrow flash|air buster/i, 'Shooter'],
    [/atomic runner|atomic robo/i, 'Action'],
    [/arcus odyssey/i, 'RPG'],
    [/aerobiz/i, 'Simulation'],
    [/american gladiators/i, 'Sports'],
    [/art of fighting/i, 'Fighting'],
    [/adventur/i, 'Adventure'],
    [/vampire killer/i, 'Platformer'],
    [/simpsons/i, 'Platformer'],
    [/aaahh.*real monsters/i, 'Platformer'],
    [/addams family/i, 'Platformer'],
    [/3 ninjas/i, 'Beat em Up'],
    [/back to the future/i, 'Action'],
    [/barbie/i, 'Action'],
    [/barkley.*jam/i, 'Sports'],
    [/688 attack sub|sub.*marine/i, 'Simulation'],
    [/6.pak|funpak|collection/i, 'Action'],
    [/arch rivals/i, 'Sports'],
    [/f-?18|tomcat.*fighter|falcon\b|ace of aces/i, 'Simulation'],
    [/ace.*aces/i, 'Simulation'],
    [/cross.*bow/i, 'Shooter'],
    [/dark chamber/i, 'Adventure'],
    [/desert falcon/i, 'Shooter'],
    [/ballblazer/i, 'Sports'],
    [/basketbrawl/i, 'Sports'],
    [/pit fighter/i, 'Fighting'],
    [/q.?bert/i, 'Action'],
    [/xevious/i, 'Shooter'],
    [/gorf\b/i, 'Shooter'],
    [/clock tower/i, 'Survival Horror'],
    [/dr\.?\s*slump/i, 'Action'],
    [/super r.?type|r-type/i, 'Shooter'],
    [/xenophobe/i, 'Shooter'],
    [/xybots/i, 'Shooter'],
    [/warbird/i, 'Shooter'],
    [/zarlor mercenary/i, 'Shooter'],
    [/crystal mines/i, 'Puzzle'],
    [/gordo/i, 'Platformer'],
    [/paperboy/i, 'Action'],
    [/blue lightning/i, 'Shooter'],
    [/stun runner/i, 'Racing'],
    [/switchblade/i, 'Action'],
    [/dig dug/i, 'Action'],
    [/tapper\b/i, 'Action'],
    [/tutankham/i, 'Action'],
    [/venture\b/i, 'Action'],
    [/kangaroo\b/i, 'Platformer'],
    [/galaxian\b/i, 'Shooter'],
    [/battlezone/i, 'Shooter'],
    [/beamrider|beam rider/i, 'Shooter'],
    [/river raid/i, 'Shooter'],
    [/spy.?hunter/i, 'Racing'],
    [/star raiders/i, 'Shooter'],
    [/astroblast/i, 'Shooter'],
    [/atlantis/i, 'Shooter'],
    [/gravitar/i, 'Shooter'],
    [/outlaw/i, 'Shooter'],
    [/surround/i, 'Action'],
    [/bank heist|private eye/i, 'Action'],
    [/crystal castles/i, 'Action'],
    [/dragonfire/i, 'Action'],
    [/mountain king/i, 'Platformer'],
    [/robot tank/i, 'Shooter'],
    [/carnival\b/i, 'Shooter'],
    [/crackpots/i, 'Action'],
    [/rygar/i, 'Platformer'],
    [/champion wrestler/i, 'Wrestling'],
    [/bari bari|f-?1.*pilot|f1 circus/i, 'Racing'],
    [/aldynes|daisenpuu|deep blue|formation armed/i, 'Shooter'],
    [/boxyboy|sokoban/i, 'Puzzle'],
    [/break in|billiards/i, 'Sports'],
    [/side pocket/i, 'Sports'],
    [/pop'n pop|smurfs/i, 'Platformer'],
    [/clutch hitter/i, 'Sports'],
    [/donald duck/i, 'Platformer'],
    [/dropzone/i, 'Shooter'],
    [/alien syndrome/i, 'Shooter'],
    [/rescue on fractalus/i, 'Action'],
    [/super cobra/i, 'Shooter'],
    [/millipede/i, 'Shooter'],
    [/moon cresta/i, 'Shooter'],
    [/serpentine/i, 'Action'],
    [/tower toppler/i, 'Platformer'],
    [/mat mania/i, 'Wrestling'],
    [/hat trick/i, 'Sports'],
    [/super skateboardin/i, 'Sports'],
    [/water ski/i, 'Sports'],
    [/goonies/i, 'Platformer'],
    [/clu clu land/i, 'Puzzle'],
    [/bases loaded/i, 'Sports'],
    [/wild gunman|hogans alley/i, 'Light Gun'],
    [/gyromite/i, 'Puzzle'],
    [/star.*tropics|zoda.*revenge/i, 'Adventure'],
    [/jack bros/i, 'Action'],
    [/red alarm|vertical force/i, 'Shooter'],
    [/teleroboxer/i, 'Boxing'],
    [/space squash/i, 'Sports'],
    [/bound high/i, 'Platformer'],
    [/kasumi ninja|ultra vortek|thea realm/i, 'Fighting'],
    [/aircars|hover strike/i, 'Action'],
    [/ddragon/i, 'Beat em Up'],
    [/aliens\b/i, 'Beat em Up'],
];

// ─── Keyword fallbacks (checked last) ───
const KEYWORD_GENRES = [
    [/\b(fight|bout|duel|arena|versus|martial|kombat)\b/i, 'Fighting'],
    [/\b(shoot|shmup|bullet|blaster|gun|cannon|missile|bomber)\b/i, 'Shooter'],
    [/\b(race|racing|rally|kart|drift|speed|grand prix|gp)\b/i, 'Racing'],
    [/\b(rpg|quest|dungeon|dragon|sword|knight|warrior|magic|wizard)\b/i, 'RPG'],
    [/\b(platform|jump|hop|run)\b/i, 'Platformer'],
    [/\b(puzzle|block|match|brain|quiz|trivia)\b/i, 'Puzzle'],
    [/\b(sport|ball|league|championship|cup|tournament|slam|dunk)\b/i, 'Sports'],
    [/\b(adventure|explore|treasure|island|mystery|detective)\b/i, 'Adventure'],
    [/\b(strategy|tactics|command|war|battle|army|siege|empire)\b/i, 'Strategy'],
    [/\b(horror|zombie|undead|monster|ghost|evil)\b/i, 'Survival Horror'],
    [/\b(simulation|tycoon|manager|builder)\b/i, 'Simulation'],
];

function classifyGenre(cleanName, systemId) {
    const name = cleanName || '';

    // 1. Arcade/Neo Geo/FBNeo short ROM name lookup
    if (['arcade', 'neogeo', 'fbneo'].includes(systemId)) {
        const key = name.toLowerCase().replace(/\s+/g, '').replace(/\.zip$/, '');
        if (ARCADE_GENRES[key]) return ARCADE_GENRES[key];
    }

    // 2. Franchise matching
    for (const [pattern, genre] of FRANCHISE_GENRES) {
        if (pattern.test(name)) return genre;
    }

    // 3. Keyword fallback
    for (const [pattern, genre] of KEYWORD_GENRES) {
        if (pattern.test(name)) return genre;
    }

    return null;
}

// ─── Main ───
function run() {
    const db = new Database(DB_PATH);

    // Get all ROMs missing genre
    const missing = db.prepare(`
        SELECT r.id, r.clean_name, r.system_id, m.rom_id as has_meta
        FROM roms r
        LEFT JOIN metadata m ON m.rom_id = r.id
        WHERE m.genre IS NULL OR m.genre = '' OR m.rom_id IS NULL
    `).all();

    console.log(`\n📋 ${missing.length} ROMs missing genre\n`);

    const updateGenre = db.prepare(`
        UPDATE metadata SET genre = ?, metadata_source = COALESCE(metadata_source, '') || '+genre-fill'
        WHERE rom_id = ?
    `);
    const insertMeta = db.prepare(`
        INSERT OR IGNORE INTO metadata (rom_id, genre, metadata_source)
        VALUES (?, ?, 'genre-fill')
    `);

    let filled = 0, skipped = 0;
    const genreCounts = {};
    const unfilled = [];

    for (const rom of missing) {
        const genre = classifyGenre(rom.clean_name, rom.system_id);
        if (genre) {
            if (rom.has_meta) {
                updateGenre.run(genre, rom.id);
            } else {
                insertMeta.run(rom.id, genre);
            }
            filled++;
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        } else {
            skipped++;
            unfilled.push(`${rom.system_id}|${rom.clean_name}`);
        }
    }

    // Summary
    console.log(`✅ Filled: ${filled}`);
    console.log(`⏭️  Skipped (no match): ${skipped}`);
    console.log(`\nGenre breakdown:`);
    Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).forEach(([g, c]) => {
        console.log(`  ${g}: ${c}`);
    });

    // Final stats
    const totalWithGenre = db.prepare("SELECT COUNT(*) as c FROM metadata WHERE genre IS NOT NULL AND genre <> ''").get();
    const totalRoms = db.prepare("SELECT COUNT(*) as c FROM roms").get();
    console.log(`\n📊 Genre coverage: ${totalWithGenre.c}/${totalRoms.c} (${Math.round(totalWithGenre.c/totalRoms.c*100)}%)`);

    if (unfilled.length > 0) {
        console.log(`\n🔍 Sample unfilled (first 30):`);
        unfilled.slice(0, 30).forEach(u => console.log(`  ${u}`));
    }

    db.close();
}

run();
