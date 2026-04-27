import { Piano3D } from "./piano3d.js";

const BASE_URL = new URL(".", import.meta.url).href;

class SquidlyPianoGame {
  constructor() {
    // You can add "C#", "D#", etc. to this array if/when you have sounds for them
    this.keys = [
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "Db",
      "Eb",
      "Gb",
      "Ab",
      "Bb",
    ];
    this.audioElements = {};
    this.volume = 1.0; // Default volume level
    this.init();
  }

  async init() {
    // Initialize the game here
    console.log("Squidly Piano Game Initialized");

    // Initialize 3D Piano
    this.piano3D = new Piano3D(document.body);

    SquidlyAPI.firebaseSet("pianoKeyPressed", null); // Initialize the value in Firebase
    console.log(
      "Fetching initial volume level... from " +
        `${session_info.user}/volume/level`,
    );
    // Init the volume level from Firebase and set up a listener for changes
    await SquidlyAPI.getSettings(
      `${session_info.user}/volume/level`,
      this._updateVolume,
    );
    this._setupAudioSources();

    this._setupListeners();
    this._setupSideBarButtons();
    this._setupOverlayButtons();
    // In init(), after creating piano3D:
    const originalAnimate = this.piano3D.animate.bind(this.piano3D);
    this.piano3D.animate = () => {
      originalAnimate();
      this._updateOverlayPositions();
    };
  }

  _updateVolume = (value) => {
    // parse float
    value = parseFloat(value) / 100;
    this.volume = value;
    for (const audio of Object.values(this.audioElements)) audio.volume = value;
  };

  _setupAudioSources() {
    // Preload audio sources for each key
    for (const key of this.keys) {
      // Need to handle C# mapping to "Cs" if files are named like Cs.mp3, etc.
      // If they literally have a `#` in the filename, you're fine as is.
      // E.g., const fileName = key.replace('#', 's');
      const audio = new Audio(`${BASE_URL}sounds/${key}.mp3`);
      this.audioElements[key] = audio;
    }
  }

  _adjustVolume = (delta) => {
    this.volume = Math.min(1.0, Math.max(0.0, this.volume + delta));
    SquidlyAPI.setSettings(
      `${session_info.user}/volume/level`,
      this.volume * 100,
    );
  };

  _setupSideBarButtons() {
    const buttons = [
      { id: 1, symbol: "add", label: "Volume Up", delta: 0.05 },
      { id: 2, symbol: "minus", label: "Volume Down", delta: -0.05 },
    ];
    for (const { id, symbol, label, delta } of buttons) {
      SquidlyAPI.setIcon(
        id,
        0,
        { symbol, displayValue: label, type: "action" },
        () => this._adjustVolume(delta),
      );
    }
  }

  _setupListeners() {
    // Set up Firebase listeners or other event listeners here
    SquidlyAPI.firebaseOnValue("pianoKeyPressed", (value) => {
      if (!value) return;
      const key = value.split("_")[0];
      console.log("Piano key pressed:", key);

      // Play the audio
      if (this.audioElements[key]) {
        // Reset playback position if it's already playing
        this.audioElements[key].currentTime = 0;
        this.audioElements[key].play().catch(() => {});
      }

      // Animate the 3D key
      if (this.piano3D) {
        this.piano3D.pressKey(key);
      }
    });
    // Listen for volume changes using the same handler
    SquidlyAPI.addSettingsListener(
      `${session_info.user}/volume/level`,
      this._updateVolume,
    );

    // Listen for 3D piano clicks
    window.addEventListener("piano3d-keypress", (e) => {
      const key = e.detail.note;
      // Strip out sharp symbol (e.g. "C#") to play the base note since you don't have sharp sounds yet,
      // or you can just let it try and fail gracefully.
      // Easiest is to just send it exactly like the UI buttons do:
      console.log(`3D Key ${key} clicked`);
      SquidlyAPI.firebaseSet("pianoKeyPressed", key + "_" + Date.now());
    });
  }

  _setupOverlayButtons() {
    this.overlayContainer = document.createElement("div");
    this.overlayContainer.style.cssText =
      "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:10;";
    document.body.appendChild(this.overlayContainer);

    this.accessButtons = {};

    for (const key of this.keys) {
      const ab = document.createElement("access-button");
      const accessGroup =
        key.length > 1 ? "piano-black-keys" : "piano-white-keys";
      ab.setAttribute("access-group", accessGroup);

      // ✅ Keep a generous hit area so elementFromPoint can find it,
      // but the raycaster isPointInElement does the PRECISE check
      ab.style.cssText = `
        position: absolute;
        pointer-events: auto;
        background: transparent;
        opacity: 0.01;
        display: none;
      `;

      ab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      ab.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      ab.addEventListener("access-click", () => {
        console.log(`Dwell-click on key: ${key}`);
        SquidlyAPI.firebaseSet("pianoKeyPressed", key + "_" + Date.now());
      });

      this.overlayContainer.appendChild(ab);
      this.accessButtons[key] = ab;
    }
  }

  _updateOverlayPositions() {
    if (!this.piano3D || !this.piano3D.keys.length) return;

    for (const keyObj of this.piano3D.keys) {
      const ab = this.accessButtons[keyObj.note];
      if (!ab || !keyObj.mesh) continue;

      // ✅ Size the overlay to roughly cover the 3D key's screen projection
      // This is the "coarse" hit area for elementFromPoint
      // The raycaster isPointInElement does the precise check
      const pos = this.piano3D.getKeyScreenPosition(keyObj);
      const isBlack = keyObj.note.length > 1; // "Db", "Eb", etc.
      const w = isBlack ? 30 : 50;
      const h = isBlack ? 60 : 100;

      ab.style.left = `${pos.x - w / 2}px`;
      ab.style.top = `${pos.y}px`;
      ab.style.width = `${1.2 * w}px`;
      ab.style.height = `${1.2 * h}px`;
      ab.style.display = "block";
    }
  }
}

// Instantiate the app to run it
window.onload = () => {
  new SquidlyPianoGame();
};
