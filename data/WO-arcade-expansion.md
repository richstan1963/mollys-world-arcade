# WORK ORDER: Arcade Expansion — Pinball Parlor, Pool Hall & Arcade Oddities

**Date**: March 11, 2026
**Project**: Your World Arcade (YWA)
**Status**: PLANNING

---

## 1. EXECUTIVE SUMMARY

Expand YWA with dedicated genre collections for pinball, bowling, pool/billiards, and other arcade oddities. Inspired by dedicated pinball sites (247pinball.com, classicgame.com, plays.org) and retro gaming portals (retrogames.games, emulatorgamer.com), this adds themed browsing experiences that no other retro gaming site offers — making YWA's approach uniquely immersive.

---

## 2. COMPETITIVE ANALYSIS

### retrogames.games
- 30,000+ games, 22 systems, browser-based emulation
- Clean gradient design (blues/purples), card grid with hover effects
- "Hot Games" + "Best Games" curated sections
- Per-console browsing, search, mobile responsive
- **Generic** — no character pages, no favorites, no themes, no player profiles

### emulatorgamer.com
- 2,000+ games with save states + customizable controls
- **Series collections** (Kingdom Hearts, Shining Force) — games grouped by franchise
- Genre browsing across all systems
- **Also generic** — standard ROM site with better organization

### 247pinball.com (dedicated pinball)
- Dark theme: black/charcoal backgrounds + gold/yellow (#ffba00) neon accents
- Canvas-based full-screen pinball player — immersive
- Thumbnail grid (90px) with 1.1x hover scale + gold text
- Radial gradient overlays framing the active game
- Gold-to-orange gradient preloader animation
- **Takeaway**: Dark + neon gold aesthetic is perfect for a pinball section

### classicgame.com
- Categories: Tetris, Pinball, Arkanoid, Pac Maze, Retro, Snake, Puzzles, **Billiards**, Board
- **18 pinball games**, **24 billiards/pool games**
- Card grid 300x200 thumbnails + play buttons
- Sort: Best rated, Newest, Most played, Alphabetical
- **Key insight**: Pinball and Billiards as FIRST-CLASS top-level categories

### plays.org
- Large hero image per category with descriptive text
- 150x150 square thumbnails, cross-tagging system
- Comment counts, "Exclusive" + "New & Cool" sections
- 100+ category tags — deep taxonomy
- **Takeaway**: Cross-tagging lets one game live in multiple collections

### virtualpinball.com (VPcabs)
- Physical cabinets with thousands of virtual tables
- "Pinball museum" browsing concept
- **Takeaway**: Browsing pinball history as an experience, not just a list

### What YWA Already Has That NONE of Them Do
- Retro Stars character encyclopedia (101 characters)
- 50-theme system with Zen mode
- Player profiles with favorites + play history
- Arcade Gallery visual showcase
- Game intel (AI-generated bios/trivia)
- Desktop mode streaming to PC with native 4K emulators
- Command Center dashboard

---

## 3. NEW FEATURES TO BUILD

### 3A. Genre Collection System (Database)

Add a `collections` table and `collection_games` junction table:

```sql
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,           -- 'pinball-parlor', 'pool-hall', etc.
  name TEXT NOT NULL,            -- 'Pinball Parlor'
  description TEXT,
  theme TEXT,                    -- 'dark-gold', 'green-felt', 'neon-lanes'
  icon TEXT,                     -- emoji or icon class
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_games (
  collection_id TEXT NOT NULL,
  rom_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (collection_id, rom_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id),
  FOREIGN KEY (rom_id) REFERENCES roms(id)
);
```

A game can belong to MULTIPLE collections (cross-tagging).

### 3B. Themed Collection Views

Each collection gets its own themed browsing page:

**Pinball Parlor** (`#/collections/pinball-parlor`)
- Dark background (#1a1a2e) with neon gold (#ffba00) accents
- Pinball machine silhouette or bumper art as hero
- Grid of pinball games with box art thumbnails
- Sort: A-Z, System, Most Played, Favorites First

**Pool Hall** (`#/collections/pool-hall`)
- Dark green felt texture background (#1a4d2e)
- Warm lighting feel, wood grain accents
- Pool/billiards games displayed as cards

**Bowling Alley** (`#/collections/bowling-alley`)
- Lane-inspired horizontal lines, polished wood look
- Retro bowling signage aesthetic
- Bowling games collection

**Arcade Oddities** (`#/collections/arcade-oddities`)
- Neon carnival aesthetic, bright mixed colors
- For the weird/unique games: Tapper, BurgerTime, Marble Madness, Rampart, etc.

**Puzzle Arcade** (`#/collections/puzzle-arcade`)
- Clean, colorful block aesthetic
- Tetris, Puzzle Bobble, Columns, Puyo Puyo, Arkanoid, etc.

**Racing Pit** (`#/collections/racing-pit`)
- Checkered flag motif, speed lines
- All racing/driving games across systems

**Sports Bar** (`#/collections/sports-bar`)
- Classic sports bar wood/TV aesthetic
- Golf, tennis, hockey, baseball, wrestling, Windjammers, etc.

### 3C. Collection Browser (Sidebar + Home)

- Add "Collections" section to sidebar navigation
- Collections overview page showing all themed collections as large cards
- Each card shows: collection name, icon, game count, themed preview

### 3D. Sort & Filter Enhancements

Add to library/collection pages:
- Sort by: Most Played, Favorites First, A-Z, System, Newest Added
- Filter by: System, Has Artwork, In Collection

---

## 4. ROM SOURCING LIST

### 4A. PINBALL — Missing ROMs to Source (16 games)

| # | Game | System | Filename Pattern | Priority |
|---|------|--------|-----------------|----------|
| 1 | Kirby's Pinball Land | GB | `Kirby's Pinball Land*` | HIGH |
| 2 | Pokemon Pinball | GBC | `Pokemon Pinball*` | HIGH |
| 3 | Pokemon Pinball Ruby & Sapphire | GBA | `Pokemon Pinball*Ruby*` | HIGH |
| 4 | Mario Pinball Land | GBA | `Mario Pinball*` | HIGH |
| 5 | Super Pinball: Behind the Mask | SNES | `Super Pinball*` | MED |
| 6 | Jaki Crush | SNES | `Jaki Crush*` | MED |
| 7 | Dragon's Fury | Genesis | `Dragon's Fury*` OR `Devil Crash*` | HIGH |
| 8 | Dragon's Revenge | Genesis | `Dragon's Revenge*` | MED |
| 9 | Dino Land | Genesis | `Dino Land*` | MED |
| 10 | Pinball Quest | NES | `Pinball Quest*` | HIGH |
| 11 | Pin*Bot | NES | `Pin*Bot*` OR `Pin Bot*` | MED |
| 12 | High Speed | NES | `High Speed*` | MED |
| 13 | Rock 'n' Ball | NES | `Rock 'n' Ball*` OR `Rock n Ball*` | LOW |
| 14 | Rollerball | NES | `Rollerball*` | LOW |
| 15 | Gals Pinball | Arcade | `galspnbl*` | MED |
| 16 | Pinball Action | Arcade | `pbaction*` | MED |

### 4B. BOWLING — Missing ROMs to Source (5 games)

| # | Game | System | Filename Pattern | Priority |
|---|------|--------|-----------------|----------|
| 1 | Championship Bowling | NES | `Championship Bowling*` | HIGH |
| 2 | Super Bowling | SNES | `Super Bowling*` | HIGH |
| 3 | Brunswick World Tournament | SNES | `Brunswick*` | MED |
| 4 | Big Strike Bowling | Arcade | `bigstrik*` | LOW |
| 5 | Strata Bowling | Arcade | `strata*` OR `sbowling*` | LOW |

### 4C. POOL / BILLIARDS — Missing ROMs to Source (7 games)

| # | Game | System | Filename Pattern | Priority |
|---|------|--------|-----------------|----------|
| 1 | Side Pocket | NES | `Side Pocket*` | HIGH |
| 2 | Side Pocket | SNES | `Side Pocket*` | HIGH |
| 3 | Side Pocket | Genesis | `Side Pocket*` | HIGH |
| 4 | Side Pocket | Arcade | `sidepckt*` | HIGH |
| 5 | Minnesota Fats Pool Legend | Genesis | `Minnesota Fats*` | MED |
| 6 | Pocket Gal | Arcade | `pcktgal*` | MED |
| 7 | Pocket Gal Deluxe | Arcade | `pckgaldx*` | MED |

### 4D. ARCADE ODDITIES — Missing ROMs to Source (12 games)

| # | Game | System | Filename Pattern | Priority |
|---|------|--------|-----------------|----------|
| 1 | Puzz Loop | Arcade | `pzloop*` | HIGH |
| 2 | Quiz & Dragons | Arcade | `qad*` | MED |
| 3 | Point Blank | Arcade/PS1 | `gunbarl*` OR `Point Blank*` | MED |
| 4 | Rampage | Arcade | `rampage*` | HIGH |
| 5 | Rampage | NES | `Rampage*` | HIGH |
| 6 | Pengo | Arcade | `pengo*` | HIGH |
| 7 | Buster Bros / Pang | SNES | `Buster Bros*` OR `Super Pang*` | MED |
| 8 | Buster Bros / Pang | TG16 | `Buster Bros*` | MED |
| 9 | Devilish | Genesis | `Devilish*` | LOW |
| 10 | Klax | NES | `Klax*` | LOW |
| 11 | Klax | Genesis | `Klax*` | LOW |
| 12 | Lucky & Wild | Arcade | `luckywld*` | LOW |

### TOTAL NEW ROMS TO SOURCE: ~40 games

---

## 5. CURRENT ROM INVENTORY (Already in Library)

### Pinball (10 games)
- [tg16] Alien Crush
- [tg16] Devil's Crush
- [genesis] Sonic Spinball
- [nes] Pinball
- [vb] Galactic Pinball
- [atari2600] Video Pinball
- [jaguar] Pinball Fantasies
- [jaguar] Ruiner Pinball
- [lynx] Pinball Jam
- [ngp] Crush Roller

### Bowling (3 real bowling games)
- [arcade/neogeo] League Bowling (x2)
- [atari2600] Bowling
- [vb] Virtual Bowling
- [vb] Nester's Funky Bowling

### Pool/Billiards (1 game)
- [wonderswan] Side Pocket

### Puzzle (70 games)
- Tetris (7 versions across NES, GB, Genesis, SNES, WonderSwan, GBA, Arcade)
- Puzzle Bobble / Bust-a-Move (8 versions)
- Columns (6 versions)
- Dr. Mario (4 versions)
- Magical Drop (4 versions)
- Arkanoid (3 versions)
- Bubble Bobble (4 versions)
- Puyo Puyo (2 versions)
- Super Puzzle Fighter II Turbo (Arcade)
- Plus many more

### Racing (71 games)
- F-Zero (SNES, GBA x2, N64)
- Mario Kart (SNES, N64, GBA, NDS)
- OutRun (SMS, Arcade x2)
- Road Rash (Genesis, Saturn, GB, SMS, N64)
- Top Gear (SNES x2, GBA)
- Ridge Racer (PSP x2)
- Cruisin' USA (Arcade)
- Plus many more

### Sports (111 games)
- Punch-Out!! (NES x3, SNES x2, Arcade x2)
- Windjammers (Arcade, Neo Geo)
- Neo Turf Masters (Neo Geo x2)
- Super Dodge Ball (Arcade, Neo Geo)
- Baseball Stars (Neo Geo x4)
- Plus many more

### Carnival/Unique (13 games)
- Tapper (Atari 2600, Arcade)
- BurgerTime (Arcade)
- Marble Madness (Genesis, Arcade)
- Paperboy (NES, Lynx)
- Snow Bros (Arcade)
- Pang 3 (Arcade)
- Rampart (Lynx)
- Carnival (Atari 2600)
- Warlords (Atari 2600)

### Light Gun (6 games)
- Duck Hunt (NES)
- Hogan's Alley (NES)
- Wild Gunman (NES)
- House of the Dead 2 (Dreamcast)
- Virtua Cop 1 & 2 (Saturn)

---

## 6. IMPLEMENTATION PHASES

### Phase 1: Database & Backend (collections system)
- Add V15 migration: `collections` + `collection_games` tables
- Seed default collections: Pinball Parlor, Pool Hall, Bowling Alley, Arcade Oddities, Puzzle Arcade, Racing Pit, Sports Bar
- Auto-assign existing ROMs to collections based on title/clean_name pattern matching
- API endpoints: GET /api/library/collections, GET /api/library/collections/:id
- Sort options: most_played, favorites, alphabetical, system, newest

### Phase 2: Frontend Collection Views
- Collection overview page (`#/collections`) — large themed cards for each collection
- Individual collection page (`#/collections/:id`) — themed game grid
- Custom CSS themes per collection:
  - Pinball Parlor: dark + neon gold (#ffba00)
  - Pool Hall: dark green felt (#1a4d2e) + wood
  - Bowling Alley: polished lanes + retro signage
  - Arcade Oddities: neon carnival colors
  - Puzzle Arcade: colorful blocks
  - Racing Pit: checkered flags + speed lines
  - Sports Bar: wood + TV screens
- Sidebar navigation entry for Collections
- Hero banner per collection with themed art

### Phase 3: ROM Sourcing (User Action Required)
- Source ~40 new ROMs per the lists in Section 4
- Add to appropriate system folders on Games drive
- Trigger library rescan
- Verify new games appear in correct collections

### Phase 4: Enhanced Features
- "Most Played" sort across all library views (track play count)
- "Favorites First" sort option
- Cross-collection tagging (Sonic Spinball in both Pinball + Sonic franchise)
- Franchise/series collections (all Marios, all Sonics, all Mega Mans)
- "Hot Games" / "Recently Played" section on home page

---

## 7. DESIGN SPECIFICATIONS

### Pinball Parlor Theme
```css
/* Inspired by 247pinball.com */
--pp-bg: #1a1a2e;
--pp-surface: #16213e;
--pp-accent: #ffba00;       /* neon gold */
--pp-accent-hover: #ffd700;
--pp-text: #e8e8e8;
--pp-glow: 0 0 20px rgba(255, 186, 0, 0.3);
/* Radial gradient overlay behind active game */
/* 1.1x scale + gold text on thumbnail hover */
```

### Pool Hall Theme
```css
--ph-bg: #0d2818;
--ph-surface: #1a4d2e;      /* felt green */
--ph-accent: #c9a84c;       /* brass/gold trim */
--ph-wood: #5c3a1e;         /* dark wood */
--ph-text: #e8dcc8;         /* warm white */
/* Subtle felt texture background */
/* Wood grain borders on cards */
```

### Bowling Alley Theme
```css
--ba-bg: #1a1410;
--ba-surface: #2d2418;      /* polished wood */
--ba-accent: #ff4444;       /* bowling red */
--ba-lane: #d4a857;         /* lane wood */
--ba-text: #f0e6d3;
/* Horizontal lane lines in background */
/* Retro neon signage typography */
```

### Arcade Oddities Theme
```css
--ao-bg: #0f0f23;
--ao-surface: #1a1a3e;
--ao-accent: #ff6b9d;       /* neon pink */
--ao-accent2: #00d4ff;      /* electric blue */
--ao-accent3: #7fff00;      /* neon green */
--ao-text: #ffffff;
/* Rotating neon color accents */
/* Carnival light border animations */
```

---

## 8. SUCCESS CRITERIA

- [ ] Collections system working with 7 themed collections
- [ ] Each collection has its own themed CSS
- [ ] Existing 280+ games auto-tagged into collections (pinball: 10, bowling: 5, pool: 1, puzzle: 70, racing: 71, sports: 111, oddities: 13)
- [ ] Sidebar shows Collections nav entry
- [ ] Sort by Most Played / Favorites / A-Z / System works
- [ ] ~40 new ROMs sourced and appearing in library (user action)
- [ ] Cross-tagging working (game in multiple collections)
- [ ] Mobile responsive collection views

---

## 9. INSPIRATION SOURCES

- [247pinball.com](https://www.247pinball.com/) — dark + gold pinball aesthetic
- [classicgame.com](https://www.classicgame.com/) — genre-as-first-class-category pattern
- [plays.org](https://plays.org/pinball-games/) — cross-tagging, hero images, deep taxonomy
- [retrogames.games](https://retrogames.games/) — card grid, hover effects, curated sections
- [emulatorgamer.com](https://emulatorgamer.com/) — series/franchise collections
- [virtualpinball.com](https://virtualpinball.com/) — pinball museum browsing concept
