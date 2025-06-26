const SftpClient = require('ssh2-sftp-client');
const axios = require('axios');
const { parse } = require('csv-parse');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');

// Add these global error handlers here
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err.message);
  console.log('🔄 The script will continue running and try again next cycle');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise);
  console.error('💬 Reason:', reason);
  console.log('🔄 The script will continue running and try again next cycle');
});

/**
 * =========================================
 * DEADSIDE KILLFEED & LEADERBOARD TRACKING
 * =========================================
 * Enhanced Discord integration for Deadside servers
 * With professional visuals and rich embeds
 */

// === SERVER CONFIGURATIONS ===
const serverConfigs = [
  {
    host: ,
    port: ,
    username: ,
    password: ,
    remoteDir: ,
    killWebhook: ,
    suicideWebhook: ,
    leaderboardWebhook: ,
    dailyLeaderboardWebhook: ,
    weeklyLeaderboardWebhook: ,
    monthlyLeaderboardWebhook: ,
    allTimeLeaderboardWebhook: ,
    longshotWebhook: ,
    allPlayersStatsWebhook: ,
    serverName: "3X US",
    color: , 
    iconUrl: 
  }
];

// === MEMORY FILES ===
const MEMORY_FILE = 'seen-lines.json';
const LEADERBOARD_FILE = 'leaderboard.json'; // Legacy - keeping for backward compatibility
const STATS_FILE = 'player-stats.json'; // New format for player stats
const LONGSHOTS_FILE = 'longshots.json'; // For tracking long-distance kills
const KILLSTREAKS_FILE = 'killstreaks.json'; // For tracking killstreaks
const MESSAGE_INDEXES_FILE = 'message-indexes.json'; // For tracking last used message indexes

// === RATE LIMITS ===
const RATE_LIMITS = {
  // Track rate limits for each webhook URL
  webhooks: {},
  // Global queue for messages to avoid hitting rate limits
  queue: [],
  // Is the queue processor running?
  processing: false
};

// Load data (properly load from files instead of resetting)
let seenLines = loadSeenLines(); // Load previously seen lines
let leaderboards = loadLeaderboards(); // Load leaderboards
let playerStats = loadPlayerStats(); // Load player stats
let longshots = loadLongshots(); // Load longshots
let activeKillstreaks = loadKillstreaks(); // Load killstreaks
let messageIndexes = loadMessageIndexes(); // Load message indexes

console.log(`📊 Loaded ${seenLines.size} previously seen lines`);
console.log(`📊 Loaded ${Object.keys(playerStats.all_time).length} all-time player records`);

console.log(`📊 Loaded ${Object.keys(activeKillstreaks).length} active killstreaks`);
setTimeout(logActiveKillstreaks, 3000); // Log active killstreaks after startup
// === EMBED TEMPLATES ===

// These templates will be used for Discord's rich embeds
const EMBED_TEMPLATES = {
  // Kill notification embed
  kill: {
    title: "{emoji} {killer} eliminated {victim}",
    color: null, // Will be set from server config
    description: null, // Will be generated from kill phrase
    thumbnail: { url: "{weaponIcon}" },
    image: { url: null }, // CHANGED: Use an object with null URL
    fields: [
      { name: "Weapon", value: "{weapon}", inline: true },
      { name: "Distance", value: "{distance}m", inline: true }
    ],
    footer: { 
      text: "{serverName}", 
      icon_url: "{serverIcon}" 
    },
    timestamp: new Date().toISOString()
  },
  
  // Suicide notification embed
  suicide: {
    title: "{emoji} {victim} died",
    color: "#DD3333", // Red color for suicides
    description: null, // Will be generated from suicide phrase
    thumbnail: { url: "https://i.imgur.com/6guD1s3.png" },
    image: { url: null }, // CHANGED: Use an object with null URL
    footer: { 
      text: "{serverName}", 
      icon_url: "{serverIcon}" 
    },
    timestamp: new Date().toISOString()
  },
  
  // Killstreak notification embed
  killstreak: {
    title: "⚡ Killstreak Alert!",
    color: "#FFAA00", // Orange color for killstreaks
    description: "**{player}** {milestone} ({count} kills)",
    thumbnail: { url: "https://i.imgur.com/6guD1s3.png" },
    image: { url: null }, // CHANGED: Use an object with null URL
    footer: { 
      text: "{serverName}", 
      icon_url: "{serverIcon}" 
    },
    timestamp: new Date().toISOString()
  },
  
  // Longshot embed template
  longshot: {
    title: "🎯 Incredible Long-range Kill!",
    color: "#AA33AA", // Purple color for longshots
    description: null, // Will be generated from longshot phrase
    fields: [
      { name: "Distance", value: "**{distance}m**", inline: true },
      { name: "Weapon", value: "{weapon}", inline: true }
    ],
    thumbnail: { url: "https://i.imgur.com/6guD1s3.png" },
    image: { url: null }, // CHANGED: Use an object with null URL
    footer: { 
      text: "{serverName}", 
      icon_url: "{serverIcon}" 
    },
    timestamp: new Date().toISOString()
  }
};

// === HELPER: RETRY FUNCTION ===
async function retryAsync(fn, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < retries - 1) {
        console.warn(`⚠️ Retry ${i + 1} after error: ${err.message}`);
        await new Promise(res => setTimeout(res, delayMs));
      } else {
        throw err;
      }
    }
  }
}
// === HIGHLIGHTED PLAYERS CONFIG ===
const HIGHLIGHTED_PLAYERS = {
  "JeffBezzoss": { 
    color: "#FFD700", // Gold color
    prefix: "💸ASH WAKE💸 ", // Prefix to add before the name
    emoji: "💸", // Emoji for additional highlighting
    gifUrl: "https://i.imgur.com/UyD4yBI.png", // ASH WAKE GIF
    thumbnailUrl: "https://i.imgur.com/BXUz0Sv.png" // Default thumbnail image
  },
  "YouLackSkill": { 
    color: "#FFD700", // Gold color
    prefix: "💸ASH WAKE💸 ", // Prefix to add before the name
    emoji: "💸", // Emoji for additional highlighting
    gifUrl: "https://i.imgur.com/UyD4yBI.png", // ASH WAKE GIF
    thumbnailUrl: "https://i.imgur.com/BXUz0Sv.png" // Default thumbnail image
  },
  "XGrimReaperX252": { 
    color: "#FFD700", // Gold color
    prefix: "💸ASH WAKE💸 ", // Prefix to add before the name
    emoji: "💸", // Emoji for additional highlighting
    gifUrl: "https://i.imgur.com/UyD4yBI.png", // ASH WAKE GIF
    thumbnailUrl: "https://i.imgur.com/BXUz0Sv.png" // Default thumbnail image
  },
  "ELM HayzEe": { 
    color: "#FFD700",
    prefix: "💸ASH WAKE💸 ",
    emoji: "💸",
    gifUrl: "https://i.imgur.com/UyD4yBI.png",
    thumbnailUrl: "https://i.imgur.com/BXUz0Sv.png" // Default thumbnail image
  },
  "Dacowmonster707": { 
    color: "#FFD700",
    prefix: "💸ASH WAKE💸 ",
    emoji: "💸",
    gifUrl: "https://i.imgur.com/UyD4yBI.png",
    thumbnailUrl: "https://i.imgur.com/BXUz0Sv.png" // Default thumbnail image
  },
  "ZIGGIDY3": {
    color: "#FF7700",
    prefix: "⚰️DEAD MARSHALL⚰️ ", 
    emoji: "⚰️",
    gifUrl: "https://i.imgur.com/N77b4FA.png",
    thumbnailUrl: "https://i.imgur.com/6guD1s3.png" // Default thumbnail image
  },
  "ELM Juicy": {
    color: "#FF7700",
    prefix: "⚰️DEAD MARSHALL⚰️ ",
    emoji: "⚰️",
    gifUrl: "https://i.imgur.com/N77b4FA.png",
    thumbnailUrl: "https://i.imgur.com/6guD1s3.png" // Default thumbnail image
  },
  "SogftPuncake": {
    color: "#FF7700",
    prefix: "⚰️DEAD MARSHALL⚰️ ",
    emoji: "⚰️",
    gifUrl: "https://i.imgur.com/N77b4FA.png",
    thumbnailUrl: "https://i.imgur.com/6guD1s3.png" // Default thumbnail image
  },
  "Rag3xHades-": {
    color: "#FF7700",
    prefix: "⚰️DEAD MARSHALL⚰️ ", 
    emoji: "⚰️",
    gifUrl: "https://i.imgur.com/N77b4FA.png",
    thumbnailUrl: "https://i.imgur.com/6guD1s3.png" // Default thumbnail image
  },
  "TA Destiny": {
    color: "#FF7700",
    prefix: "⚰️DEAD MARSHALL⚰️ ", 
    emoji: "⚰️",
    gifUrl: "https://i.imgur.com/N77b4FA.png",
    thumbnailUrl: "https://i.imgur.com/6guD1s3.png" // Default thumbnail image
  }
};

// Add this constant with your other file constants
const HIGHLIGHTED_PLAYERS_FILE = 'highlighted-players.json';
// Function to check if a player is highlighted
function isHighlightedPlayer(playerName) {
  return HIGHLIGHTED_PLAYERS.hasOwnProperty(playerName);
}

// Function to get player highlight info
function getPlayerHighlight(playerName) {
  return HIGHLIGHTED_PLAYERS[playerName] || null;
}

// Function to format player name with highlight if applicable
function formatPlayerName(playerName) {
  const highlight = getPlayerHighlight(playerName);
  
  if (highlight) {
    // Apply the role prefix and emoji highlighting
    return `${highlight.prefix}**${playerName}** ${highlight.emoji}`;
  }
  
  // Regular player just gets bold formatting
  return `**${playerName}**`;
}

// Functions to save and load highlighted players
function saveHighlightedPlayers() {
  try {
    fs.writeFileSync(HIGHLIGHTED_PLAYERS_FILE, JSON.stringify(HIGHLIGHTED_PLAYERS));
    console.log('✅ Saved highlighted players configuration.');
  } catch (err) {
    console.error('❌ Failed to save highlighted players:', err.message);
  }
}

function loadHighlightedPlayers() {
  try {
    // Store a copy of your code-defined players
    const codeDefinedPlayers = JSON.parse(JSON.stringify(HIGHLIGHTED_PLAYERS));
    
    // Try to load from file
    const data = fs.readFileSync(HIGHLIGHTED_PLAYERS_FILE);
    const loaded = JSON.parse(data);
    
    // Clear current config to start fresh
    for (const player in HIGHLIGHTED_PLAYERS) {
      delete HIGHLIGHTED_PLAYERS[player];
    }
    
    // Add all code-defined players back first
    for (const player in codeDefinedPlayers) {
      HIGHLIGHTED_PLAYERS[player] = codeDefinedPlayers[player];
    }
    
    // Only update players that exist in our code
    for (const player in loaded) {
      if (codeDefinedPlayers.hasOwnProperty(player)) {
        // Take file values but ensure required properties exist
        HIGHLIGHTED_PLAYERS[player] = loaded[player];
        
        // Make sure gifUrl is set
        if (!HIGHLIGHTED_PLAYERS[player].gifUrl) {
          console.log(`⚠️ Fixing missing gifUrl for ${player}`);
          HIGHLIGHTED_PLAYERS[player].gifUrl = codeDefinedPlayers[player].gifUrl;
        }
        
        // Make sure thumbnailUrl is set
        if (!HIGHLIGHTED_PLAYERS[player].thumbnailUrl) {
          console.log(`⚠️ Fixing missing thumbnailUrl for ${player}`);
          HIGHLIGHTED_PLAYERS[player].thumbnailUrl = codeDefinedPlayers[player].thumbnailUrl;
        }
      }
    }
    
    console.log('✅ Loaded highlighted players configuration.');
    
    // Save the fixed configuration back to file
    saveHighlightedPlayers();
  } catch (err) {
    console.log('ℹ️ No highlighted players file found or error reading. Using defaults.');
    saveHighlightedPlayers(); // Create the file with defaults
  }
}
// Function to clean up and reset highlighted players to code defaults
function resetHighlightedPlayers() {
  console.log('🧹 Resetting highlighted players to code defaults...');
  
  try {
    // Delete the saved file first
    fs.unlinkSync(HIGHLIGHTED_PLAYERS_FILE);
    console.log('✅ Deleted saved highlighted players file');
  } catch (err) {
    console.log('ℹ️ No file to delete or error deleting');
  }
  
  // Run validation to show current state
  validateHighlightedPlayerUrls();
  
  // Save with current code defaults
  saveHighlightedPlayers();
  console.log('✅ Reset highlighted players completed');
}
// Add a function to check for thumbnail URLs in the HIGHLIGHTED_PLAYERS object
function checkHighlightedPlayersThumbnails() {
  console.log('🔍 Checking highlighted players Thumbnail URLs:');
  for (const player in HIGHLIGHTED_PLAYERS) {
    const highlight = HIGHLIGHTED_PLAYERS[player];
    if (highlight.thumbnailUrl) {
      console.log(`✅ ${player} has Thumbnail URL: ${highlight.thumbnailUrl}`);
    } else {
      console.log(`⚠️ ${player} is missing Thumbnail URL - will use GIF or weapon icon`);
    }
  }
}
function checkHighlightedPlayersGifs() {
  console.log('🔍 Checking highlighted players GIF URLs:');
  for (const player in HIGHLIGHTED_PLAYERS) {
    const highlight = HIGHLIGHTED_PLAYERS[player];
    if (highlight.gifUrl) {
      console.log(`✅ ${player} has GIF URL: ${highlight.gifUrl}`);
    } else {
      console.log(`❌ ${player} is missing GIF URL!`);
    }
  }
}
// Call this function during initialization along with the GIF check
setTimeout(() => {
  checkHighlightedPlayersGifs();
  checkHighlightedPlayersThumbnails();
}, 2000);

// Create a utility function to format dates more nicely
function formatDate(date) {
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return new Date(date).toLocaleDateString('en-US', options);
}
// === CUSTOM KILL MESSAGE PHRASES ===
const KILL_PHRASES = [
  "**{killer}** erased **{victim}** from existence with **{weapon}**{distance}.",
  "**{killer}** sent **{victim}** back to the lobby with **{weapon}**{distance}.",
  "**{killer}** made **{victim}** regret spawning with **{weapon}**{distance}.",
  "**{killer}** turned **{victim}** into a memory with **{weapon}**{distance}.",
  "**{victim}** couldn't handle **{killer}**'s smoke from **{weapon}**{distance}.",
  "**{killer}** clapped **{victim}** out of the game with **{weapon}**{distance}.",
  "**{victim}** caught these hands from **{killer}** via **{weapon}**{distance}.",
  "**{killer}** gave **{victim}** a one-way ticket to respawn with **{weapon}**{distance}.",
  "**{killer}** ruined **{victim}**'s whole career with **{weapon}**{distance}.",
  "**{victim}** got humbled by **{killer}** using **{weapon}**{distance}.",
  "**{killer}** said goodnight to **{victim}** with **{weapon}**{distance}.",
  "**{killer}** packed up **{victim}**'s dreams using **{weapon}**{distance}.",
  "**{killer}** folded **{victim}** like a lawn chair with **{weapon}**{distance}.",
  "**{victim}** got processed by **{killer}** via **{weapon}**{distance}.",
  "**{killer}** made **{victim}** vanish using **{weapon}**{distance}.",
  "**{killer}** slapped **{victim}** into next week with **{weapon}**{distance}.",
  "**{victim}** thought they had a chance against **{killer}**'s **{weapon}**{distance}.",
  "**{killer}** dropped **{victim}** like bad loot using **{weapon}**{distance}.",
  "**{killer}** treated **{victim}** like target practice with **{weapon}**{distance}.",
  "**{killer}** gave **{victim}** a free trip to spectate via **{weapon}**{distance}.",
  "**{victim}** got cooked by **{killer}** with **{weapon}**{distance}.",
  "**{victim}** didn't survive **{killer}**'s smoke test from **{weapon}**{distance}.",
  "**{killer}** ran circles around **{victim}** with **{weapon}**{distance}.",
  "**{killer}** checked **{victim}** straight off the server with **{weapon}**{distance}.",
  "**{killer}** showed **{victim}** the true meaning of pain using **{weapon}**{distance}."
];

// === CUSTOM LONGSHOT MESSAGE PHRASES ===
const LONGSHOT_PHRASES = [
  "**{killer}** hit **{victim}** so hard from across the map with **{weapon}** ({distance}m), they had time to think about life choices.",
  "**{victim}** got sniped by **{killer}** with **{weapon}** ({distance}m) before they even heard the shot.",
  "**{killer}** introduced **{victim}** to a bullet from **{weapon}**... from downtown ({distance}m).",
  "**{victim}** got deleted by **{killer}** from a postal code away with **{weapon}** ({distance}m).",
  "**{killer}** sent a care package straight to **{victim}**'s forehead with **{weapon}** ({distance}m).",
  "**{victim}** had no idea **{killer}** was already writing their obituary with **{weapon}** ({distance}m).",
  "**{killer}** said 'hold my beer' and hit **{victim}** from orbit with **{weapon}** ({distance}m).",
  "**{victim}** just learned what it feels like to lose a 1v1 they didn't know they were in against **{killer}**'s **{weapon}** ({distance}m).",
  "**{killer}** lined up the shot with **{weapon}**, said a prayer, and ended **{victim}**'s journey from ({distance}m).",
  "**{victim}** should've zigged when they zagged — **{killer}** was waiting with **{weapon}** ({distance}m)."
];

// === CUSTOM SUICIDE MESSAGE PHRASES ===
const SUICIDE_PHRASES = [
  "**{victim}** couldn't handle the pressure.",
  "**{victim}** folded like a lawn chair.",
  "**{victim}** disappeared without a trace.",
  "**{victim}** tapped out early.",
  "**{victim}** lagged out of existence.",
  "**{victim}** ran out of luck.",
  "**{victim}** hit the wrong key.",
  "**{victim}** just gave up, really.",
  "**{victim}** was here... briefly.",
  "**{victim}** didn't stand a chance.",
  "**{victim}** logged off emotionally first.",
  "**{victim}** rage quit without the quit.",
  "**{victim}** blinked and missed it.",
  "**{victim}** entered spectator mode.",
  "**{victim}** took an unexpected L.",
  "**{victim}** learned the hard way.",
  "**{victim}** caught a permanent timeout.",
  "**{victim}** met their match — badly.",
  "**{victim}** fumbled the bag.",
  "**{victim}** packed it up early.",
  "**{victim}** unplugged themselves.",
  "**{victim}** left the chat.",
  "**{victim}** went AFK forever.",
  "**{victim}** checked out of the lobby.",
  "**{victim}** ran out of options.",
  "**{victim}** hit send on the wrong move.",
  "**{victim}** made one mistake too many.",
  "**{victim}** folded under pressure.",
  "**{victim}** clocked out.",
  "**{victim}** slipped through the cracks.",
  "**{victim}** went down bad.",
  "**{victim}** had one job.",
  "**{victim}** took the shortcut out.",
  "**{victim}** lost the plot.",
  "**{victim}** misread the assignment.",
  "**{victim}** found the exit early.",
  "**{victim}** went out sad.",
  "**{victim}** got left behind.",
  "**{victim}** retired mid-match.",
  "**{victim}** lost track of reality.",
  "**{victim}** hit the brakes too late.",
  "**{victim}** signed off.",
  "**{victim}** was their own downfall.",
  "**{victim}** ran headfirst into defeat.",
  "**{victim}** embraced the void.",
  "**{victim}** forgot the basics.",
  "**{victim}** got benched by life.",
  "**{victim}** got speedran by reality.",
  "**{victim}** dropped the ball.",
  "**{victim}** faced reality — and lost."
];

// === KILLSTREAK MILESTONES ===
const KILLSTREAK_MILESTONES = [
  { count: 3, message: "is on a killing spree!" },
  { count: 5, message: "is on a rampage!" },
  { count: 7, message: "is dominating!" },
  { count: 10, message: "is unstoppable!" },
  { count: 15, message: "is godlike!" },
  { count: 20, message: "is legendary!" },
  { count: 25, message: "is on a massacre!" },
  { count: 30, message: "has gone nuclear!" }
];

// === WEAPON EMOJIS AND ICONS ===
const weaponEmojis = {
  // Knives
  "Improvised Knife": "🔪",
  "Folding Knife": "🔪",
  "Combat Knife": "🔪",

  // Axes
  "Improvised Axe": "🪓",
  "Woodcutter's Axe": "🪓",
  "Fire Axe": "🪓",

  // Pistols
  "IZH-70": "🔫",
  "TTk": "🔫",
  "F-57": "🔫",
  "C1911": "🔫",
  "berta_m9": "🔫",

  // Shotguns
  "Sawed-Off Shotgun": "💥",
  "IZH-43": "💥",
  "M133": "💥",
  "MS590": "💥",

  // SMGs / Rifles / ARs
  "N4": "🔫",
  "Scorp": "🔫",
  "BB-19": "🔫",
  "UMR45": "🔫",
  "MR5": "🔫",
  "P900": "🔫",
  "pp-3000": "🔫",
  "AK-SU": "🔫",
  "AK-SMG": "🔫",
  "Grom": "🔫",
  "AK-modern": "🔫",
  "Fasam": "🔫",
  "Skar": "🔫",
  "UAG": "🔫",
  "AR4": "🔫",
  "AR4-M": "🔫",
  "RPK-mod": "🔫",
  "MG-36": "🔫",
  "NK417": "🔫",

  // Snipers
  "S85": "🎯",
  "Mosin-K": "🎯",
  "Mosin": "🎯",
  "VSD": "🎯",
  "M99": "🎯",

  // Explosives
  "GRM-40": "💣",
  "Tripwire F-10": "🧨",
  "Tripwire R-5": "🧨",
  "Stronger Explosive Charge": "💣",
  "Explosive Charge": "💣",
  "Dynamite": "🧨",
  "F-10": "🧨",
  "R-5": "🧨",

  // Land Vehicles
  "land_vehicle": "🚗"
};

// Weapon icon URLs for embed thumbnails
const weaponIconURLs = {
  // Default weapon categories
  "default": "https://i.imgur.com/6guD1s3.png",
  "knife": "https://i.imgur.com/6guD1s3.png",
  "axe": "https://i.imgur.com/6guD1s3.png",
  "pistol": "https://i.imgur.com/6guD1s3.png",
  "shotgun": "https://i.imgur.com/6guD1s3.png",
  "smg": "https://i.imgur.com/6guD1s3.png",
  "rifle": "https://i.imgur.com/6guD1s3.png",
  "sniper": "https://i.imgur.com/6guD1s3.png",
  "explosive": "https://i.imgur.com/6guD1s3.png",
  "vehicle": "https://i.imgur.com/6guD1s3.png"
};

// Get weapon icon URL based on weapon name
function getWeaponIconURL(weapon) {
  const weaponLower = weapon.toLowerCase();
  
  if (weaponLower.includes('knife')) return weaponIconURLs.knife;
  if (weaponLower.includes('axe')) return weaponIconURLs.axe;
  if (['izh-70', 'ttk', 'f-57', 'c1911', 'berta_m9'].includes(weaponLower)) return weaponIconURLs.pistol;
  if (weaponLower.includes('shotgun') || ['izh-43', 'm133', 'ms590'].includes(weaponLower)) return weaponIconURLs.shotgun;
  if (['n4', 'scorp', 'bb-19', 'umr45', 'pp-3000'].includes(weaponLower)) return weaponIconURLs.smg;
  if (weaponLower.includes('ak') || ['grom', 'fasam', 'skar', 'uag', 'ar4', 'ar4-m', 'rpk', 'mg-36', 'nk417'].includes(weaponLower)) return weaponIconURLs.rifle;
  if (['s85', 'mosin', 'mosin-k', 'vsd', 'm99'].includes(weaponLower)) return weaponIconURLs.sniper;
  if (weaponLower.includes('explosive') || weaponLower.includes('charge') || weaponLower.includes('tripwire') || weaponLower.includes('dynamite') || ['grm-40', 'f-10', 'r-5'].includes(weaponLower)) return weaponIconURLs.explosive;
  if (weaponLower.includes('vehicle')) return weaponIconURLs.vehicle;
  
  return weaponIconURLs.default;
}

// Get the next kill phrase with rotation
function getNextKillPhrase() {
  const phrase = KILL_PHRASES[messageIndexes.killPhraseIndex];
  messageIndexes.killPhraseIndex = (messageIndexes.killPhraseIndex + 1) % KILL_PHRASES.length;
  saveMessageIndexes(messageIndexes);
  return phrase;
}

// Get the next longshot phrase with rotation
function getNextLongshotPhrase() {
  const phrase = LONGSHOT_PHRASES[messageIndexes.longshotPhraseIndex];
  messageIndexes.longshotPhraseIndex = (messageIndexes.longshotPhraseIndex + 1) % LONGSHOT_PHRASES.length;
  saveMessageIndexes(messageIndexes);
  return phrase;
}

// Get the next suicide phrase with rotation
function getNextSuicidePhrase() {
  const phrase = SUICIDE_PHRASES[messageIndexes.suicidePhraseIndex];
  messageIndexes.suicidePhraseIndex = (messageIndexes.suicidePhraseIndex + 1) % SUICIDE_PHRASES.length;
  saveMessageIndexes(messageIndexes);
  return phrase;
}
// === DATA MANAGEMENT FUNCTIONS ===

// Load seen lines from file
function loadSeenLines() {
  try {
    const data = fs.readFileSync(MEMORY_FILE);
    return new Set(JSON.parse(data));
  } catch {
    console.log('ℹ️ No memory file found. Starting fresh.');
    return new Set();
  }
}

// Save seen lines to file
function saveSeenLines(seenLines) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify([...seenLines]));
    console.log('✅ Saved seen lines.');
  } catch (err) {
    console.error('❌ Failed to save seen lines:', err.message);
  }
}

// Legacy leaderboard functions - keeping for backward compatibility
function loadLeaderboards() {
  try {
    const data = fs.readFileSync(LEADERBOARD_FILE);
    return JSON.parse(data);
  } catch {
    console.log('ℹ️ No leaderboard file found. Starting fresh.');
    return {};
  }
}

function saveLeaderboards(leaderboard) {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard));
    console.log('✅ Saved leaderboards.');
  } catch (err) {
    console.error('❌ Failed to save leaderboards:', err.message);
  }
}

// Message indexes tracking for phrase rotation
function loadMessageIndexes() {
  try {
    const data = fs.readFileSync(MESSAGE_INDEXES_FILE);
    return JSON.parse(data);
  } catch {
    console.log('ℹ️ No message indexes file found. Starting fresh.');
    return {
      killPhraseIndex: 0,
      longshotPhraseIndex: 0,
      suicidePhraseIndex: 0
    };
  }
}

function saveMessageIndexes(indexes) {
  try {
    fs.writeFileSync(MESSAGE_INDEXES_FILE, JSON.stringify(indexes));
  } catch (err) {
    console.error('❌ Failed to save message indexes:', err.message);
  }
}

// Player stats management
function loadPlayerStats() {
  try {
    const data = fs.readFileSync(STATS_FILE);
    return JSON.parse(data);
  } catch {
    console.log('ℹ️ No player stats file found. Starting fresh.');
    return {
      all_time: {},
      daily: {},
      weekly: {},
      monthly: {}
    };
  }
}

function savePlayerStats(stats) {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
    console.log('✅ Saved player stats.');
  } catch (err) {
    console.error('❌ Failed to save player stats:', err.message);
  }
}

// Longshots tracking
function loadLongshots() {
  try {
    const data = fs.readFileSync(LONGSHOTS_FILE);
    return JSON.parse(data);
  } catch {
    console.log('ℹ️ No longshots file found. Starting fresh.');
    return {
      all_time: [],
      daily: {},
      weekly: {},
      monthly: {}
    };
  }
}

function saveLongshots(longshots) {
  try {
    fs.writeFileSync(LONGSHOTS_FILE, JSON.stringify(longshots));
    console.log('✅ Saved longshots.');
  } catch (err) {
    console.error('❌ Failed to save longshots:', err.message);
  }
}

// Killstreaks tracking
function loadKillstreaks() {
  try {
    const data = fs.readFileSync(KILLSTREAKS_FILE);
    const loadedStreaks = JSON.parse(data);
    console.log('✅ Loaded killstreaks from file.');
    return loadedStreaks;
  } catch (err) {
    console.log('ℹ️ No killstreaks file found or error reading. Starting fresh.');
    return {};
  }
}

function saveKillstreaks(killstreaks) {
  try {
    fs.writeFileSync(KILLSTREAKS_FILE, JSON.stringify(killstreaks));
    console.log('✅ Saved killstreaks to file.');
  } catch (err) {
    console.error('❌ Failed to save killstreaks:', err.message);
  }
}

// === TIME PERIOD HELPERS ===
function getTimeIdentifiers() {
  const now = new Date();
  
  // YYYY-MM-DD format for daily
  const daily = now.toISOString().split('T')[0];
  
  // YYYY-MM format for monthly
  const monthly = daily.substring(0, 7);
  
  // YYYY-Wxx format for ISO week
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const pastDaysOfYear = (now - startOfYear) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  const weekly = `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  
  return { daily, weekly, monthly };
}
// Add this before updatePlayerStats function
function ensurePlayerRecord(periodData, playerName, serverName) {
  if (!periodData[playerName]) {
    periodData[playerName] = { 
      kills: 0, 
      deaths: 0,
      envDeaths: 0, // New property to track environmental deaths
      kd: 0,
      servers: {}
    };
  }
  
  // Add server tracking
  if (serverName && !periodData[playerName].servers[serverName]) {
    periodData[playerName].servers[serverName] = {
      kills: 0,
      deaths: 0,
      envDeaths: 0 // New property for server-specific environmental deaths
    };
  }
}
function updateKDRatio(player) {
  const { daily, weekly, monthly } = getTimeIdentifiers();
  
  // Helper function to update KD in a specific period
  function updateKDForPeriod(periodData) {
    if (periodData && periodData[player]) {
      const stats = periodData[player];
      // Only use player-caused deaths for K/D (not envDeaths)
      stats.kd = stats.deaths === 0 ? stats.kills : parseFloat((stats.kills / stats.deaths).toFixed(2));
    }
  }
  
  // Update KD in all periods
  updateKDForPeriod(playerStats.all_time);
  updateKDForPeriod(playerStats.daily[daily]);
  updateKDForPeriod(playerStats.weekly[weekly]);
  updateKDForPeriod(playerStats.monthly[monthly]);
}
// === PLAYER STATS TRACKING ===
function updatePlayerStats(killer, victim, distance, cause, timestamp, serverName) {
  const { daily, weekly, monthly } = getTimeIdentifiers();
  
  // Initialize data structures if needed
  if (!playerStats.all_time) playerStats.all_time = {};
  if (!playerStats.daily) playerStats.daily = {};
  if (!playerStats.weekly) playerStats.weekly = {};
  if (!playerStats.monthly) playerStats.monthly = {};
  
  if (!playerStats.daily[daily]) playerStats.daily[daily] = {};
  if (!playerStats.weekly[weekly]) playerStats.weekly[weekly] = {};
  if (!playerStats.monthly[monthly]) playerStats.monthly[monthly] = {};
  
  // Check if this is an environmental death (suicide, falling, etc.)
  const causeLower = cause.toLowerCase();
  const isEnvironmentalDeath = killer === victim || 
                              causeLower.includes('suicide') || 
                              causeLower.includes('falling') || 
                              causeLower.includes('relocation');
  
  // Update kill stats (if not environmental death)
  if (!isEnvironmentalDeath) {
    // All time
    ensurePlayerRecord(playerStats.all_time, killer, serverName);
    playerStats.all_time[killer].kills++;
    if (serverName) {
      playerStats.all_time[killer].servers[serverName].kills++;
    }
    
    // Daily
    ensurePlayerRecord(playerStats.daily[daily], killer, serverName);
    playerStats.daily[daily][killer].kills++;
    if (serverName) {
      playerStats.daily[daily][killer].servers[serverName].kills++;
    }
    
    // Weekly
    ensurePlayerRecord(playerStats.weekly[weekly], killer, serverName);
    playerStats.weekly[weekly][killer].kills++;
    if (serverName) {
      playerStats.weekly[weekly][killer].servers[serverName].kills++;
    }
    
    // Monthly
    ensurePlayerRecord(playerStats.monthly[monthly], killer, serverName);
    playerStats.monthly[monthly][killer].kills++;
    if (serverName) {
      playerStats.monthly[monthly][killer].servers[serverName].kills++;
    }
  }
  
  // Update death stats for victim
  ensurePlayerRecord(playerStats.all_time, victim, serverName);
  ensurePlayerRecord(playerStats.daily[daily], victim, serverName);
  ensurePlayerRecord(playerStats.weekly[weekly], victim, serverName);
  ensurePlayerRecord(playerStats.monthly[monthly], victim, serverName);
  
  if (isEnvironmentalDeath) {
    // Record as environmental death (all periods)
    playerStats.all_time[victim].envDeaths++;
    playerStats.daily[daily][victim].envDeaths++;
    playerStats.weekly[weekly][victim].envDeaths++;
    playerStats.monthly[monthly][victim].envDeaths++;
    
    // Server specific
    if (serverName) {
      playerStats.all_time[victim].servers[serverName].envDeaths++;
      playerStats.daily[daily][victim].servers[serverName].envDeaths++;
      playerStats.weekly[weekly][victim].servers[serverName].envDeaths++;
      playerStats.monthly[monthly][victim].servers[serverName].envDeaths++;
    }
  } else {
    // Record as player-caused death (all periods)
    playerStats.all_time[victim].deaths++;
    playerStats.daily[daily][victim].deaths++;
    playerStats.weekly[weekly][victim].deaths++;
    playerStats.monthly[monthly][victim].deaths++;
    
    // Server specific
    if (serverName) {
      playerStats.all_time[victim].servers[serverName].deaths++;
      playerStats.daily[daily][victim].servers[serverName].deaths++;
      playerStats.weekly[weekly][victim].servers[serverName].deaths++;
      playerStats.monthly[monthly][victim].servers[serverName].deaths++;
    }
  }
  
  // Calculate K/D ratios
  updateKDRatio(killer);
  updateKDRatio(victim);
  
  // Track longshot if applicable (over 200m)
  if (parseInt(distance) >= 200 && !isEnvironmentalDeath) {
    trackLongshot(killer, victim, parseInt(distance), cause, timestamp, serverName);
  }
}
// === LONGSHOTS TRACKING ===
function trackLongshot(killer, victim, distance, weapon, timestamp, serverName) {
  const { daily, weekly, monthly } = getTimeIdentifiers();
  
  // Initialize longshots structure if needed
  if (!longshots.all_time) longshots.all_time = [];
  if (!longshots.daily) longshots.daily = {};
  if (!longshots.weekly) longshots.weekly = {};
  if (!longshots.monthly) longshots.monthly = {};
  
  if (!longshots.daily[daily]) longshots.daily[daily] = [];
  if (!longshots.weekly[weekly]) longshots.weekly[weekly] = [];
  if (!longshots.monthly[monthly]) longshots.monthly[monthly] = [];
  
  const longshotEntry = {
    killer,
    victim,
    distance,
    weapon,
    timestamp: timestamp || new Date().toISOString(),
    serverName
  };
  
  // Add to all time longshots
  longshots.all_time.push(longshotEntry);
  
  // Add to daily longshots
  longshots.daily[daily].push(longshotEntry);
  
  // Add to weekly longshots
  longshots.weekly[weekly].push(longshotEntry);
  
  // Add to monthly longshots
  longshots.monthly[monthly].push(longshotEntry);
  
  // Sort all longshot arrays by distance (descending)
  longshots.all_time.sort((a, b) => b.distance - a.distance);
  longshots.daily[daily].sort((a, b) => b.distance - a.distance);
  longshots.weekly[weekly].sort((a, b) => b.distance - a.distance);
  longshots.monthly[monthly].sort((a, b) => b.distance - a.distance);
  
  // Keep only top 100 longshots for memory efficiency
  const MAX_LONGSHOTS = 100;
  if (longshots.all_time.length > MAX_LONGSHOTS) longshots.all_time.length = MAX_LONGSHOTS;
  if (longshots.daily[daily].length > MAX_LONGSHOTS) longshots.daily[daily].length = MAX_LONGSHOTS;
  if (longshots.weekly[weekly].length > MAX_LONGSHOTS) longshots.weekly[weekly].length = MAX_LONGSHOTS;
  if (longshots.monthly[monthly].length > MAX_LONGSHOTS) longshots.monthly[monthly].length = MAX_LONGSHOTS;
}

// === KILLSTREAK TRACKING ===
function updateKillstreak(killer, victim, serverName, config) {
  // Initialize player in killstreaks object if not present
  if (!activeKillstreaks[killer]) {
    activeKillstreaks[killer] = {
      count: 0,
      bestStreak: 0, // Add a best streak tracker
      lastKill: new Date().toISOString(),
      servers: {}
    };
  }
  
  // Initialize server-specific tracking
  if (serverName && !activeKillstreaks[killer].servers[serverName]) {
    activeKillstreaks[killer].servers[serverName] = {
      count: 0,
      bestStreak: 0, // Add a best streak tracker for server
      lastKill: new Date().toISOString()
    };
  }
  
  // Reset killstreak if player was killed
  if (activeKillstreaks[victim]) {
    // Check if victim had a significant killstreak before dying (3 or more)
    const victimStreak = activeKillstreaks[victim].count;
    
    if (victimStreak >= 3) {
      // Get highlight info for the victim
      const victimHighlight = getPlayerHighlight(victim);
      
      const endStreakEmbed = {
        title: "⚡ Killstreak Ended!",
        color: parseInt("DD3333", 16), // Red color for ended streaks
        description: `**${killer}** ended **${victim}'s** killstreak of **${victimStreak}**!`,
        // Use custom thumbnail if available
        thumbnail: { 
          url: victimHighlight && victimHighlight.thumbnailUrl ? 
            victimHighlight.thumbnailUrl : 
            "https://i.imgur.com/6guD1s3.png" 
        },
        footer: { 
          text: serverName || "Deadside", 
          icon_url: config.iconUrl || "https://i.imgur.com/6guD1s3.png" 
        },
        timestamp: new Date().toISOString()
      };
      
      sendEmbedToDiscord(config.killWebhook, endStreakEmbed);
    }
    
    // Reset victim's killstreak
    activeKillstreaks[victim].count = 0;
    
    // Reset server-specific streak
    if (serverName && activeKillstreaks[victim].servers[serverName]) {
      activeKillstreaks[victim].servers[serverName].count = 0;
    }
  }
  
  // Increment killer's streak
  activeKillstreaks[killer].count++;
  activeKillstreaks[killer].lastKill = new Date().toISOString();
  
  // Update best streak if current streak is higher
  if (activeKillstreaks[killer].count > activeKillstreaks[killer].bestStreak) {
    activeKillstreaks[killer].bestStreak = activeKillstreaks[killer].count;
  }
  
  // Increment server-specific streak
  if (serverName) {
    activeKillstreaks[killer].servers[serverName].count++;
    activeKillstreaks[killer].servers[serverName].lastKill = new Date().toISOString();
    
    // Update server-specific best streak
    if (activeKillstreaks[killer].servers[serverName].count > 
        activeKillstreaks[killer].servers[serverName].bestStreak) {
      activeKillstreaks[killer].servers[serverName].bestStreak = 
        activeKillstreaks[killer].servers[serverName].count;
    }
  }
  
  // Save killstreaks immediately to ensure persistence across restarts
  saveKillstreaks(activeKillstreaks);
  
  // Check for killstreak milestone
  return checkKillstreakMilestone(killer, serverName);
}

function checkKillstreakMilestone(player, serverName) {
  const streak = activeKillstreaks[player].count;
  
  // Find the highest milestone reached
  for (let i = KILLSTREAK_MILESTONES.length - 1; i >= 0; i--) {
    const milestone = KILLSTREAK_MILESTONES[i];
    
    // If the streak exactly matches a milestone, announce it
    if (streak === milestone.count) {
      return {
        reached: true,
        player,
        count: streak,
        message: milestone.message,
        serverName
      };
    }
  }
  
  return { reached: false };
}

function cleanupKillstreaks() {
  // Killstreaks now only reset when players die - no automatic cleanup
  console.log('ℹ️ Killstreak cleanup called - killstreaks only reset on death');
  // Just save the current state to ensure persistence
  saveKillstreaks(activeKillstreaks);
}

function logActiveKillstreaks() {
  const activeStreaks = Object.entries(activeKillstreaks)
    .filter(([player, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count);
  
  if (activeStreaks.length > 0) {
    console.log('⚡ Active killstreaks:');
    activeStreaks.forEach(([player, data]) => {
      console.log(`   ${player}: ${data.count} kills (Best: ${data.bestStreak})`);
    });
  } else {
    console.log('ℹ️ No significant active killstreaks.');
  }
}
// === LEADERBOARD GENERATION ===
// Enhanced to use rich embeds instead of plain text

// Format a player's K/D ratio with color coding based on performance
function formatKDRatio(kd) {
  let kdStr = kd.toFixed(2);
  
  // Add colored emoji based on K/D ratio
  if (kd >= 3.0) return `🟢 ${kdStr}`; // Excellent: green circle
  if (kd >= 2.0) return `🟦 ${kdStr}`; // Good: blue square
  if (kd >= 1.0) return `⬜ ${kdStr}`; // Average: white square
  return `🟥 ${kdStr}`; // Below average: red square
}

// Generate a formatted progress bar based on value
function generateProgressBar(value, maxValue, length = 10) {
  const filledBlocks = Math.round((value / maxValue) * length);
  const emptyBlocks = length - filledBlocks;
  
  // Using square emoji blocks for a nicer visual
  return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

// Generate a rich embed for leaderboards
// Generate a rich embed for leaderboards
function generateLeaderboardEmbed(data, title, period, limit = 10, serverName = null, config) {
  // Convert object to array of player stats
  const players = Object.entries(data).map(([name, stats]) => ({
    name,
    ...stats
  }));
  
  // Filter by server if specified
  let filteredPlayers = players;
  if (serverName) {
    filteredPlayers = players.filter(player => 
      player.servers && 
      player.servers[serverName] &&
      (player.servers[serverName].kills > 0 || player.servers[serverName].deaths > 0)
    );
  }
  
  // Sort by kills (descending)
  filteredPlayers.sort((a, b) => b.kills - a.kills);
  
  // Take top N players
  const topPlayers = filteredPlayers.slice(0, limit);
  
  // Generate embed
  const embed = {
    title: `${title} - ${serverName || 'All Servers'}`,
    color: parseInt(config.color.replace('#', ''), 16),
    description: `Top performers for ${period}`,
    thumbnail: { 
      url: config.iconUrl || "https://i.imgur.com/6guD1s3.png" 
    },
    fields: [],
    footer: { 
      text: `Updated: ${formatDate(new Date())}`, 
      icon_url: config.iconUrl || "https://i.imgur.com/6guD1s3.png"
    },
    timestamp: new Date().toISOString()
  };
  
  if (topPlayers.length === 0) {
    embed.description = "No data available for this time period.";
    return embed;
  }
  
  // Find the maximum kills for bar scaling
  const maxKills = Math.max(...topPlayers.map(p => p.kills));
  
  // Add fields for each top player
  topPlayers.forEach((player, index) => {
    const progressBar = generateProgressBar(player.kills, maxKills);
    const playerDeaths = player.deaths || 0;  // Player-caused deaths
    const envDeaths = player.envDeaths || 0;  // Environmental deaths
    const kdRatio = formatKDRatio(player.kd);
    
    // Check if this is a highlighted player
    const playerHighlight = getPlayerHighlight(player.name);
    
    // Format the player name in the field name
    const playerHeader = playerHighlight ? 
      `${index + 1}. ${playerHighlight.prefix}${player.name} ${playerHighlight.emoji}` : 
      `${index + 1}. ${player.name}`;
    
    embed.fields.push({
      name: playerHeader,
      value: `Kills: **${player.kills}** ${progressBar}\nPlayer Deaths: **${playerDeaths}** | Env Deaths: **${envDeaths}**\nK/D: **${kdRatio}**`,
      inline: true
    });
    
    // Add a blank field every 2 players for better formatting
    if (index % 2 === 1 && index < topPlayers.length - 1) {
      embed.fields.push({ name: '\u200B', value: '\u200B', inline: true });
    }
  });
  
  // Add top 5 killstreaks section
  embed.fields.push({ name: '\u200B', value: '**Top 5 Active Killstreaks**', inline: false });
  
  // Get active killstreaks
  const activeStreaks = Object.entries(activeKillstreaks)
    .map(([player, data]) => ({ 
      player, 
      streak: data.count,
      bestStreak: data.bestStreak || 0
    }))
    .filter(streak => streak.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 5);

  if (activeStreaks.length > 0) {
    const streaksText = activeStreaks
      .map((streak, index) => {
        // Check if this player is highlighted
        const playerHighlight = getPlayerHighlight(streak.player);
        
        // Format the player name with highlight if applicable
        const playerDisplay = playerHighlight ?
          `${playerHighlight.prefix}**${streak.player}** ${playerHighlight.emoji}` :
          `**${streak.player}**`;
          
        return `${index + 1}. ${playerDisplay}: ${streak.streak} kills (Best: ${streak.bestStreak})`;
      })
      .join('\n');

    embed.fields.push({
      name: '\u200B',
      value: streaksText,
      inline: false
    });
  }
  
  return embed;
}

// Generate rich embed for longshots leaderboard
function generateLongshotsEmbed(longshotsArray, title, period, limit = 5, serverName = null, config) {
  // Filter by server if specified
  let filteredLongshots = longshotsArray;
  if (serverName) {
    filteredLongshots = longshotsArray.filter(shot => !serverName || shot.serverName === serverName);
  }
  
  // Take top N longshots
  const topShots = filteredLongshots.slice(0, limit);
  
  // Generate embed
  const embed = {
    title: `${title} - ${serverName || 'All Servers'}`,
    color: parseInt("AA33AA", 16), // Purple color for longshots
    description: `Top longshots for ${period}`,
    thumbnail: { 
      url: config.iconUrl || "https://i.imgur.com/6guD1s3.png" 
    },
    fields: [],
    footer: { 
      text: `Updated: ${formatDate(new Date())}`, 
      icon_url: config.iconUrl || "https://i.imgur.com/6guD1s3.png"
    },
    timestamp: new Date().toISOString()
  };
  
  if (topShots.length === 0) {
    embed.description = "No longshots recorded yet for this time period.";
    return embed;
  }
  
  // Add fields for each longshot
  topShots.forEach((shot, index) => {
    // Find the max distance for all shots for scaling
    const maxDistance = topShots[0].distance;
    const progressBar = generateProgressBar(shot.distance, maxDistance);
    
    embed.fields.push({
      name: `${index + 1}. ${shot.killer} → ${shot.victim}`,
      value: `**${shot.distance}m** ${progressBar}\nWeapon: **${shot.weapon}**\nDate: ${formatDate(new Date(shot.timestamp))}`,
      inline: false
    });
  });
  
  return embed;
}

// Send leaderboards to Discord
async function sendLeaderboards() {
  const { daily, weekly, monthly } = getTimeIdentifiers();
  
  console.log('🏆 Generating and sending leaderboards...');
  
  for (const config of serverConfigs) {
    try {
      // Daily leaderboard
      if (playerStats.daily[daily]) {
        const dailyLeaderboardEmbed = generateLeaderboardEmbed(
          playerStats.daily[daily],
          "Daily Leaderboard",
          "Today",
          10,
          config.serverName,
          config
        );
        await sendEmbedToDiscord(config.dailyLeaderboardWebhook, dailyLeaderboardEmbed);
        console.log(`✅ Sent daily leaderboard for ${config.serverName}`);
        
        // Daily longshots
        if (longshots.daily[daily]) {
          const dailyLongshotsEmbed = generateLongshotsEmbed(
            longshots.daily[daily],
            "Daily Top Longshots",
            "Today",
            5,
            config.serverName,
            config
          );
          await sendEmbedToDiscord(config.longshotWebhook, dailyLongshotsEmbed);
          console.log(`✅ Sent daily longshots for ${config.serverName}`);
        }
      }
      
      // Weekly leaderboard
      if (playerStats.weekly[weekly]) {
        const weeklyLeaderboardEmbed = generateLeaderboardEmbed(
          playerStats.weekly[weekly],
          "Weekly Leaderboard",
          "This Week",
          10,
          config.serverName,
          config
        );
        await sendEmbedToDiscord(config.weeklyLeaderboardWebhook, weeklyLeaderboardEmbed);
        console.log(`✅ Sent weekly leaderboard for ${config.serverName}`);
        
        // Weekly longshots
        if (longshots.weekly[weekly]) {
          const weeklyLongshotsEmbed = generateLongshotsEmbed(
            longshots.weekly[weekly],
            "Weekly Top Longshots",
            "This Week",
            5,
            config.serverName,
            config
          );
          await sendEmbedToDiscord(config.longshotWebhook, weeklyLongshotsEmbed);
          console.log(`✅ Sent weekly longshots for ${config.serverName}`);
        }
      }
      
      // Monthly leaderboard
      if (playerStats.monthly[monthly]) {
        const monthlyLeaderboardEmbed = generateLeaderboardEmbed(
          playerStats.monthly[monthly],
          "Monthly Leaderboard",
          "This Month",
          10,
          config.serverName,
          config
        );
        await sendEmbedToDiscord(config.monthlyLeaderboardWebhook, monthlyLeaderboardEmbed);
        console.log(`✅ Sent monthly leaderboard for ${config.serverName}`);
        
        // Monthly longshots
        if (longshots.monthly[monthly]) {
          const monthlyLongshotsEmbed = generateLongshotsEmbed(
            longshots.monthly[monthly],
            "Monthly Top Longshots",
            "This Month",
            5,
            config.serverName,
            config
          );
          await sendEmbedToDiscord(config.longshotWebhook, monthlyLongshotsEmbed);
          console.log(`✅ Sent monthly longshots for ${config.serverName}`);
        }
      }
      
      // All-time leaderboard
      if (playerStats.all_time) {
        const allTimeLeaderboardEmbed = generateLeaderboardEmbed(
          playerStats.all_time,
          "All-Time Leaderboard",
          "All Time",
          10,
          config.serverName,
          config
        );
        await sendEmbedToDiscord(config.allTimeLeaderboardWebhook, allTimeLeaderboardEmbed);
        console.log(`✅ Sent all-time leaderboard for ${config.serverName}`);
        
        // All-time longshots
        if (longshots.all_time) {
          const allTimeLongshotsEmbed = generateLongshotsEmbed(
            longshots.all_time,
            "All-Time Top Longshots",
            "All Time",
            5,
            config.serverName,
            config
          );
          await sendEmbedToDiscord(config.longshotWebhook, allTimeLongshotsEmbed);
          console.log(`✅ Sent all-time longshots for ${config.serverName}`);
        }
      }
      
      // Small delay between servers to avoid rate limiting
      await new Promise(res => setTimeout(res, 1000));
      
    } catch (err) {
      console.error(`❌ Error sending leaderboards for ${config.serverName}:`, err.message);
    }
  }
}

// Generate a comprehensive stats embed for all players
async function sendAllPlayerStatsEmbed(config) {
  console.log(`🔍 Generating all player stats for ${config.serverName}...`);
  
  // Get all players from all-time stats that have stats for this specific server
  const allPlayers = Object.keys(playerStats.all_time);
  const players = allPlayers.filter(player => {
    const playerStat = playerStats.all_time[player]; // Changed variable name to avoid conflict
    return playerStat.servers && 
           playerStat.servers[config.serverName] && 
           (playerStat.servers[config.serverName].kills > 0 || 
            playerStat.servers[config.serverName].deaths > 0);
  });
  
  // Sort players by kills (descending) for this specific server
  players.sort((a, b) => {
    const aKills = playerStats.all_time[a].servers[config.serverName].kills || 0;
    const bKills = playerStats.all_time[b].servers[config.serverName].kills || 0;
    return bKills - aKills;
  });
  
  // Create embed base
  const embed = {
    title: `📊 Player Statistics - ${config.serverName}`,
    color: parseInt(config.color.replace('#', ''), 16),
    description: `Stats for all ${players.length} players on ${config.serverName}`,
    thumbnail: { 
      url: config.iconUrl || "https://i.imgur.com/6guD1s3.png" 
    },
    fields: [],
    footer: { 
      text: `Updated: ${formatDate(new Date())}`, 
      icon_url: config.iconUrl || "https://i.imgur.com/6guD1s3.png"
    },
    timestamp: new Date().toISOString()
  };
  
  // Find longest kill for each player (only for this server)
  const playerLongestKills = {};
  longshots.all_time.forEach(shot => {
    if (shot.serverName === config.serverName) {
      if (!playerLongestKills[shot.killer] || shot.distance > playerLongestKills[shot.killer]) {
        playerLongestKills[shot.killer] = shot.distance;
      }
    }
  });
  
  // Find highest killstreak for each player (only for this server)
  const playerHighestStreaks = {};
  for (const player in activeKillstreaks) {
    if (activeKillstreaks[player].servers && 
        activeKillstreaks[player].servers[config.serverName]) {
      playerHighestStreaks[player] = activeKillstreaks[player].servers[config.serverName].count || 0;
    }
  }
  
  // Process in batches (Discord has a limit of 25 fields per embed)
  const PLAYERS_PER_EMBED = 20;
  const embeds = [];
  
  for (let i = 0; i < players.length; i += PLAYERS_PER_EMBED) {
    const batchPlayers = players.slice(i, i + PLAYERS_PER_EMBED);
    
    // Clone the base embed for this batch
    const batchEmbed = JSON.parse(JSON.stringify(embed));
    
    if (i > 0) {
      batchEmbed.title = `📊 Player Statistics - ${config.serverName} (Page ${Math.floor(i/PLAYERS_PER_EMBED) + 1})`;
    }
    
    // Add player fields to this batch
    // In the player fields section of sendAllPlayerStatsEmbed
// Update this part in the player stats display
batchPlayers.forEach(player => {
  const allStats = playerStats.all_time[player];
  // Get server-specific stats
  const serverStats = allStats.servers[config.serverName];
  
  const kills = serverStats.kills || 0;
  const playerDeaths = serverStats.deaths || 0; // Only player-caused deaths
  const envDeaths = serverStats.envDeaths || 0; // Environmental deaths
  const kd = playerDeaths === 0 ? kills : parseFloat((kills / playerDeaths).toFixed(2)); // K/D only uses player deaths
  
  const longestKill = playerLongestKills[player] ? `${playerLongestKills[player]}m` : 'N/A';
  
  // Get best streak instead of current streak
  const highestStreak = (activeKillstreaks[player] && 
                         activeKillstreaks[player].servers && 
                         activeKillstreaks[player].servers[config.serverName]) 
    ? activeKillstreaks[player].servers[config.serverName].bestStreak 
    : 0;
  
  batchEmbed.fields.push({
    name: player,
    value: `Kills: **${kills}** | Player Deaths: **${playerDeaths}** | Env Deaths: **${envDeaths}**\nK/D: **${kd.toFixed(2)}** | Longest Kill: **${longestKill}** | Best Streak: **${highestStreak}**`,
    inline: false
  });
});
    
    embeds.push(batchEmbed);
  }
  
  // Send all embeds
  for (const embedToSend of embeds) {
    await sendEmbedToDiscord(config.allPlayersStatsWebhook, embedToSend);
    // Small delay to avoid rate limiting
    await new Promise(res => setTimeout(res, 1000));
  }
  
  console.log(`✅ Sent all player stats for ${config.serverName}`);
}

// === DISCORD RATE LIMIT HANDLING ===
// Process queued Discord messages with respect to rate limits
async function processDiscordQueue() {
  if (RATE_LIMITS.queue.length === 0) {
    RATE_LIMITS.processing = false;
    return;
  }
  
  RATE_LIMITS.processing = true;
  
  // Sort the queue by time (oldest first)
  RATE_LIMITS.queue.sort((a, b) => a.time - b.time);
  
  const now = Date.now();
  const nextMessage = RATE_LIMITS.queue[0];
  
  // Check if this webhook is currently rate limited
  if (RATE_LIMITS.webhooks[nextMessage.webhookUrl] && RATE_LIMITS.webhooks[nextMessage.webhookUrl] > now) {
    // Calculate wait time
    const waitTime = RATE_LIMITS.webhooks[nextMessage.webhookUrl] - now;
    console.log(`⏳ Waiting ${waitTime}ms for rate limit to expire for webhook`);
    
    // Wait for the rate limit to expire and try again
    setTimeout(processDiscordQueue, waitTime + 100); // Add 100ms buffer
    return;
  }
  
  // Remove from queue
  RATE_LIMITS.queue.shift();
  
  try {
    // Try to send the message
    if (nextMessage.isEmbed) {
      // Check for image in embed when processing queue
      if (nextMessage.embed.image && nextMessage.embed.image.url) {
        console.log(`Queue: Processing embed with image URL: ${nextMessage.embed.image.url}`);
      } else {
        console.log(`Queue: Embed does NOT contain an image URL`);
      }
      
      const response = await axios.post(nextMessage.webhookUrl, { embeds: [nextMessage.embed] });
      console.log(`✅ Sent queued embed to Discord. Status: ${response.status}`);
    } else {
      await axios.post(nextMessage.webhookUrl, { content: nextMessage.message });
      console.log(`✅ Sent queued text message to Discord`);
    }
  } catch (err) {
    console.error(`❌ Queue error:`, err.message);
    if (err.response && err.response.status === 429) {
      const retryAfter = err.response.data.retry_after || 1;
      console.log(`⚠️ Rate limited again for webhook, retry after ${retryAfter}s`);
      
      // Update rate limit timing
      RATE_LIMITS.webhooks[nextMessage.webhookUrl] = now + (retryAfter * 1000) + 100;
      
      // Put the message back at the front of the queue
      RATE_LIMITS.queue.unshift(nextMessage);
    } else {
      // For other errors, log but don't retry to avoid infinite loops
      console.error(`❌ Failed to send queued message:`, err.message);
    }
  }
  
  // Small delay to avoid hitting rate limits too quickly
  await new Promise(res => setTimeout(res, 500));
  
  // Continue processing the queue
  processDiscordQueue();
}

// === DISCORD MESSAGE FUNCTION WITH RATE LIMIT HANDLING ===
async function sendToDiscordWithRetry(webhookUrl, message) {
  // Check if this webhook is currently rate limited
  const now = Date.now();
  if (RATE_LIMITS.webhooks[webhookUrl] && RATE_LIMITS.webhooks[webhookUrl] > now) {
    // Add to queue instead of sending immediately
    RATE_LIMITS.queue.push({ webhookUrl, message, time: now, isEmbed: false });
    // Start queue processor if not already running
    if (!RATE_LIMITS.processing) {
      processDiscordQueue();
    }
    return;
  }

  try {
    // Try to send the message
    await retryAsync(() => axios.post(webhookUrl, { content: message }));
  } catch (err) {
    // Handle rate limiting
    if (err.response && err.response.status === 429) {
      const retryAfter = err.response.data.retry_after || 1;
      console.log(`⚠️ Rate limited for webhook, retry after ${retryAfter}s`);
      
      // Mark this webhook as rate limited
      RATE_LIMITS.webhooks[webhookUrl] = now + (retryAfter * 1000) + 100; // Add 100ms buffer
      
      // Add message to queue
      RATE_LIMITS.queue.push({ webhookUrl, message, time: now, isEmbed: false });
      
      // Start queue processor if not already running
      if (!RATE_LIMITS.processing) {
        processDiscordQueue();
      }
    } else {
      // For other errors, just log them
      console.error(`❌ Error sending to Discord:`, err.message);
    }
  }
}

// Function to send rich embed to Discord with rate limiting and debugging
async function sendEmbedToDiscord(webhookUrl, embed) {
  // Add debug logs
  console.log(`Attempting to send embed to webhook: ${webhookUrl}`);
  
  // Check thumbnail URL
  if (embed.thumbnail && embed.thumbnail.url) {
    console.log(`✅ Embed thumbnail URL: ${embed.thumbnail.url}`);
  } else {
    console.error(`❌ Embed MISSING thumbnail URL`);
  }
  
  // Check image URL
  if (embed.image && embed.image.url) {
    console.log(`✅ Embed image URL: ${embed.image.url}`);
  } else {
    console.log(`ℹ️ Embed does not have an image URL (this might be intentional)`);
  }
  
  // Check if this webhook is currently rate limited
  const now = Date.now();
  if (RATE_LIMITS.webhooks[webhookUrl] && RATE_LIMITS.webhooks[webhookUrl] > now) {
    console.log(`Rate limited, adding to queue...`);
    // Add to queue instead of sending immediately
    RATE_LIMITS.queue.push({ webhookUrl, embed, time: now, isEmbed: true });
    // Start queue processor if not already running
    if (!RATE_LIMITS.processing) {
      processDiscordQueue();
    }
    return;
  }

  try {
    // Make sure color is an integer
    if (embed.color && typeof embed.color === 'string') {
      embed.color = parseInt(embed.color.replace('#', ''), 16);
    }
    
    // Format the embed correctly for Discord API
    const payload = { embeds: [embed] };
    console.log(`Sending embed payload: ${JSON.stringify(payload).substring(0, 200)}...`);
    
    // Try to send the embed
    const response = await axios.post(webhookUrl, payload);
    console.log(`✅ Successfully sent embed to Discord. Status: ${response.status}`);
  } catch (err) {
    console.error(`❌ Full error sending to Discord:`, err);
    
    // Handle rate limiting
    if (err.response && err.response.status === 429) {
      const retryAfter = err.response.data.retry_after || 1;
      console.log(`⚠️ Rate limited for webhook, retry after ${retryAfter}s`);
      
      // Mark this webhook as rate limited
      RATE_LIMITS.webhooks[webhookUrl] = now + (retryAfter * 1000) + 100; // Add 100ms buffer
      
      // Add embed to queue
      RATE_LIMITS.queue.push({ webhookUrl, embed, time: now, isEmbed: true });
      
      // Start queue processor if not already running
      if (!RATE_LIMITS.processing) {
        processDiscordQueue();
      }
    } else {
      // For other errors, just log them
      console.error(`❌ Error sending embed to Discord:`, err.message);
      
      // Add more detailed error information if available
      if (err.response) {
        console.error(`Status code: ${err.response.status}`);
        console.error(`Response data: ${JSON.stringify(err.response.data || {}).substring(0, 200)}`);
      }
    }
  }
}
// Function to properly check highlighted players' image URLs
function validateHighlightedPlayerUrls() {
  console.log('🔍 Validating highlighted players image URLs:');
  let hasIssues = false;
  
  for (const player in HIGHLIGHTED_PLAYERS) {
    const highlight = HIGHLIGHTED_PLAYERS[player];
    
    // Check for GIF URL
    if (!highlight.gifUrl) {
      console.error(`❌ MISSING GIF URL for ${player}`);
      hasIssues = true;
    } else {
      console.log(`✅ ${player} GIF URL: ${highlight.gifUrl}`);
    }
    
    // Check for thumbnail URL
    if (!highlight.thumbnailUrl) {
      console.error(`⚠️ MISSING THUMBNAIL URL for ${player}`);
      hasIssues = true;
    } else {
      console.log(`✅ ${player} thumbnail URL: ${highlight.thumbnailUrl}`);
    }
  }
  
  return !hasIssues;
}

function createKillEmbed(killer, victim, weapon, distance, serverName, config) {
  console.log(`Creating kill embed for ${killer} killing ${victim}`);
  const emoji = weaponEmojis[weapon] || '🔫';
  const distanceText = distance > 0 ? `${distance}m` : 'N/A';
  
  // Create a copy of the kill embed template
  const embed = JSON.parse(JSON.stringify(EMBED_TEMPLATES.kill));
  
  // Get highlighted formatting for players
  const killerHighlight = getPlayerHighlight(killer);
  const victimHighlight = getPlayerHighlight(victim);
  
  console.log(`Killer highlight for ${killer}:`, killerHighlight);
  console.log(`Victim highlight for ${victim}:`, victimHighlight);
  
  // Format player names with highlights if applicable
  const killerDisplay = formatPlayerName(killer);
  const victimDisplay = formatPlayerName(victim);
  
  // Replace template variables with regular names (for title)
  embed.title = embed.title
    .replace('{emoji}', emoji)
    .replace('{killer}', killer)
    .replace('{victim}', victim);
  
  // Get the kill phrase and apply highlighted formatting
  let phrase = getNextKillPhrase();
  phrase = phrase
    .replace('{killer}', killerDisplay)
    .replace('{victim}', victimDisplay)
    .replace('{weapon}', weapon)
    .replace('{distance}', distance > 0 ? ` (${distance}m)` : '');
  
  embed.description = phrase;
  
  // Update fields
  embed.fields[0].value = weapon;
  embed.fields[1].value = distanceText;
  
  // Set server-specific info
  embed.footer.text = serverName;
  embed.footer.icon_url = config.iconUrl || 'https://i.imgur.com/6guD1s3.png';
  
  // FIXED: Image URL handling - setting image properly for highlighted players
  if (killerHighlight && killerHighlight.gifUrl) {
    console.log(`Adding GIF for killer ${killer}: ${killerHighlight.gifUrl}`);
    embed.image = { url: killerHighlight.gifUrl };
  } else if (victimHighlight && victimHighlight.gifUrl) {
    console.log(`Adding GIF for victim ${victim}: ${victimHighlight.gifUrl}`);
    embed.image = { url: victimHighlight.gifUrl };
  } else {
    // Ensure image is set to null if no GIF is available
    embed.image = { url: null };
  }
  
  // Set color - prioritize highlighted player's color if present
  if (killerHighlight) {
    embed.color = parseInt(killerHighlight.color.replace('#', ''), 16);
  } else if (victimHighlight) {
    embed.color = parseInt(victimHighlight.color.replace('#', ''), 16);
  } else {
    embed.color = parseInt(config.color.replace('#', ''), 16);
  }
  
  // FIXED: Thumbnail URL handling
  if (killerHighlight && killerHighlight.thumbnailUrl) {
    console.log(`Setting thumbnail for killer ${killer}: ${killerHighlight.thumbnailUrl}`);
    embed.thumbnail.url = killerHighlight.thumbnailUrl;
  } else if (victimHighlight && victimHighlight.thumbnailUrl) {
    console.log(`Setting thumbnail for victim ${victim}: ${victimHighlight.thumbnailUrl}`);
    embed.thumbnail.url = victimHighlight.thumbnailUrl;
  } else {
    embed.thumbnail.url = getWeaponIconURL(weapon);
  }
  
  console.log(`Final embed image URL: ${embed.image.url}`);
  console.log(`Final embed thumbnail URL: ${embed.thumbnail.url}`);
  
  return embed;
}

// Function to create and send a highlighted player kill embed
async function sendHighlightedKillEmbed(killer, victim, weapon, distance, config) {
  // Only proceed if either killer or victim is a highlighted player
  const killerHighlight = getPlayerHighlight(killer);
  const victimHighlight = getPlayerHighlight(victim);
  
  if (!killerHighlight && !victimHighlight) {
    return; // Neither player is highlighted, skip this function
  }
  
  // Determine which player's style to use (prioritize killer)
  const playerHighlight = killerHighlight || victimHighlight;
  const highlightedPlayer = killerHighlight ? killer : victim;
  const isKillerHighlighted = !!killerHighlight;
  
  console.log(`Creating highlighted embed for ${highlightedPlayer}`);
  console.log(`Player highlight data:`, playerHighlight);
  
  // Create a specialized embed for highlighted players
  const embed = {
    title: `${playerHighlight.emoji} HIGHLIGHTED PLAYER ${playerHighlight.emoji}`,
    description: isKillerHighlighted ? 
      `${playerHighlight.prefix}**${killer}** just eliminated **${victim}** with **${weapon}**${distance > 0 ? ` from ${distance}m away` : ''}!` :
      `${playerHighlight.prefix}**${victim}** was eliminated by **${killer}** with **${weapon}**${distance > 0 ? ` from ${distance}m away` : ''}!`,
    color: parseInt(playerHighlight.color.replace('#', ''), 16),
    // FIXED: Properly set the image URL
    image: { 
      url: playerHighlight.gifUrl 
    },
    // FIXED: Properly set the thumbnail URL
    thumbnail: {
      url: playerHighlight.thumbnailUrl || getWeaponIconURL(weapon)
    },
    fields: [
      { name: "Weapon", value: weapon, inline: true },
      { name: "Distance", value: distance > 0 ? `${distance}m` : 'N/A', inline: true }
    ],
    footer: { 
      text: `${config.serverName} | ${formatDate(new Date())}`, 
      icon_url: config.iconUrl 
    },
    timestamp: new Date().toISOString()
  };
  
  console.log(`Highlighted embed image URL: ${embed.image.url}`);
  console.log(`Highlighted embed thumbnail URL: ${embed.thumbnail.url}`);
  
  // Send the specialized embed
  await sendEmbedToDiscord(config.killWebhook, embed);
  console.log(`✅ Sent highlighted player embed for ${highlightedPlayer}`);
}
// Function to create and send a highlighted player killstreak embed
async function sendHighlightedKillstreakEmbed(player, killstreakCount, milestone, config) {
  // Only proceed if player is highlighted
  const playerHighlight = getPlayerHighlight(player);
  
  if (!playerHighlight) {
    return; // Not a highlighted player, skip this function
  }
  
  // Create a specialized killstreak embed for highlighted players
  const embed = {
    title: `${playerHighlight.emoji} KILLSTREAK ALERT ${playerHighlight.emoji}`,
    description: `${playerHighlight.prefix}**${player}** ${milestone} with **${killstreakCount}** consecutive kills!`,
    color: parseInt(playerHighlight.color.replace('#', ''), 16),
    // Update thumbnail to use a custom thumbnail if available
    thumbnail: { 
      url: playerHighlight.thumbnailUrl || playerHighlight.gifUrl 
    },
    fields: [
      { name: "Current Streak", value: `${killstreakCount} kills`, inline: true },
      { name: "Achievement", value: milestone, inline: true }
    ],
    footer: { 
      text: `${config.serverName} | ${formatDate(new Date())}`, 
      icon_url: config.iconUrl 
    },
    timestamp: new Date().toISOString()
  };
  
  // Send the specialized embed
  await sendEmbedToDiscord(config.killWebhook, embed);
  console.log(`✅ Sent highlighted killstreak embed for ${player}`);
}
function createLongshotEmbed(killer, victim, weapon, distance, serverName, config) {
  // Create a copy of the longshot embed template
  const embed = JSON.parse(JSON.stringify(EMBED_TEMPLATES.longshot));
  
  // Format player names with highlights
  const killerDisplay = formatPlayerName(killer);
  const victimDisplay = formatPlayerName(victim);
  
  // Get highlight info for coloring
  const killerHighlight = getPlayerHighlight(killer);
  const victimHighlight = getPlayerHighlight(victim);
  
  // Set description from longshot phrase template with highlights
  const phrase = getNextLongshotPhrase();
  embed.description = phrase
    .replace('{killer}', killerDisplay)
    .replace('{victim}', victimDisplay)
    .replace('{weapon}', weapon)
    .replace('{distance}', distance);
  
  // Update fields
  embed.fields[0].value = `**${distance}m**`;
  embed.fields[1].value = weapon;
  
  // Add GIF for highlighted players
  if (killerHighlight && killerHighlight.gifUrl) {
    embed.image = { url: killerHighlight.gifUrl };
  } else if (victimHighlight && victimHighlight.gifUrl) {
    embed.image = { url: victimHighlight.gifUrl };
  }
  
  // Set server-specific info
  embed.footer.text = serverName;
  embed.footer.icon_url = config.iconUrl || 'https://i.imgur.com/6guD1s3.png';
  
  // Set color - prioritize highlighted player's color if present
  if (killerHighlight) {
    embed.color = parseInt(killerHighlight.color.replace('#', ''), 16);
  } else {
    embed.color = parseInt("AA33AA", 16); // Default purple color for longshots
  }
  
  // Set custom thumbnail for highlighted players or weapon icon
  if (killerHighlight && killerHighlight.thumbnailUrl) {
    embed.thumbnail.url = killerHighlight.thumbnailUrl;
  } else if (victimHighlight && victimHighlight.thumbnailUrl) {
    embed.thumbnail.url = victimHighlight.thumbnailUrl;
  } else {
    embed.thumbnail.url = getWeaponIconURL(weapon);
  }
  
  return embed;
}

function createSuicideEmbed(victim, cause, serverName, config) {
  const emoji = "💀";
  
  // Create a copy of the suicide embed template
  const embed = JSON.parse(JSON.stringify(EMBED_TEMPLATES.suicide));
  
  // Format victim name with highlight if applicable
  const victimDisplay = formatPlayerName(victim);
  
  // Get highlight info for coloring
  const victimHighlight = getPlayerHighlight(victim);
  
  // Replace template variables for title (using regular name)
  embed.title = embed.title
    .replace('{emoji}', emoji)
    .replace('{victim}', victim);
  
  // Set description from suicide phrase template with highlight
  const phrase = getNextSuicidePhrase();
  embed.description = `${phrase.replace('{victim}', victimDisplay)} (${cause.replace(/_/g, ' ')})`;
  
  // Add GIF for highlighted players
  if (victimHighlight && victimHighlight.gifUrl) {
    embed.image = { url: victimHighlight.gifUrl };
  }
  
  // Set server-specific info
  embed.footer.text = serverName;
  embed.footer.icon_url = config.iconUrl || 'https://i.imgur.com/6guD1s3.png';
  
  // Set color - use highlighted player's color if present
  if (victimHighlight) {
    embed.color = parseInt(victimHighlight.color.replace('#', ''), 16);
  } else {
    embed.color = parseInt("DD3333", 16); // Default red color for suicides
  }
  
  // Set custom thumbnail if available
  if (victimHighlight && victimHighlight.thumbnailUrl) {
    embed.thumbnail.url = victimHighlight.thumbnailUrl;
  }
  
  return embed;
}

function createKillstreakEmbed(killstreakResult, serverName, config) {
  // Create a copy of the killstreak embed template
  const embed = JSON.parse(JSON.stringify(EMBED_TEMPLATES.killstreak));
  
  // Format player name with highlight if applicable
  const playerDisplay = formatPlayerName(killstreakResult.player);
  
  // Get highlight info for coloring
  const playerHighlight = getPlayerHighlight(killstreakResult.player);
  
  // Replace template variables with highlighted version
  embed.description = embed.description
    .replace('{player}', playerDisplay)
    .replace('{milestone}', killstreakResult.message)
    .replace('{count}', killstreakResult.count);
  
  // Add GIF for highlighted players
  if (playerHighlight && playerHighlight.gifUrl) {
    embed.image = { url: playerHighlight.gifUrl };
  }
  
  // Set server-specific info
  embed.footer.text = serverName;
  embed.footer.icon_url = config.iconUrl || 'https://i.imgur.com/6guD1s3.png';
  
  // Set color - use highlighted player's color if present
  if (playerHighlight) {
    embed.color = parseInt(playerHighlight.color.replace('#', ''), 16);
  } else {
    embed.color = parseInt("FFAA00", 16); // Default orange color for killstreaks
  }
  
  // Set custom thumbnail if available
  if (playerHighlight && playerHighlight.thumbnailUrl) {
    embed.thumbnail.url = playerHighlight.thumbnailUrl;
  }
  
  return embed;
}

// === CLEANUP OLD DATA ===
function cleanupOldData() {
  const { daily, weekly, monthly } = getTimeIdentifiers();
  const now = new Date();
  
  // Clean up daily data older than 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  // Clean up monthly data older than 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(now.getMonth() - 12);
  const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().substring(0, 7);
  
  console.log(`🧹 Cleaning up old data older than ${thirtyDaysAgoStr} (daily) and ${twelveMonthsAgoStr} (monthly)`);
  
  // Clean daily data
  Object.keys(playerStats.daily).forEach(date => {
    if (date < thirtyDaysAgoStr) {
      delete playerStats.daily[date];
    }
  });
  
  Object.keys(longshots.daily).forEach(date => {
    if (date < thirtyDaysAgoStr) {
      delete longshots.daily[date];
    }
  });
  
  // Clean monthly data
  Object.keys(playerStats.monthly).forEach(month => {
    if (month < twelveMonthsAgoStr) {
      delete playerStats.monthly[month];
    }
  });
  
  Object.keys(longshots.monthly).forEach(month => {
    if (month < twelveMonthsAgoStr) {
      delete longshots.monthly[month];
    }
  });
  
  // Clean weekly data - just keep last 12 weeks for simplicity
  const weekKeys = Object.keys(playerStats.weekly).sort((a, b) => b.localeCompare(a));
  if (weekKeys.length > 12) {
    const keysToKeep = weekKeys.slice(0, 12);
    playerStats.weekly = Object.fromEntries(
      Object.entries(playerStats.weekly).filter(([key]) => keysToKeep.includes(key))
    );
  }
  
  const longshotWeekKeys = Object.keys(longshots.weekly).sort((a, b) => b.localeCompare(a));
  if (longshotWeekKeys.length > 12) {
    const keysToKeep = longshotWeekKeys.slice(0, 12);
    longshots.weekly = Object.fromEntries(
      Object.entries(longshots.weekly).filter(([key]) => keysToKeep.includes(key))
    );
  }
  
  console.log('✅ Cleanup completed');
  
  // Save changes
  savePlayerStats(playerStats);
  saveLongshots(longshots);
}

// === DATA MIGRATION ===
function migrateOldLeaderboardData() {
  // This function migrates data from the old format to the new format if needed
  if (Object.keys(leaderboards).length > 0 && Object.keys(playerStats.all_time).length === 0) {
    console.log('📊 Migrating old leaderboard data to new format...');
    
    // Migrate each player's kill count to the new all_time stats
    Object.entries(leaderboards).forEach(([player, kills]) => {
      if (!playerStats.all_time[player]) {
        playerStats.all_time[player] = {
          kills: kills,
          deaths: 0,  // We don't have death data from the old format
          kd: kills,  // KD is just kills when deaths is 0
          servers: {}
        };
      }
    });
    
    console.log(`✅ Migrated ${Object.keys(leaderboards).length} players from old format`);
    savePlayerStats(playerStats);
  }
}

loadHighlightedPlayers();

// === PERIODIC DATA SAVING ===
// Save all data every 5 minutes regardless of new logs
const DATA_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes
function saveAllData() {
  try {
    // Save all data files
    saveSeenLines(seenLines);
    savePlayerStats(playerStats);
    saveLongshots(longshots);
    saveKillstreaks(activeKillstreaks);
    saveLeaderboards(leaderboards); // Legacy - keeping for backward compatibility
    saveMessageIndexes(messageIndexes);
    saveHighlightedPlayers();
    console.log('✅ Periodic data save completed');
  } catch (err) {
    console.error('❌ Error during periodic data save:', err.message);
  }
}

// Add graceful shutdown to save data when script is terminated
process.on('SIGINT', async () => {
  console.log('📥 Script terminating, saving all data...');
  saveKillstreaks(activeKillstreaks); // Ensure killstreaks are saved first
  saveAllData();
  console.log('👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('📥 Script terminating, saving all data...');
  saveKillstreaks(activeKillstreaks); // Ensure killstreaks are saved first
  saveAllData();
  console.log('👋 Goodbye!');
  process.exit(0);
});
// === HELPERS ===
async function getAllLogFiles(sftp, config) {
  const fileList = await sftp.list(config.remoteDir);
  const startFileName = '2025.05.19-00.00.00.csv';

  return fileList
    .filter(f => f.name.endsWith('.csv') && f.name >= startFileName)
    .sort((a, b) => b.modifyTime - a.modifyTime);
}

function hasBlankSegments(row) {
  if (row.length < 7) return true;
  const killer = row[1];
  const victim = row[3];
  if (!killer || !victim || killer.trim() === '' || victim.trim() === '') {
    return true;
  }
  return false;
}

async function parseCSV(content) {
  return new Promise((resolve, reject) => {
    parse(content, {
      delimiter: ';',
      skip_empty_lines: true,
    }, (err, records) => {
      if (err) return reject(err);
      resolve(records);
    });
  });
}

// === MAIN FUNCTION ===
async function fetchAndProcessLogsFromServers() {
  for (const config of serverConfigs) {
    const sftp = new SftpClient();

    try {
      console.log(`🔌 Connecting to ${config.host}...`);
      await retryAsync(() => sftp.connect(config), 3, 5000); // More retries, longer delay
      console.log(`✅ Connected to ${config.host}`);
      
      console.log(`📋 Listing files in ${config.remoteDir}`);
      const csvFiles = await getAllLogFiles(sftp, config);
      console.log(`📊 Found ${csvFiles.length} log files`);

      let totalProcessed = 0;

      for (const file of csvFiles) {
        const filePath = config.remoteDir + file.name;
        let content;

        try {
          console.log(`📥 Downloading file ${file.name}...`);
          const fileBuffer = await retryAsync(() => sftp.get(filePath), 3, 3000);
          content = fileBuffer.toString();
          console.log(`✅ File fetched: ${file.name}`);
        } catch (err) {
          console.error(`❌ Error reading file ${file.name}:`, err.message);
          // Try to reconnect before continuing to next file
          try {
            await sftp.end();
            await retryAsync(() => sftp.connect(config), 2, 3000);
          } catch (reconnectErr) {
            console.error(`❌ Failed to reconnect:`, reconnectErr.message);
          }
          continue;
        }

        const records = await parseCSV(content);
        console.log('✅ Parsed rows:', records.length);
        let processed = 0;

        for (const row of records) {
          // Basic validation
          if (!Array.isArray(row) || row.length < 7) {
            console.log('❌ Invalid row, skipping:', row);
            continue;
          }

          // Check for blank segments
          if (hasBlankSegments(row)) {
            continue;
          }

          const lineId = row.join(';');
          if (seenLines.has(lineId)) {
            console.log('⚠️ Already seen, skipping');
            continue;
          }

          seenLines.add(lineId);
          processed++;

          const timestamp = row[0];
          const killer = row[1];
          const victim = row[3];
          const cause = row[5];
          const distance = row[6];
          const distanceNum = parseInt(distance);

          // Update player stats with this kill/death
          updatePlayerStats(killer, victim, distance, cause, timestamp, config.serverName);

          const isSuicide = killer === victim;
          const causeLower = cause.toLowerCase();

          if (isSuicide || causeLower.includes('suicide') || causeLower.includes('falling') || causeLower.includes('relocation')) {
            // Create and send suicide embed
            const suicideEmbed = createSuicideEmbed(victim, cause, config.serverName, config);
            await sendEmbedToDiscord(config.suicideWebhook, suicideEmbed);
            
            // Reset killstreak when player dies to environment
            if (activeKillstreaks[victim]) {
              activeKillstreaks[victim].count = 0;
              if (config.serverName && activeKillstreaks[victim].servers[config.serverName]) {
                activeKillstreaks[victim].servers[config.serverName].count = 0;
              }
            }
          } else {
            // Update killstreak for this kill
            const killstreakResult = updateKillstreak(killer, victim, config.serverName, config);
            
            // Check for longshot (over 200m)
            if (distanceNum >= 200) {
              // Create and send longshot embed
              const longshotEmbed = createLongshotEmbed(killer, victim, cause, distanceNum, config.serverName, config);
              await sendEmbedToDiscord(config.killWebhook, longshotEmbed);
            } else {
              // Create and send normal kill embed
              const killEmbed = createKillEmbed(killer, victim, cause, distanceNum, config.serverName, config);
              await sendEmbedToDiscord(config.killWebhook, killEmbed);
            }
            
            // If a milestone was reached, send killstreak announcement
            if (killstreakResult.reached) {
              const killstreakEmbed = createKillstreakEmbed(killstreakResult, config.serverName, config);
              await sendEmbedToDiscord(config.killWebhook, killstreakEmbed);
              
              // Save updated killstreaks
              saveKillstreaks(activeKillstreaks);
            }
          }
        }

        if (processed > 0) {
          console.log(`✅ Processed ${processed} new lines from ${file.name}`);
          totalProcessed += processed;
        }
      }

      // Close the connection
      try {
        await sftp.end();
        console.log(`🔌 Closed connection to ${config.host}`);
      } catch (closeErr) {
        console.error(`⚠️ Error closing connection:`, closeErr.message);
      }

      if (totalProcessed > 0) {
        saveSeenLines(seenLines);
        savePlayerStats(playerStats);
        saveLongshots(longshots);
        saveKillstreaks(activeKillstreaks);
        saveMessageIndexes(messageIndexes);
        // Legacy - to be removed eventually
        saveLeaderboards(leaderboards);
      } else {
        console.log(`⚠️ No new lines from ${config.host}`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${config.host}:`, err.message);
      try { 
        await sftp.end();
        console.log(`🔌 Attempted to close connection to ${config.host}`);
      } catch (closeErr) {
        // Just log and continue
        console.error(`⚠️ Error closing connection:`, closeErr.message);
      }
    }
  }
}

// Test your webhook URLs with a simple message
async function testWebhooks() {
  console.log('🔍 Testing Discord webhook connections...');
  for (const config of serverConfigs) {
    try {
      const testMessage = {
        content: "Testing webhook connection..."
      };
      await axios.post(config.killWebhook, testMessage);
      console.log(`✅ Successfully tested webhook for ${config.serverName}`);
    } catch (err) {
      console.error(`❌ Error testing webhook for ${config.serverName}:`, err.message);
      console.error(`   Webhook URL: ${config.killWebhook}`);
      if (err.response) {
        console.error(`   Status: ${err.response.status}`);
        console.error(`   Response: ${JSON.stringify(err.response.data)}`);
      }
    }
  }
}

// === INITIALIZATION AND SCHEDULE ===
// Migrate old data format if needed
migrateOldLeaderboardData();

// Run cleanup daily to remove old data
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
setInterval(cleanupOldData, CLEANUP_INTERVAL);

// Send leaderboards every 4 hours
const LEADERBOARD_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
setInterval(sendLeaderboards, LEADERBOARD_INTERVAL);

// Save all data periodically
setInterval(saveAllData, DATA_SAVE_INTERVAL);

// Run immediately on startup
setTimeout(sendLeaderboards, 10000);
setTimeout(testWebhooks, 5000);

// Add this to your initialization section, after other timers
// Send all-player stats every 12 hours
const ALL_PLAYER_STATS_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
setInterval(async () => {
  for (const config of serverConfigs) {
    await sendAllPlayerStatsEmbed(config);
    // Delay between servers
    await new Promise(res => setTimeout(res, 2000));
  }
}, ALL_PLAYER_STATS_INTERVAL);

// Call once on startup with a bit of delay
setTimeout(async () => {
  for (const config of serverConfigs) {
    await sendAllPlayerStatsEmbed(config);
    await new Promise(res => setTimeout(res, 2000));
  }
}, 15000);

// Run the URL validation on startup - ADD THIS NEW CODE HERE
setTimeout(() => {
  console.log('\n==== RUNNING IMAGE URL VALIDATION ====');
  const valid = validateHighlightedPlayerUrls();
  if (valid) {
    console.log('✅ All highlighted players have valid image URLs');
  } else {
    console.error('⚠️ Some highlighted players have missing image URLs - please fix');
  }
  console.log('=======================================\n');
}, 3000);


// One-time reset to fix any issues with highlighted players
setTimeout(() => {
  resetHighlightedPlayers();
}, 6000);


// Start Express server for webhook endpoints
const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON requests
app.use(bodyParser.json());

// Add route for server health check
app.get('/health', (req, res) => {
  res.status(200).send({ status: 'ok' });
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`💻 Server running on port ${PORT}`);
  
  // Welcome message
  console.log('');
  console.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
  console.log('┃                       DEADSIDE KILLFEED                           ┃');
  console.log('┃              Enhanced Discord Integration v2.0                    ┃');
  console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
  console.log('');
  console.log('🔁 Checking logs every 30s...');
  console.log('📊 Leaderboards will update every 4 hours');
  console.log('⚡ Killstreaks are being tracked');
  console.log('🎯 Longshots are being recorded (200m+)');
  console.log('🛡️ Discord rate limit protection enabled');
  console.log('💬 Enhanced message formatting with rich embeds');
  console.log('');
  
  // Start monitoring
  fetchAndProcessLogsFromServers();
  setInterval(fetchAndProcessLogsFromServers, 30000);
});
