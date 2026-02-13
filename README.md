# Ultimate DJ

Browser-based DJ software with video mixing, audio visualization, and karaoke lyrics.

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/webgineergit/ultimate-dj/main/install.sh | bash
```

This will install all dependencies (Node.js, ffmpeg, yt-dlp, Python) and set up the app. After installation, just run `dj` to start.

## Features

- Dual deck video/audio mixing with crossfader
- YouTube video download and library management
- Real-time waveform visualization
- BPM detection and beat sync
- Synced karaoke lyrics display
- Photo slideshow backgrounds
- WebGL shader visualizations
- Vinyl scratching with reverse audio
- Separate control and display windows
- Audio output device selection (cue/main routing)

## Manual Installation

### Prerequisites

- Node.js 18+
- ffmpeg
- yt-dlp
- Python 3 with venv

### Setup

```bash
# Clone the repository
git clone https://github.com/webgineergit/ultimate-dj.git
cd ultimate-dj

# Install dependencies
npm install
cd client && npm install && cd ..

# Set up Python environment for lyrics
cd server/scripts
python3 -m venv venv
source venv/bin/activate
pip install ytmusicapi
deactivate
cd ../..

# Start the app
npm run dev
```

Open http://localhost:5173 for the control interface.

## Usage

1. **Add tracks**: Search YouTube or paste a URL to download videos to your library
2. **Load decks**: Drag tracks from the library onto Deck A or Deck B
3. **Mix**: Use the crossfader to blend between decks
4. **Display window**: Open `/display` in a new window for the audience view

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/webgineergit/ultimate-dj/main/uninstall.sh | bash
```

Or manually:
```bash
rm -rf ~/.ultimate-dj
```
