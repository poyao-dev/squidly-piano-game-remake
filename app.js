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
      "C#",
      "D#",
      "F#",
      "G#",
      "A#",
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
    this._setupKeyboard();
    this._setupListeners();
    this._setupSideBarButtons();
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

  _setupKeyboard() {
    // Create a container for the piano keys
    const pianoContainer = document.createElement("div");
    // flexbox with wrapping layout, centered at the bottom, filling available height
    pianoContainer.className =
      "flex flex-wrap justify-center items-end h-full p-2";

    document.body.appendChild(pianoContainer);
    // iterate over the white keys on the keyboard and create buttons for them
    const whiteKeys = this.keys.filter((k) => !k.includes("#"));
    for (const key of whiteKeys) {
      const accessButtonWrapper = document.createElement("access-button");
      const button = document.createElement("button");
      button.textContent = key;
      //   elongated button, font size 2xl, with some padding, rounded corners, and a shadow
      button.className =
        "w-[15vh] h-[15vh] bg-white text-black font-bold text-sm sm:text-lg md:text-2xl py-2 px-3 rounded-full shadow-lg m-1 sm:m-3 md:m-5 transform transition hover:-translate-y-0.5 active:translate-y-0";

      accessButtonWrapper.addEventListener("access-click", () => {
        console.log(`Key ${key} pressed`);
        // add a timestamp to the key press
        SquidlyAPI.firebaseSet("pianoKeyPressed", key + "_" + Date.now());
      });
      button.addEventListener("click", () => {
        console.log(`Key ${key} pressed`);
        // add a timestamp to the key press
        SquidlyAPI.firebaseSet("pianoKeyPressed", key + "_" + Date.now());
      });
      accessButtonWrapper.appendChild(button);
      pianoContainer.appendChild(accessButtonWrapper);
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
}

// Instantiate the app to run it
window.onload = () => {
  new SquidlyPianoGame();
};
