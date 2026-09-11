const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
const PAUSE_FILE = path.join(DATA_DIR, 'PAUSED');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSeen() {
  try {
    const raw = fs.readFileSync(SEEN_FILE, 'utf8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveSeen(seenSet) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenSet], null, 2));
}

function isPaused() {
  return fs.existsSync(PAUSE_FILE);
}

function pause() {
  fs.writeFileSync(PAUSE_FILE, new Date().toISOString());
}

function resume() {
  if (fs.existsSync(PAUSE_FILE)) fs.unlinkSync(PAUSE_FILE);
}

module.exports = { loadSeen, saveSeen, isPaused, pause, resume };
