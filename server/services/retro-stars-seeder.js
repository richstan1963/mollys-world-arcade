/**
 * Retro Stars — Character seeder + Wikipedia image downloader
 * Seeds 101 iconic game characters, auto-matches to ROM library, and downloads portraits.
 */
import { getDB } from '../db.js';
import { CONFIG } from '../config.js';
import https from 'https';
import fs from 'fs';
import path from 'path';

const IMG_DIR = path.join(CONFIG.publicDir || path.resolve('public'), 'img', 'stars');

// ── Character Data: 101 Retro Stars ──────────────────────────────────────────
const CHARACTERS = [
  // ══════════ NINTENDO ICONS (15) ══════════
  { slug:'mario', name:'Mario', title:'Box Office Titan', category:'Nintendo Icons', genre_tag:'Platform Legend',
    bio:'The face of console gaming. Cheerful, unstoppable, and somehow equally believable in side-scrolling adventures, kart circuits, and castle-saving epics.',
    debut_game:'Donkey Kong', debut_year:1981, era:'Arcade / NES / N64', franchise:'Mario',
    match_patterns:['mario'], wiki:'Mario' },
  { slug:'link', name:'Link', title:'Prestige Fantasy Lead', category:'Nintendo Icons', genre_tag:'Adventure Royalty',
    bio:'Silent, determined, and eternally cinematic. A heroic lead with serious mythic weight and one of the strongest long-form fantasy careers in gaming history.',
    debut_game:'The Legend of Zelda', debut_year:1986, era:'NES / SNES / N64', franchise:'Zelda',
    match_patterns:['zelda'], wiki:'Link_(The_Legend_of_Zelda)' },
  { slug:'samus', name:'Samus Aran', title:'Armored Action Lead', category:'Nintendo Icons', genre_tag:'Sci-Fi Icon',
    bio:'Cold, composed, and formidable. One of gaming\'s most powerful sci-fi stars with a screen presence that still feels elite decades later.',
    debut_game:'Metroid', debut_year:1986, era:'NES / SNES / GBA', franchise:'Metroid',
    match_patterns:['metroid'], wiki:'Samus_Aran' },
  { slug:'donkey-kong', name:'Donkey Kong', title:'Original Showman', category:'Nintendo Icons', genre_tag:'Platformer Pioneer',
    bio:'Started as the villain, became the star. A barrel-throwing, chest-pounding showman who launched an entire industry and never stopped swinging.',
    debut_game:'Donkey Kong', debut_year:1981, era:'Arcade / SNES / N64', franchise:'Donkey Kong',
    match_patterns:['donkey kong'], wiki:'Donkey_Kong_(character)' },
  { slug:'kirby', name:'Kirby', title:'Pink Powerhouse', category:'Nintendo Icons', genre_tag:'Action Chameleon',
    bio:'Adorable, deceptively lethal, and endlessly versatile. A copy-cat genius who absorbs the competition and makes it look effortless.',
    debut_game:'Kirby\'s Dream Land', debut_year:1992, era:'GB / SNES / N64', franchise:'Kirby',
    match_patterns:['kirby'], wiki:'Kirby_(character)' },
  { slug:'yoshi', name:'Yoshi', title:'Breakout Supporting Star', category:'Nintendo Icons', genre_tag:'Sidekick Sensation',
    bio:'The ultimate breakout supporting player. Went from dinosaur ride to franchise headliner, proving that loyalty and charm can build a solo career.',
    debut_game:'Super Mario World', debut_year:1990, era:'SNES / N64 / GBA', franchise:'Yoshi',
    match_patterns:['yoshi'], wiki:'Yoshi' },
  { slug:'fox-mccloud', name:'Fox McCloud', title:'Cockpit Hero', category:'Nintendo Icons', genre_tag:'Sci-Fi Ace',
    bio:'A born leader with ace reflexes and a legendary squadron. His on-rails space operas defined a generation of cockpit cinema.',
    debut_game:'Star Fox', debut_year:1993, era:'SNES / N64', franchise:'Star Fox',
    match_patterns:['star fox','starfox'], wiki:'Fox_McCloud' },
  { slug:'captain-falcon', name:'Captain Falcon', title:'Speed Circuit Legend', category:'Nintendo Icons', genre_tag:'Racing Icon',
    bio:'Helmet on, visor down, pedal floored. A mysterious racer turned cultural icon whose signature move transcended his own franchise.',
    debut_game:'F-Zero', debut_year:1990, era:'SNES / N64 / GBA', franchise:'F-Zero',
    match_patterns:['f-zero','f zero','fzero'], wiki:'F-Zero_(video_game)' },
  { slug:'pikachu', name:'Pikachu', title:'Global Phenomenon', category:'Nintendo Icons', genre_tag:'Monster Icon',
    bio:'The electric mouse that conquered the planet. A mascot so universally beloved it became the face of the biggest media franchise in history.',
    debut_game:'Pokemon Red/Blue', debut_year:1996, era:'GB / GBC / N64', franchise:'Pokemon',
    match_patterns:['pokemon','pikachu'], wiki:'Pikachu' },
  { slug:'luigi', name:'Luigi', title:'The Ultimate Second Banana', category:'Nintendo Icons', genre_tag:'Comedy Co-Lead',
    bio:'Forever in his brother\'s shadow and somehow better for it. The anxious underdog who turned being Player Two into a beloved art form.',
    debut_game:'Mario Bros.', debut_year:1983, era:'Arcade / NES / SNES', franchise:'Mario',
    match_patterns:['luigi'], wiki:'Luigi_(character)' },
  { slug:'bowser', name:'Bowser', title:'King of Villainy', category:'Nintendo Icons', genre_tag:'Franchise Villain',
    bio:'The greatest recurring villain in gaming. A fire-breathing tyrant with a flair for dramatic castle design and an inability to keep a princess locked up.',
    debut_game:'Super Mario Bros.', debut_year:1985, era:'NES / SNES / N64', franchise:'Mario',
    match_patterns:['mario','bowser'], wiki:'Bowser_(character)' },
  { slug:'princess-peach', name:'Princess Peach', title:'Royal Franchise Pillar', category:'Nintendo Icons', genre_tag:'Nintendo Royalty',
    bio:'Far more than a damsel in distress. A franchise cornerstone who headlines kart races, party games, and eventually her own solo adventures.',
    debut_game:'Super Mario Bros.', debut_year:1985, era:'NES / SNES / N64', franchise:'Mario',
    match_patterns:['mario','peach'], wiki:'Princess_Peach' },
  { slug:'wario', name:'Wario', title:'The Anti-Hero', category:'Nintendo Icons', genre_tag:'Comedy Villain',
    bio:'Greedy, crude, and utterly magnetic. Mario\'s twisted mirror image who turned avarice into an art form and launched his own microgame empire.',
    debut_game:'Super Mario Land 2', debut_year:1992, era:'GB / GBA / N64', franchise:'Wario',
    match_patterns:['wario'], wiki:'Wario' },
  { slug:'diddy-kong', name:'Diddy Kong', title:'Acrobatic Co-Star', category:'Nintendo Icons', genre_tag:'Platform Partner',
    bio:'Small, fast, and full of tricks. Donkey Kong\'s nephew and the perfect co-op partner who eventually earned his own racing franchise.',
    debut_game:'Donkey Kong Country', debut_year:1994, era:'SNES / N64 / GBA', franchise:'Donkey Kong',
    match_patterns:['donkey kong','diddy'], wiki:'Diddy_Kong' },
  { slug:'little-mac', name:'Little Mac', title:'Underdog Champion', category:'Nintendo Icons', genre_tag:'Sports Icon',
    bio:'A scrawny boxer from the Bronx taking on giants twice his size. The ultimate underdog story told through perfectly timed uppercuts.',
    debut_game:'Punch-Out!!', debut_year:1984, era:'Arcade / NES / Wii', franchise:'Punch-Out!!',
    match_patterns:['punch-out','punch out','punchout'], wiki:'Punch-Out!!_(NES)' },

  // ══════════ ARCADE LEGENDS (12) ══════════
  { slug:'pac-man', name:'Pac-Man', title:'The Original Superstar', category:'Arcade Legends', genre_tag:'Arcade Pioneer',
    bio:'Before there were sequels, spin-offs, and cinematic universes, there was a yellow circle eating dots. The original gaming icon and the industry\'s first megastar.',
    debut_game:'Pac-Man', debut_year:1980, era:'Arcade / NES / GBA', franchise:'Pac-Man',
    match_patterns:['pac-man','pac man','pacman','pac_man'], wiki:'Pac-Man_(character)' },
  { slug:'mega-man', name:'Mega Man', title:'The Blue Bomber', category:'Arcade Legends', genre_tag:'Action Marathon Star',
    bio:'An action hero with the deepest filmography in the business. Every installment a gauntlet, every boss a screen test, and every sequel earned.',
    debut_game:'Mega Man', debut_year:1987, era:'NES / SNES / GBA', franchise:'Mega Man',
    match_patterns:['mega man','megaman','rockman'], wiki:'Mega_Man_(character)' },
  { slug:'simon-belmont', name:'Simon Belmont', title:'Gothic Horror Lead', category:'Arcade Legends', genre_tag:'Horror Action Star',
    bio:'Whip in hand and legacy on his shoulders. The patriarch of gaming\'s greatest horror dynasty, fighting Dracula across centuries.',
    debut_game:'Castlevania', debut_year:1986, era:'NES / SNES / GB', franchise:'Castlevania',
    match_patterns:['castlevania','belmont'], wiki:'Simon_Belmont' },
  { slug:'arthur', name:'Arthur', title:'Armored Comedy Hero', category:'Arcade Legends', genre_tag:'Arcade Ironman',
    bio:'Brave, relentless, and perpetually underdressed. A knight who loses his armor every five seconds but never his dignity.',
    debut_game:'Ghosts\'n Goblins', debut_year:1985, era:'Arcade / NES / SNES', franchise:'Ghosts\'n Goblins',
    match_patterns:['ghosts','ghouls','ghost.*goblin','ghouls.*ghost'], wiki:'Super_Ghouls_%27n_Ghosts' },
  { slug:'bomberman', name:'Bomberman', title:'Explosive Ensemble Star', category:'Arcade Legends', genre_tag:'Party Pioneer',
    bio:'A demolitions expert turned party host. Proved that four players, a grid, and well-placed bombs could create the perfect multiplayer format.',
    debut_game:'Bomberman', debut_year:1983, era:'NES / SNES / N64 / TG16', franchise:'Bomberman',
    match_patterns:['bomberman'], wiki:'Super_Bomberman' },
  { slug:'strider-hiryu', name:'Strider Hiryu', title:'Futuristic Action Lead', category:'Arcade Legends', genre_tag:'Ninja Elite',
    bio:'Cyberpunk ninja at the peak of cool. A Capcom original who sliced through the arcade era with unmatched style.',
    debut_game:'Strider', debut_year:1989, era:'Arcade / Genesis / PSX', franchise:'Strider',
    match_patterns:['strider'], wiki:'Strider_Hiryu' },
  { slug:'q-bert', name:'Q*bert', title:'Abstract Platformer Star', category:'Arcade Legends', genre_tag:'Arcade Character Actor',
    bio:'A bizarre orange creature on a pyramid of cubes, swearing in symbols. Proof that games didn\'t need to make sense to be great.',
    debut_game:'Q*bert', debut_year:1982, era:'Arcade / NES', franchise:'Q*bert',
    match_patterns:['q.bert','qbert'], wiki:'Q*bert' },
  { slug:'frogger', name:'Frogger', title:'Unlikely Action Star', category:'Arcade Legends', genre_tag:'Crossover Pioneer',
    bio:'A frog crossing a road shouldn\'t have been this stressful or this addictive. Arcade\'s greatest high-concept pitch.',
    debut_game:'Frogger', debut_year:1981, era:'Arcade / NES / SNES', franchise:'Frogger',
    match_patterns:['frogger'], wiki:'Frogger_(video_game)' },
  { slug:'space-invader', name:'Space Invader', title:'The First Antagonist', category:'Arcade Legends', genre_tag:'Shooter Pioneer',
    bio:'The pixelated alien that started it all. Before stories, before characters — there was a descending row of invaders and a single cannon.',
    debut_game:'Space Invaders', debut_year:1978, era:'Arcade / Atari 2600', franchise:'Space Invaders',
    match_patterns:['space invader'], wiki:'Space_Invaders' },
  { slug:'dig-dug', name:'Taizo Hori', title:'Underground Action Star', category:'Arcade Legends', genre_tag:'Arcade Original',
    bio:'A man, a pump, and an army of underground monsters. The original subterranean action hero who proved digging could be thrilling.',
    debut_game:'Dig Dug', debut_year:1982, era:'Arcade / NES', franchise:'Dig Dug',
    match_patterns:['dig dug'], wiki:'Dig_Dug_(video_game)' },
  { slug:'peter-pepper', name:'Peter Pepper', title:'Fast Food Action Star', category:'Arcade Legends', genre_tag:'Arcade Oddball',
    bio:'A chef assembling burgers while dodging hostile condiments. BurgerTime\'s absurd hero and one of arcade gaming\'s most beloved oddballs.',
    debut_game:'BurgerTime', debut_year:1982, era:'Arcade / NES', franchise:'BurgerTime',
    match_patterns:['burgertime','burger time'], wiki:'BurgerTime' },
  { slug:'bub', name:'Bub', title:'Bubble Dragon', category:'Arcade Legends', genre_tag:'Co-Op Classic',
    bio:'A tiny dragon who traps enemies in bubbles. Bubble Bobble\'s adorable co-op hero and the star of one of gaming\'s catchiest soundtracks.',
    debut_game:'Bubble Bobble', debut_year:1986, era:'Arcade / NES / GBA', franchise:'Bubble Bobble',
    match_patterns:['bubble bobble','bust-a-move','puzzle bobble'], wiki:'Bubble_Bobble' },

  // ══════════ FIGHTING ROYALTY (22) ══════════
  { slug:'ryu', name:'Ryu', title:'The Eternal Challenger', category:'Fighting Royalty', genre_tag:'Fighting Pioneer',
    bio:'The wandering warrior who launched a billion quarters. Disciplined, driven, and eternally searching for the next fight.',
    debut_game:'Street Fighter', debut_year:1987, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Ryu_(Street_Fighter)' },
  { slug:'chun-li', name:'Chun-Li', title:'First Lady of Fighting', category:'Fighting Royalty', genre_tag:'Martial Arts Queen',
    bio:'Gaming\'s first major female fighter and still its most iconic. Broke barriers with spinning bird kicks and never looked back.',
    debut_game:'Street Fighter II', debut_year:1991, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Street_Fighter_II' },
  { slug:'ken-masters', name:'Ken Masters', title:'The Rival', category:'Fighting Royalty', genre_tag:'Fighting Co-Star',
    bio:'Ryu\'s eternal sparring partner and the flashier half of gaming\'s greatest bromance. Where Ryu is discipline, Ken is fire and flair.',
    debut_game:'Street Fighter', debut_year:1987, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Ken_Masters' },
  { slug:'guile', name:'Guile', title:'All-American Fighter', category:'Fighting Royalty', genre_tag:'Military Hero',
    bio:'Flat-top haircut, sonic booms, and an unwavering sense of duty. The stoic military man who became one of Street Fighter\'s most beloved characters.',
    debut_game:'Street Fighter II', debut_year:1991, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Guile_(Street_Fighter)' },
  { slug:'m-bison', name:'M. Bison', title:'Psycho-Powered Dictator', category:'Fighting Royalty', genre_tag:'Ultimate Boss',
    bio:'The iron-fisted dictator of Shadaloo. A final boss so imposing that his very name became synonymous with fighting game villainy.',
    debut_game:'Street Fighter II', debut_year:1991, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'M._Bison' },
  { slug:'cammy', name:'Cammy', title:'Special Forces Elite', category:'Fighting Royalty', genre_tag:'Action Fighter',
    bio:'A Delta Red operative with killer instincts and lightning-fast kicks. One of fighting games\' most enduring and popular female warriors.',
    debut_game:'Super Street Fighter II', debut_year:1993, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Cammy_(Street_Fighter)' },
  { slug:'sagat', name:'Sagat', title:'The Emperor of Muay Thai', category:'Fighting Royalty', genre_tag:'Legendary Rival',
    bio:'Towering, scarred, and eternally dangerous. The Muay Thai king whose rivalry with Ryu is one of gaming\'s most legendary grudge matches.',
    debut_game:'Street Fighter', debut_year:1987, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Sagat_(Street_Fighter)' },
  { slug:'zangief', name:'Zangief', title:'The Red Cyclone', category:'Fighting Royalty', genre_tag:'Grappler Icon',
    bio:'A hulking Soviet wrestler who pile-drives opponents into oblivion. The original fighting game grappler and a fan favorite for over three decades.',
    debut_game:'Street Fighter II', debut_year:1991, era:'Arcade / SNES / PSX', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Zangief' },
  { slug:'akuma', name:'Akuma', title:'The Ultimate Boss', category:'Fighting Royalty', genre_tag:'Dark Horse Icon',
    bio:'The secret boss who became a legend. A demon in a gi who exists solely to destroy and became the most anticipated roster reveal in any fighting game.',
    debut_game:'Super Street Fighter II Turbo', debut_year:1994, era:'Arcade / PSX / Saturn', franchise:'Street Fighter',
    match_patterns:['street fighter'], wiki:'Akuma_(Street_Fighter)' },
  { slug:'scorpion', name:'Scorpion', title:'Franchise Face of Fatality', category:'Fighting Royalty', genre_tag:'Horror Fighter',
    bio:'"GET OVER HERE." Two words that defined a franchise and terrified a generation. Gaming\'s most iconic ninja.',
    debut_game:'Mortal Kombat', debut_year:1992, era:'Arcade / SNES / Genesis', franchise:'Mortal Kombat',
    match_patterns:['mortal kombat'], wiki:'Scorpion_(Mortal_Kombat)' },
  { slug:'sub-zero', name:'Sub-Zero', title:'Ice-Cold Leading Man', category:'Fighting Royalty', genre_tag:'Fighting Anti-Hero',
    bio:'Cool, calculating, and lethally composed. The yin to Scorpion\'s yang and arguably the more complex character in gaming\'s most brutal franchise.',
    debut_game:'Mortal Kombat', debut_year:1992, era:'Arcade / SNES / Genesis', franchise:'Mortal Kombat',
    match_patterns:['mortal kombat'], wiki:'Sub-Zero_(Mortal_Kombat)' },
  { slug:'liu-kang', name:'Liu Kang', title:'Champion of Earthrealm', category:'Fighting Royalty', genre_tag:'Tournament Hero',
    bio:'Mortal Kombat\'s true protagonist. A Shaolin monk with flying kicks and dragon fire who saved the world more times than anyone can count.',
    debut_game:'Mortal Kombat', debut_year:1992, era:'Arcade / SNES / Genesis', franchise:'Mortal Kombat',
    match_patterns:['mortal kombat'], wiki:'Liu_Kang' },
  { slug:'raiden-mk', name:'Raiden', title:'Thunder God', category:'Fighting Royalty', genre_tag:'Divine Protector',
    bio:'The god of thunder and Earthrealm\'s eternal guardian. A supernatural mentor whose lightning bolts are as devastating as his wisdom.',
    debut_game:'Mortal Kombat', debut_year:1992, era:'Arcade / SNES / Genesis', franchise:'Mortal Kombat',
    match_patterns:['mortal kombat'], wiki:'Raiden_(Mortal_Kombat)' },
  { slug:'johnny-cage', name:'Johnny Cage', title:'Hollywood Action Star', category:'Fighting Royalty', genre_tag:'Action Comedy',
    bio:'Sunglasses, splits, and a devastating ego. The Hollywood actor turned tournament fighter who punches gods in the face.',
    debut_game:'Mortal Kombat', debut_year:1992, era:'Arcade / SNES / Genesis', franchise:'Mortal Kombat',
    match_patterns:['mortal kombat'], wiki:'Johnny_Cage' },
  { slug:'kitana', name:'Kitana', title:'Outworld Princess', category:'Fighting Royalty', genre_tag:'Fan Fighter',
    bio:'A 10,000-year-old Edenian princess with razor-sharp fans. One of gaming\'s most powerful female fighters and Mortal Kombat\'s best love story.',
    debut_game:'Mortal Kombat II', debut_year:1993, era:'Arcade / SNES / Genesis', franchise:'Mortal Kombat',
    match_patterns:['mortal kombat'], wiki:'Kitana_(Mortal_Kombat)' },
  { slug:'sonya-blade', name:'Sonya Blade', title:'Special Forces Commander', category:'Fighting Royalty', genre_tag:'Military Elite',
    bio:'The original leading lady of Mortal Kombat. A no-nonsense Special Forces officer who takes down supernatural threats with pure grit.',
    debut_game:'Mortal Kombat', debut_year:1992, era:'Arcade / SNES / Genesis', franchise:'Mortal Kombat',
    match_patterns:['mortal kombat'], wiki:'Sonya_Blade' },
  { slug:'terry-bogard', name:'Terry Bogard', title:'SNK\'s Leading Man', category:'Fighting Royalty', genre_tag:'Neo Geo Icon',
    bio:'Cap backwards, fists flying, always asking if you\'re okay. The undisputed face of SNK and the Neo Geo.',
    debut_game:'Fatal Fury', debut_year:1991, era:'Neo Geo / Arcade / PSX', franchise:'Fatal Fury / KOF',
    match_patterns:['fatal fury','king of fighters','kof','garou'], wiki:'Terry_Bogard' },
  { slug:'mai-shiranui', name:'Mai Shiranui', title:'Fan-Favorite Femme Fatale', category:'Fighting Royalty', genre_tag:'SNK Royalty',
    bio:'A kunoichi with a fan, a flame, and undeniable screen presence. SNK\'s most recognizable female fighter.',
    debut_game:'Fatal Fury 2', debut_year:1992, era:'Neo Geo / Arcade', franchise:'Fatal Fury / KOF',
    match_patterns:['fatal fury','king of fighters','kof'], wiki:'Mai_Shiranui' },
  { slug:'kyo-kusanagi', name:'Kyo Kusanagi', title:'Tournament Series Lead', category:'Fighting Royalty', genre_tag:'Neo Geo Flagship',
    bio:'The flame-wielding high schooler who anchored SNK\'s biggest crossover event. The King of Fighters\' true protagonist.',
    debut_game:'King of Fighters \'94', debut_year:1994, era:'Neo Geo / Arcade / PSX', franchise:'King of Fighters',
    match_patterns:['king of fighters','kof'], wiki:'Kyo_Kusanagi' },
  { slug:'geese-howard', name:'Geese Howard', title:'Corporate Villain', category:'Fighting Royalty', genre_tag:'SNK\'s Greatest Heel',
    bio:'A crime lord in a hakama who throws energy waves from a skyscraper. SNK\'s most compelling villain.',
    debut_game:'Fatal Fury', debut_year:1991, era:'Neo Geo / Arcade', franchise:'Fatal Fury / KOF',
    match_patterns:['fatal fury','king of fighters','kof','garou'], wiki:'Geese_Howard' },
  { slug:'jago', name:'Jago', title:'Tiger Warrior', category:'Fighting Royalty', genre_tag:'KI Pioneer',
    bio:'Killer Instinct\'s spiritual warrior and the face of Rare\'s groundbreaking fighter. Tiger fury, wind kicks, and ultra combos.',
    debut_game:'Killer Instinct', debut_year:1994, era:'Arcade / SNES / N64', franchise:'Killer Instinct',
    match_patterns:['killer instinct'], wiki:'Killer_Instinct_(1994_video_game)' },
  { slug:'fulgore', name:'Fulgore', title:'Ultratech\'s Weapon', category:'Fighting Royalty', genre_tag:'KI Machine',
    bio:'A cybernetic killing machine with laser eyes and plasma claws. Killer Instinct\'s most iconic creation and the ultimate boss fight.',
    debut_game:'Killer Instinct', debut_year:1994, era:'Arcade / SNES / N64', franchise:'Killer Instinct',
    match_patterns:['killer instinct'], wiki:'Killer_Instinct_(1994_video_game)' },

  // ══════════ BEAT 'EM UP KINGS (8) ══════════
  { slug:'captain-commando', name:'Captain Commando', title:'Capcom\'s Original Mascot', category:'Beat Em Up Kings', genre_tag:'Arcade Hero',
    bio:'Capcom\'s original company mascot turned beat-em-up star. A futuristic commando who fought alongside a mummy, a ninja, and a baby in a mech suit.',
    debut_game:'Captain Commando', debut_year:1991, era:'Arcade / SNES', franchise:'Captain Commando',
    match_patterns:['captain commando'], wiki:'Captain_Commando' },
  { slug:'mike-haggar', name:'Mike Haggar', title:'The Wrestling Mayor', category:'Beat Em Up Kings', genre_tag:'Brawler Legend',
    bio:'A pro wrestler turned mayor who cleans up Metro City one pile-driver at a time. Final Fight\'s most beloved hero and the ultimate civil servant.',
    debut_game:'Final Fight', debut_year:1989, era:'Arcade / SNES', franchise:'Final Fight',
    match_patterns:['final fight'], wiki:'Final_Fight' },
  { slug:'cody', name:'Cody Travers', title:'Street Justice', category:'Beat Em Up Kings', genre_tag:'Urban Warrior',
    bio:'A street fighter who went from hero to prisoner and back again. Final Fight\'s scrappy protagonist with fists of fury and a complicated past.',
    debut_game:'Final Fight', debut_year:1989, era:'Arcade / SNES / GBA', franchise:'Final Fight',
    match_patterns:['final fight'], wiki:'Final_Fight' },
  { slug:'billy-lee', name:'Billy Lee', title:'Dragon Warrior', category:'Beat Em Up Kings', genre_tag:'Co-Op Pioneer',
    bio:'The original beat-em-up brother. Double Dragon\'s martial arts hero who defined the side-scrolling brawler genre and perfected the art of the elbow strike.',
    debut_game:'Double Dragon', debut_year:1987, era:'Arcade / NES / Genesis', franchise:'Double Dragon',
    match_patterns:['double dragon'], wiki:'Double_Dragon_(video_game)' },
  { slug:'axel-stone', name:'Axel Stone', title:'Streets of Rage Hero', category:'Beat Em Up Kings', genre_tag:'SEGA Brawler',
    bio:'Sega\'s answer to Final Fight and then some. A former cop turned vigilante who proved the Genesis could deliver arcade-quality beat-em-up action.',
    debut_game:'Streets of Rage', debut_year:1991, era:'Genesis / GG', franchise:'Streets of Rage',
    match_patterns:['streets of rage','bare knuckle'], wiki:'Streets_of_Rage_(video_game)' },
  { slug:'blaze-fielding', name:'Blaze Fielding', title:'Combo Queen', category:'Beat Em Up Kings', genre_tag:'Action Heroine',
    bio:'Fast, fierce, and fan-favorite. Streets of Rage\'s leading lady with devastating combo attacks and one of the best movesets in brawler history.',
    debut_game:'Streets of Rage', debut_year:1991, era:'Genesis / GG', franchise:'Streets of Rage',
    match_patterns:['streets of rage','bare knuckle'], wiki:'Streets_of_Rage_2' },
  { slug:'gilius', name:'Gilius Thunderhead', title:'The Battle Dwarf', category:'Beat Em Up Kings', genre_tag:'Fantasy Brawler',
    bio:'An axe-wielding dwarf riding a fire-breathing dragon. Golden Axe\'s most iconic warrior and the mascot of SEGA\'s fantasy beat-em-up era.',
    debut_game:'Golden Axe', debut_year:1989, era:'Arcade / Genesis', franchise:'Golden Axe',
    match_patterns:['golden axe'], wiki:'Golden_Axe_(video_game)' },
  { slug:'joe-musashi', name:'Joe Musashi', title:'Master Shinobi', category:'Beat Em Up Kings', genre_tag:'Ninja Legend',
    bio:'SEGA\'s premier ninja and one of the Genesis\'s defining characters. Silent, lethal, and the star of some of the hardest action games ever made.',
    debut_game:'Shinobi', debut_year:1987, era:'Arcade / Genesis / SMS', franchise:'Shinobi',
    match_patterns:['shinobi'], wiki:'The_Revenge_of_Shinobi' },

  // ══════════ SONIC & SEGA (7) ══════════
  { slug:'sonic', name:'Sonic the Hedgehog', title:'Speed Demon Superstar', category:'Sonic & SEGA', genre_tag:'Mascot Rival',
    bio:'Attitude, velocity, and a rivalry that shaped the industry. The blue blur who challenged Mario\'s throne and proved speed was its own spectacle.',
    debut_game:'Sonic the Hedgehog', debut_year:1991, era:'Genesis / GG / GBA', franchise:'Sonic',
    match_patterns:['sonic'], wiki:'Sonic_the_Hedgehog_(character)' },
  { slug:'alex-kidd', name:'Alex Kidd', title:'The Original SEGA Star', category:'Sonic & SEGA', genre_tag:'Forgotten Pioneer',
    bio:'SEGA\'s first mascot and a lovable underdog whose rock-paper-scissors boss fights were ahead of their time.',
    debut_game:'Alex Kidd in Miracle World', debut_year:1986, era:'SMS / Genesis', franchise:'Alex Kidd',
    match_patterns:['alex kidd'], wiki:'Alex_Kidd_in_Miracle_World' },
  { slug:'tails', name:'Tails', title:'Loyal Wingman', category:'Sonic & SEGA', genre_tag:'Tech Prodigy',
    bio:'A two-tailed fox with a genius IQ and unwavering loyalty. The best player-two character ever designed.',
    debut_game:'Sonic the Hedgehog 2', debut_year:1992, era:'Genesis / GG / GBA', franchise:'Sonic',
    match_patterns:['sonic'], wiki:'Tails_(character)' },
  { slug:'knuckles', name:'Knuckles', title:'The Tough Guy', category:'Sonic & SEGA', genre_tag:'Action Rival',
    bio:'Started as a villain, became an ally, always stayed a brawler. The echidna with the attitude problem and the best theme music.',
    debut_game:'Sonic the Hedgehog 3', debut_year:1994, era:'Genesis / GBA', franchise:'Sonic',
    match_patterns:['sonic','knuckles'], wiki:'Knuckles_the_Echidna' },
  { slug:'ristar', name:'Ristar', title:'The Shooting Star', category:'Sonic & SEGA', genre_tag:'Hidden Gem',
    bio:'A stretchy-armed star hero who grabs, swings, and headbutts through beautifully crafted worlds. SEGA\'s most underrated platformer star.',
    debut_game:'Ristar', debut_year:1995, era:'Genesis / GG', franchise:'Ristar',
    match_patterns:['ristar'], wiki:'Ristar' },
  { slug:'vectorman', name:'Vectorman', title:'Green Machine', category:'Sonic & SEGA', genre_tag:'16-Bit Powerhouse',
    bio:'A trash-collecting robot turned action hero on a post-apocalyptic Earth. The Genesis\'s most visually impressive late-era star.',
    debut_game:'Vectorman', debut_year:1995, era:'Genesis', franchise:'Vectorman',
    match_patterns:['vectorman'], wiki:'Vectorman' },
  { slug:'nights', name:'NiGHTS', title:'Dream Jester', category:'Sonic & SEGA', genre_tag:'Saturn Icon',
    bio:'A purple jester who flies through dreams. SEGA Saturn\'s most magical creation and proof that Sonic Team could create pure aerial poetry.',
    debut_game:'NiGHTS into Dreams', debut_year:1996, era:'Saturn', franchise:'NiGHTS',
    match_patterns:['nights into dreams','nights'], wiki:'Nights_into_Dreams' },

  // ══════════ RPG GIANTS (8) ══════════
  { slug:'cloud-strife', name:'Cloud Strife', title:'Blockbuster RPG Lead', category:'RPG Giants', genre_tag:'JRPG Icon',
    bio:'Buster sword, spiky hair, identity crisis. The brooding mercenary who turned JRPGs into blockbuster entertainment.',
    debut_game:'Final Fantasy VII', debut_year:1997, era:'PSX', franchise:'Final Fantasy',
    match_patterns:['final fantasy vii','final fantasy 7','ff7'], wiki:'Cloud_Strife' },
  { slug:'crono', name:'Crono', title:'Silent Time Traveler', category:'RPG Giants', genre_tag:'Cult Classic Lead',
    bio:'A silent protagonist with a katana and a time machine. Led one of the most critically acclaimed RPGs ever without saying a single word.',
    debut_game:'Chrono Trigger', debut_year:1995, era:'SNES / PSX', franchise:'Chrono',
    match_patterns:['chrono trigger','chrono'], wiki:'Crono_(Chrono_Trigger)' },
  { slug:'terra-branford', name:'Terra Branford', title:'Esper Heroine', category:'RPG Giants', genre_tag:'RPG Drama Lead',
    bio:'Half-human, half-esper, and entirely compelling. An amnesiac who discovered her own power while the world fell apart. SNES storytelling at its peak.',
    debut_game:'Final Fantasy VI', debut_year:1994, era:'SNES / GBA', franchise:'Final Fantasy',
    match_patterns:['final fantasy vi','final fantasy 6','final fantasy iii','ff6','ff3'], wiki:'Terra_Branford' },
  { slug:'cecil-harvey', name:'Cecil Harvey', title:'Redemption Arc Pioneer', category:'RPG Giants', genre_tag:'Dark Knight Hero',
    bio:'From dark knight to paladin — the original redemption arc in JRPGs. A morally complex protagonist years before it was fashionable.',
    debut_game:'Final Fantasy IV', debut_year:1991, era:'SNES / GBA / PSP', franchise:'Final Fantasy',
    match_patterns:['final fantasy iv','final fantasy 4','final fantasy ii','ff4','ff2'], wiki:'Cecil_Harvey' },
  { slug:'ness', name:'Ness', title:'Suburban Hero', category:'RPG Giants', genre_tag:'Cult RPG Star',
    bio:'A kid with a baseball bat, psychic powers, and a quest to save the world from cosmic horror. EarthBound\'s unlikely hero.',
    debut_game:'EarthBound', debut_year:1994, era:'SNES', franchise:'EarthBound',
    match_patterns:['earthbound','mother'], wiki:'Ness_(EarthBound)' },
  { slug:'squall', name:'Squall Leonhart', title:'Reluctant Hero', category:'RPG Giants', genre_tag:'JRPG Loner',
    bio:'A brooding mercenary student with a gunblade and a chip on his shoulder. Final Fantasy VIII\'s complex lead who proved vulnerability could be strength.',
    debut_game:'Final Fantasy VIII', debut_year:1999, era:'PSX', franchise:'Final Fantasy',
    match_patterns:['final fantasy viii','final fantasy 8','ff8'], wiki:'Squall_Leonhart' },
  { slug:'hero-dq', name:'Hero', title:'The Chosen One', category:'RPG Giants', genre_tag:'JRPG Original',
    bio:'The silent protagonist who started it all. Dragon Quest\'s nameless hero who inspired every JRPG that followed and defined a genre for an entire nation.',
    debut_game:'Dragon Quest', debut_year:1986, era:'NES / SNES / GBC', franchise:'Dragon Quest',
    match_patterns:['dragon quest','dragon warrior'], wiki:'Dragon_Quest_(video_game)' },
  { slug:'adol', name:'Adol Christin', title:'The Red-Haired Adventurer', category:'RPG Giants', genre_tag:'Action RPG Pioneer',
    bio:'A wandering swordsman with red hair and an insatiable thirst for adventure. Ys\'s eternal hero and one of action-RPG gaming\'s greatest explorers.',
    debut_game:'Ys I', debut_year:1987, era:'TG16 / SNES / PSX', franchise:'Ys',
    match_patterns:['ys','wanderers from ys'], wiki:'Ys_(series)' },

  // ══════════ ACTION HEROES (12) ══════════
  { slug:'solid-snake', name:'Solid Snake', title:'Stealth Action Legend', category:'Action Heroes', genre_tag:'Tactical Espionage Star',
    bio:'The man who turned sneaking into an art form. A super-soldier with a gravelly voice and a franchise that redefined game storytelling.',
    debut_game:'Metal Gear', debut_year:1987, era:'NES / PSX / GBC', franchise:'Metal Gear',
    match_patterns:['metal gear'], wiki:'Solid_Snake' },
  { slug:'alucard', name:'Alucard', title:'Gothic Anti-Hero', category:'Action Heroes', genre_tag:'Horror Action Lead',
    bio:'Dracula\'s son turned vampire hunter. Starred in one of the most influential action-RPGs ever made.',
    debut_game:'Castlevania III', debut_year:1989, era:'NES / PSX', franchise:'Castlevania',
    match_patterns:['castlevania','symphony'], wiki:'Alucard_(Castlevania)' },
  { slug:'lara-croft', name:'Lara Croft', title:'Adventure Blockbuster Lead', category:'Action Heroes', genre_tag:'Exploration Icon',
    bio:'Dual pistols, acrobatic grace, and a taste for ancient ruins. The archaeologist who conquered gaming, Hollywood, and the mainstream.',
    debut_game:'Tomb Raider', debut_year:1996, era:'PSX / Saturn', franchise:'Tomb Raider',
    match_patterns:['tomb raider','lara croft'], wiki:'Tomb_Raider_(1996_video_game)' },
  { slug:'crash-bandicoot', name:'Crash Bandicoot', title:'90s Mascot Challenger', category:'Action Heroes', genre_tag:'3D Platform Star',
    bio:'Sony\'s unofficial mascot and the wildest bandicoot in gaming. Spun, jumped, and belly-flopped his way to PlayStation dominance.',
    debut_game:'Crash Bandicoot', debut_year:1996, era:'PSX', franchise:'Crash Bandicoot',
    match_patterns:['crash bandicoot','crash'], wiki:'Crash_Bandicoot_(video_game)' },
  { slug:'spyro', name:'Spyro', title:'Fantasy Platformer Star', category:'Action Heroes', genre_tag:'Dragon Icon',
    bio:'A wise-cracking purple dragon with fire breath and attitude. Charmed a generation of PlayStation gamers with colorful worlds.',
    debut_game:'Spyro the Dragon', debut_year:1998, era:'PSX / GBA', franchise:'Spyro',
    match_patterns:['spyro'], wiki:'Spyro_the_Dragon_(video_game)' },
  { slug:'jill-valentine', name:'Jill Valentine', title:'Survival Horror Lead', category:'Action Heroes', genre_tag:'Horror Star',
    bio:'Cool under pressure and lethal with a lockpick. The master of unlocking who launched survival horror into the mainstream.',
    debut_game:'Resident Evil', debut_year:1996, era:'PSX / Saturn / GBA', franchise:'Resident Evil',
    match_patterns:['resident evil','biohazard'], wiki:'Resident_Evil_(1996_video_game)' },
  { slug:'rash', name:'Rash', title:'Extreme Action Star', category:'Action Heroes', genre_tag:'Co-Op Icon',
    bio:'A toad with sunglasses, a bad attitude, and the hardest game ever made. Battletoads\' frontman and the poster child for brutal co-op.',
    debut_game:'Battletoads', debut_year:1991, era:'NES / SNES / GB', franchise:'Battletoads',
    match_patterns:['battletoads'], wiki:'Battletoads_(video_game)' },
  { slug:'earthworm-jim', name:'Earthworm Jim', title:'Absurdist Hero', category:'Action Heroes', genre_tag:'90s Comedy Star',
    bio:'A worm in a super suit launching cows. The most delightfully bizarre action hero of the 16-bit era.',
    debut_game:'Earthworm Jim', debut_year:1994, era:'Genesis / SNES / GBA', franchise:'Earthworm Jim',
    match_patterns:['earthworm jim'], wiki:'Earthworm_Jim_(video_game)' },
  { slug:'ryu-hayabusa', name:'Ryu Hayabusa', title:'Super Ninja', category:'Action Heroes', genre_tag:'NES Legend',
    bio:'The original action-game ninja. Ninja Gaiden\'s relentless hero who pioneered cinematic cutscenes and punishing difficulty in equal measure.',
    debut_game:'Ninja Gaiden', debut_year:1988, era:'NES / SNES / Arcade', franchise:'Ninja Gaiden',
    match_patterns:['ninja gaiden'], wiki:'Ninja_Gaiden_(NES_video_game)' },
  { slug:'bill-rizer', name:'Bill Rizer', title:'One-Man Army', category:'Action Heroes', genre_tag:'Run-n-Gun Legend',
    bio:'Shirtless, armed to the teeth, and unstoppable. Contra\'s legendary commando who proved two players and the Konami Code could conquer anything.',
    debut_game:'Contra', debut_year:1987, era:'Arcade / NES / SNES / Genesis', franchise:'Contra',
    match_patterns:['contra','probotector'], wiki:'Contra_(video_game)' },
  { slug:'prince-of-persia', name:'Prince', title:'Acrobatic Escapist', category:'Action Heroes', genre_tag:'Cinematic Pioneer',
    bio:'A nameless prince whose fluid animation revolutionized gaming. The original cinematic platformer hero who turned running and jumping into an art form.',
    debut_game:'Prince of Persia', debut_year:1989, era:'Apple II / SNES / Genesis', franchise:'Prince of Persia',
    match_patterns:['prince of persia'], wiki:'Prince_of_Persia_(1989_video_game)' },
  { slug:'leon-kennedy', name:'Leon S. Kennedy', title:'Rookie Survivor', category:'Action Heroes', genre_tag:'Horror Action Lead',
    bio:'A rookie cop on his worst first day ever. Resident Evil 2\'s breakout star who went from scared rookie to franchise leading man.',
    debut_game:'Resident Evil 2', debut_year:1998, era:'PSX / N64 / GCN', franchise:'Resident Evil',
    match_patterns:['resident evil','biohazard'], wiki:'Resident_Evil_2' },

  // ══════════ HIDDEN GEMS (17) ══════════
  { slug:'bonk', name:'Bonk', title:'TurboGrafx Star', category:'Hidden Gems', genre_tag:'Prehistoric Pioneer',
    bio:'A bald caveman with an enormous head and a headbutt that could level mountains. TurboGrafx-16\'s mascot and an underrated icon.',
    debut_game:'Bonk\'s Adventure', debut_year:1989, era:'TG16 / SNES / GB', franchise:'Bonk',
    match_patterns:['bonk'], wiki:'Bonk%27s_Adventure' },
  { slug:'pit', name:'Pit', title:'Angel Warrior', category:'Hidden Gems', genre_tag:'Mythic Hero',
    bio:'A wingless angel climbing out of the underworld with nothing but a bow. Kid Icarus\' determined hero who waited decades for his comeback.',
    debut_game:'Kid Icarus', debut_year:1986, era:'NES / GBA / NDS', franchise:'Kid Icarus',
    match_patterns:['kid icarus'], wiki:'Kid_Icarus' },
  { slug:'wonder-boy', name:'Wonder Boy', title:'Island Adventurer', category:'Hidden Gems', genre_tag:'SEGA Classic',
    bio:'A prehistoric boy on an island adventure that spawned one of gaming\'s most confusingly named franchises. SEGA\'s underrated platformer king.',
    debut_game:'Wonder Boy', debut_year:1986, era:'SMS / Genesis / TG16', franchise:'Wonder Boy',
    match_patterns:['wonder boy','monster world','adventure island'], wiki:'Wonder_Boy_(video_game)' },
  { slug:'kid-chameleon', name:'Kid Chameleon', title:'Shapeshifter', category:'Hidden Gems', genre_tag:'Genesis Cult Classic',
    bio:'A kid who collects helmets to transform into different warriors. One of the Genesis\'s most ambitious and sprawling platformers.',
    debut_game:'Kid Chameleon', debut_year:1992, era:'Genesis', franchise:'Kid Chameleon',
    match_patterns:['kid chameleon'], wiki:'Kid_Chameleon_(video_game)' },
  { slug:'sparkster', name:'Sparkster', title:'Rocket Knight', category:'Hidden Gems', genre_tag:'16-Bit Gem',
    bio:'An opossum in armor with a rocket pack and a sword. Konami\'s most underrated creation and a 16-bit masterpiece in possum form.',
    debut_game:'Rocket Knight Adventures', debut_year:1993, era:'Genesis / SNES', franchise:'Rocket Knight',
    match_patterns:['rocket knight','sparkster'], wiki:'Rocket_Knight_Adventures' },
  { slug:'toejam', name:'ToeJam', title:'Funky Alien', category:'Hidden Gems', genre_tag:'90s Cult Icon',
    bio:'A three-legged alien rapper stranded on Earth. ToeJam & Earl\'s laid-back protagonist and the Genesis\'s most unique cultural artifact.',
    debut_game:'ToeJam & Earl', debut_year:1991, era:'Genesis', franchise:'ToeJam & Earl',
    match_patterns:['toejam','toe jam'], wiki:'ToeJam_%26_Earl' },
  { slug:'kunio', name:'Kunio-kun', title:'The Original Brawler', category:'Hidden Gems', genre_tag:'Beat-Em-Up Pioneer',
    bio:'A hot-blooded high school student who punches first and asks questions never. The godfather of the beat-em-up genre.',
    debut_game:'Renegade', debut_year:1986, era:'Arcade / NES / SNES', franchise:'Kunio-kun',
    match_patterns:['river city','kunio','renegade','super dodge ball','dodgeball'], wiki:'Kunio-kun' },
  { slug:'gex', name:'Gex', title:'Couch Potato Gecko', category:'Hidden Gems', genre_tag:'90s Attitude',
    bio:'A wise-cracking gecko obsessed with television. The 90s mascot platformer era\'s most self-aware creation.',
    debut_game:'Gex', debut_year:1995, era:'3DO / PSX / Saturn', franchise:'Gex',
    match_patterns:['gex'], wiki:'Gex_(video_game)' },
  { slug:'aero', name:'Aero', title:'Acrobatic Bat', category:'Hidden Gems', genre_tag:'16-Bit Underdog',
    bio:'An acrobatic bat navigating a circus-themed world. A scrappy 16-bit platformer hero who deserved more attention than he got.',
    debut_game:'Aero the Acro-Bat', debut_year:1993, era:'SNES / Genesis', franchise:'Aero the Acro-Bat',
    match_patterns:['aero.*acro','acro.*bat'], wiki:'Aero_the_Acro-Bat' },
  { slug:'mappy', name:'Mappy', title:'Police Mouse', category:'Hidden Gems', genre_tag:'Namco Classic',
    bio:'A tiny police mouse recovering stolen goods from cats. Namco\'s adorable arcade classic with some of the catchiest music ever composed.',
    debut_game:'Mappy', debut_year:1983, era:'Arcade / NES', franchise:'Mappy',
    match_patterns:['mappy'], wiki:'Mappy' },
  { slug:'paperboy', name:'Paperboy', title:'Suburban Daredevil', category:'Hidden Gems', genre_tag:'Arcade Original',
    bio:'A kid on a bike delivering newspapers while dodging every suburban hazard imaginable. The most dangerous job in gaming.',
    debut_game:'Paperboy', debut_year:1985, era:'Arcade / NES / Genesis', franchise:'Paperboy',
    match_patterns:['paperboy','paper boy'], wiki:'Paperboy_(video_game)' },
  { slug:'viewtiful-joe', name:'Viewtiful Joe', title:'Movie Hero', category:'Hidden Gems', genre_tag:'Cel-Shaded Star',
    bio:'A movie fan pulled into the screen who uses VFX powers to fight evil. Capcom\'s most stylish and underappreciated action hero.',
    debut_game:'Viewtiful Joe', debut_year:2003, era:'GCN / PS2', franchise:'Viewtiful Joe',
    match_patterns:['viewtiful joe'], wiki:'Viewtiful_Joe' },
  { slug:'pocky', name:'Pocky', title:'Shrine Maiden Warrior', category:'Hidden Gems', genre_tag:'SNES Cult Favorite',
    bio:'A shrine maiden fighting yokai with ofuda charms. The heroine of one of the SNES\'s most charming and underrated co-op shooters.',
    debut_game:'Pocky & Rocky', debut_year:1992, era:'SNES', franchise:'Pocky & Rocky',
    match_patterns:['pocky.*rocky','kiki kaikai'], wiki:'Pocky_%26_Rocky' },
  { slug:'kuros', name:'Kuros', title:'Knight of Ironcastle', category:'Hidden Gems', genre_tag:'NES Warrior',
    bio:'The armored knight of Wizards & Warriors. An NES-era hero who battled through some of the platform genre\'s most devious level designs.',
    debut_game:'Wizards & Warriors', debut_year:1987, era:'NES', franchise:'Wizards & Warriors',
    match_patterns:['wizards.*warriors','ironsword'], wiki:'Wizards_%26_Warriors' },
  { slug:'scrooge-mcduck', name:'Scrooge McDuck', title:'Treasure-Hunting Tycoon', category:'Hidden Gems', genre_tag:'Licensed Legend',
    bio:'A cane-bouncing billionaire duck in one of the greatest NES platformers ever made. DuckTales proved licensed games could be masterpieces.',
    debut_game:'DuckTales', debut_year:1989, era:'NES / GB', franchise:'DuckTales',
    match_patterns:['ducktales','duck tales','scrooge'], wiki:'DuckTales_(video_game)' },
  { slug:'battletoads-dark-queen', name:'Dark Queen', title:'Battletoads Villainess', category:'Hidden Gems', genre_tag:'Boss Icon',
    bio:'The leather-clad villainess of Battletoads. One of gaming\'s most memorable antagonists and the reason you kept dying on the turbo tunnel.',
    debut_game:'Battletoads', debut_year:1991, era:'NES / SNES / GB', franchise:'Battletoads',
    match_patterns:['battletoads'], wiki:'Battletoads_(video_game)' },
  { slug:'amy-rose', name:'Amy Rose', title:'Sonic\'s Biggest Fan', category:'Hidden Gems', genre_tag:'Sonic Stalwart',
    bio:'A pink hedgehog with a giant hammer and an unstoppable crush on Sonic. Went from damsel to fan-favorite fighter across the franchise.',
    debut_game:'Sonic CD', debut_year:1993, era:'Sega CD / GBA / GCN', franchise:'Sonic',
    match_patterns:['sonic','amy rose'], wiki:'Amy_Rose' },
];

// ── Wikipedia Image Fetcher ─────────────────────────────────────────────────
function fetchImage(wikiSlug) {
  return new Promise((resolve) => {
    if (!wikiSlug) return resolve(null);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiSlug)}`;
    const req = https.get(url, { headers: { 'User-Agent': 'YWA-RetroStars/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          // Prefer original (hi-res) over thumbnail for better quality
          const imgUrl = j.originalimage?.source || j.thumbnail?.source;
          resolve(imgUrl || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'YWA-RetroStars/1.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return resolve(false);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    });
    req.on('error', () => { file.close(); try { fs.unlinkSync(dest); } catch {} resolve(false); });
    req.setTimeout(15000, () => { req.destroy(); file.close(); try { fs.unlinkSync(dest); } catch {} resolve(false); });
  });
}

// ── Seed Characters ─────────────────────────────────────────────────────────
export function seedRetroStars(database) {
  const db = database || getDB();
  const existing = db.prepare('SELECT COUNT(*) as c FROM game_characters').get();

  if (existing.c > 0) {
    // Incremental update: update existing + add new characters
    const existingSlugs = new Set(
      db.prepare('SELECT slug FROM game_characters').all().map(r => r.slug)
    );

    // Update wiki slugs + fields for existing characters
    const updateChar = db.prepare(`
      UPDATE game_characters SET wiki_slug = ?, category = ?, title = ?, bio = ?,
        genre_tag = ?, debut_game = ?, debut_year = ?, era = ?, franchise = ?,
        match_patterns = ?, rank_order = ?
      WHERE slug = ?
    `);

    // Insert brand new characters
    const insertChar = db.prepare(`
      INSERT OR IGNORE INTO game_characters
      (slug, name, title, category, genre_tag, bio, debut_game, debut_year, era, franchise, match_patterns, wiki_slug, rank_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const newSlugs = [];
    const upsertAll = db.transaction(() => {
      CHARACTERS.forEach((c, i) => {
        const rank = i + 1;
        if (existingSlugs.has(c.slug)) {
          updateChar.run(c.wiki || null, c.category, c.title, c.bio,
            c.genre_tag, c.debut_game, c.debut_year, c.era, c.franchise,
            JSON.stringify(c.match_patterns), rank, c.slug);
        } else {
          insertChar.run(c.slug, c.name, c.title, c.category, c.genre_tag, c.bio,
            c.debut_game, c.debut_year, c.era, c.franchise,
            JSON.stringify(c.match_patterns), c.wiki || null, rank);
          newSlugs.push(c.slug);
        }
      });
    });
    upsertAll();

    if (newSlugs.length) {
      console.log(`[retro-stars] ✅ Added ${newSlugs.length} new characters (total: ${CHARACTERS.length})`);
      // Match only new characters to ROMs
      matchCharactersToRoms(db, newSlugs);
    } else {
      console.log(`[retro-stars] Updated ${CHARACTERS.length} characters`);
    }
    return;
  }

  // Fresh seed
  console.log(`[retro-stars] Seeding ${CHARACTERS.length} characters...`);

  const insertChar = db.prepare(`
    INSERT OR IGNORE INTO game_characters
    (slug, name, title, category, genre_tag, bio, debut_game, debut_year, era, franchise, match_patterns, wiki_slug, rank_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((chars) => {
    chars.forEach((c, i) => {
      insertChar.run(
        c.slug, c.name, c.title, c.category, c.genre_tag, c.bio,
        c.debut_game, c.debut_year, c.era, c.franchise,
        JSON.stringify(c.match_patterns), c.wiki || null, i + 1
      );
    });
  });
  insertMany(CHARACTERS);
  console.log(`[retro-stars] ✅ Seeded ${CHARACTERS.length} characters`);

  matchCharactersToRoms(db);
}

// ── ROM Matching ────────────────────────────────────────────────────────────
function matchCharactersToRoms(db, onlySlugs) {
  let chars;
  if (onlySlugs) {
    const placeholders = onlySlugs.map(() => '?').join(',');
    chars = db.prepare(`SELECT id, slug, match_patterns FROM game_characters WHERE slug IN (${placeholders})`).all(...onlySlugs);
  } else {
    chars = db.prepare('SELECT id, slug, match_patterns FROM game_characters').all();
  }

  const insertApp = db.prepare(`
    INSERT OR IGNORE INTO character_appearances (character_id, rom_id, appearance_order, note)
    VALUES (?, ?, ?, ?)
  `);

  let total = 0;
  for (const ch of chars) {
    const patterns = JSON.parse(ch.match_patterns || '[]');
    if (!patterns.length) continue;

    const conditions = patterns.map(p => `(LOWER(r.clean_name) LIKE '%${p.toLowerCase()}%' OR LOWER(COALESCE(m.title,'')) LIKE '%${p.toLowerCase()}%')`);
    const where = conditions.join(' OR ');

    const roms = db.prepare(`
      SELECT r.id, COALESCE(m.title, r.clean_name) as display_title, m.year
      FROM roms r LEFT JOIN metadata m ON m.rom_id = r.id
      WHERE ${where}
      ORDER BY CAST(COALESCE(m.year, '9999') AS INTEGER), r.clean_name
    `).all();

    roms.forEach((rom, idx) => {
      insertApp.run(ch.id, rom.id, idx + 1, null);
      total++;
    });
  }
  console.log(`[retro-stars] ✅ Matched ${total} ROM appearances across ${chars.length} characters`);
}

// ── Image Download (async, run after server starts) ─────────────────────────
export async function downloadCharacterImages(forceRedownload = false) {
  const db = getDB();
  const chars = db.prepare('SELECT id, slug, wiki_slug, image_path FROM game_characters WHERE wiki_slug IS NOT NULL').all();

  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

  let downloaded = 0, skipped = 0;
  for (const ch of chars) {
    if (!forceRedownload) {
      // Skip if already has image
      if (ch.image_path) {
        const fullPath = path.join(IMG_DIR, '..', '..', ch.image_path.replace(/^\//, ''));
        if (fs.existsSync(fullPath)) { skipped++; continue; }
      }

      // Check for any existing file with any extension
      const existing = ['jpg','png','webp','gif','jpeg'].find(ext =>
        fs.existsSync(path.join(IMG_DIR, `${ch.slug}.${ext}`))
      );
      if (existing) {
        db.prepare('UPDATE game_characters SET image_path = ? WHERE id = ?')
          .run(`/img/stars/${ch.slug}.${existing}`, ch.id);
        skipped++;
        continue;
      }
    }

    try {
      const imgUrl = await fetchImage(ch.wiki_slug);
      if (!imgUrl) continue;

      const ext = imgUrl.match(/\.(png|jpg|jpeg|gif|webp)/i)?.[1] || 'jpg';
      const localPath = path.join(IMG_DIR, `${ch.slug}.${ext}`);

      // Delete old file if force re-downloading
      if (forceRedownload) {
        ['jpg','png','webp','gif','jpeg'].forEach(e => {
          const old = path.join(IMG_DIR, `${ch.slug}.${e}`);
          if (fs.existsSync(old)) fs.unlinkSync(old);
        });
      }

      const ok = await downloadFile(imgUrl, localPath);
      if (ok) {
        db.prepare('UPDATE game_characters SET image_path = ? WHERE id = ?')
          .run(`/img/stars/${ch.slug}.${ext}`, ch.id);
        downloaded++;
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      // Silent skip
    }
  }
  console.log(`[retro-stars] 🖼️ Images: ${downloaded} downloaded, ${skipped} skipped (already cached)`);
}
