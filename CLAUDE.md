# Your World Arcade (YWA) - Developer Guide

## Overview
Feature-rich, locally-hosted retro game browser and player. Full-stack web app for browsing, managing, and playing classic arcade games with leaderboards, clans, and challenges.

## Tech Stack
- **Backend**: Node.js (v20+) with Express.js
- **Frontend**: Vanilla JavaScript, HTML5, 50+ themes
- **Database**: SQLite3 (better-sqlite3)
- **Emulation**: EmulatorJS (v4.2.3) with LibreRetro cores
- **AI**: Multi-provider LLM integration (10 providers)

## Directory Structure
```
/server/
  ├── index.js              # Express app entry point
  ├── config.js             # System mappings, paths, URLs
  ├── db.js                 # SQLite schema
  ├── routes/               # 25+ API endpoints
  ├── services/             # Metadata enrichment (ScreenScraper, IGDB, etc.)
  ├── lib/ai.js             # Multi-provider LLM
  └── middleware/           # COOP-COEP, validation

/public/
  ├── index.html            # Main SPA
  ├── css/                  # 10+ stylesheets
  └── js/utils/             # Router, themes, arcade-engine

/data/
  ├── cores/                # 192 LibreRetro cores
  ├── dats/                 # Game database metadata
  └── localization/         # Multi-language support

/roms/ & /artwork/          # User-managed game files
```

## Core Features
- **Game Library**: ROM scanning, metadata enrichment from 8+ sources
- **Multi-Player**: Player profiles, favorites, character themes
- **Competitive**: Leaderboards, clans, battles, daily challenges
- **AI Integration**: LLM-powered game guides (10 providers)
- **Theming**: 50+ arcade/character themes

## Database Schema
Key tables: `systems`, `roms`, `metadata`, `players`, `clans`, `battles`, `ratings`, `achievements`

## Shared Infrastructure

### Environment Variables
This project uses symlinked `.env` from `~/.shared/.env.master`:
```bash
ls -la .env  # -> /Users/richardstanford/.shared/.env.master
```

### LLM Waterfall (14 Providers)
Already integrated in `/server/lib/ai.js`. Provider cascade:
```
SambaNova → OpenRouter → Mistral → Gemini → Cerebras → Groq → Ollama
```

### Available API Keys (via .env.master)
```
# LLM Providers
SAMBANOVA_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY
GEMINI_API_KEY, CEREBRAS_API_KEY, GROQ_API_KEY

# Game Metadata
SCREENSCRAPER_USER, SCREENSCRAPER_PASSWORD
IGDB_CLIENT_ID, IGDB_CLIENT_SECRET
GIANTBOMB_API_KEY, RETROACHIEVEMENTS_API_KEY
```

## Development

### Quick Start
```bash
npm install
npm start          # Production server
npm run dev        # With file watching
```

### Configuration
See `/server/config.js` for:
- System mappings (ScreenScraper, IGDB IDs)
- API endpoints for enrichment
- ROM/artwork/saves directories

### Testing AI Guides
```bash
# Test LLM endpoint
curl -X POST http://localhost:3000/api/game-guide \
  -H "Content-Type: application/json" \
  -d '{"gameId": "123", "question": "How do I beat level 1?"}'
```

## Metadata Sources
1. ScreenScraper (primary)
2. IGDB
3. GiantBomb
4. RetroAchievements
5. OpenVGDB
6. TheGamesDB
7. MobyGames
8. Wikipedia

## Deployment
Supports Railway/Render/Fly.io:
```bash
# Set for cloud persistent volumes
ARCADE_DATA_DIR=/data
```

## Related Projects
All share `.env.master` and LLM waterfall:
- **AIC** - AI Corridor platform
- **BOM** - Montgomery County community site
- **ProducerOS** - Music production dashboard
- **Safari** - Wildlife species database

## Quick Commands
```bash
# Check shared env
ls -la .env

# Start dev server
npm run dev

# Scan for new ROMs
node scripts/scan-roms.js

# Enrich game metadata
node scripts/enrich-metadata.js --game "Pac-Man"

# Test LLM
node -e "
const ai = require('./server/lib/ai');
ai.query('What are the ghosts in Pac-Man?').then(console.log);
"
```
