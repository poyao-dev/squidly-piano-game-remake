const BASE_URL = new URL(".", import.meta.url).href;

class SquidlyPianoGame {
  constructor() {
    this.keys = ["C", "D", "E", "F", "G"];
    this.audioElements = {};
    this.volume = 1.0; // Default volume level
    this.init();
  }

  async init() {
    // Initialize the game here
    console.log("Squidly Piano Game Initialized");
    SquidlyAPI.firebaseSet("pianoKeyPressed", null); // Initialize the value in Firebase
    console.log(
      "Fetching initial volume level... from " +
        `${session_info.user}/volume/level`,
    );
    // Init the volume level from Firebase and set up a listener for changes
    await SquidlyAPI.getSettings(
      `${session_info.user}/volume/level`,
      this._updateVolume.bind(this),
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
      const audio = new Audio(`${BASE_URL}sounds/${key}.mp3`);
      this.audioElements[key] = audio;
    }
  }

  _setupSideBarButtons() {
    // Create a sidebar container
    SquidlyAPI.setIcon(
      1,
      0,
      {
        symbol: "add",
        displayValue: "Volume Up",
        type: "action",
      },
      () => {
        // On click, increase volume by 5%
        this.volume = Math.min(1.0, this.volume + 0.05);
        SquidlyAPI.setSettings(
          `${session_info.user}/volume/level`,
          this.volume * 100,
        );
      },
    );
    SquidlyAPI.setIcon(
      2,
      0,
      {
        symbol: "minus",
        displayValue: "Volume Down",
        type: "action",
      },
      () => {
        // On click, decrease volume by 5%
        this.volume = Math.max(0.0, this.volume - 0.05);
        SquidlyAPI.setSettings(
          `${session_info.user}/volume/level`,
          this.volume * 100,
        );
      },
    );
  }

  _setupKeyboard() {
    // Create a container for the piano keys
    const pianoContainer = document.createElement("div");
    // flexbox with wrapping layout, centered at the bottom, filling available height
    pianoContainer.className =
      "flex flex-wrap justify-center items-end h-full p-2";

    document.body.appendChild(pianoContainer);
    // 5 keys: C, D, E, F, G
    // iterate over the keys on the keyboard and create buttons for them
    for (const key of this.keys) {
      const accessButtonWrapper = document.createElement("access-button");
      const button = document.createElement("button");
      button.textContent = key;
      //   elongated button, font size 2xl, with some padding, rounded corners, and a shadow
      button.className =
        "w-[10vh] h-[30vh] bg-white text-black font-bold text-sm sm:text-lg md:text-2xl py-2 px-3 rounded-lg shadow-lg m-1 sm:m-3 md:m-5 transform transition hover:-translate-y-0.5 active:translate-y-0";

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
      this.audioElements[key]?.play().catch(() => {});
    });
    // Listen for volume changes using the same handler
    SquidlyAPI.addSettingsListener(
      `${session_info.user}/volume/level`,
      this._updateVolume,
    );
  }
}

// Instantiate the app to run it
window.onload = () => {
  new SquidlyPianoGame();
};
