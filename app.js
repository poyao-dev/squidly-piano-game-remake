const BASE_URL = new URL(".", import.meta.url).href;

class SquidlyPianoGame {
  constructor() {
    this.audioElements = {
      C: null,
      D: null,
      E: null,
      F: null,
      G: null,
    };
    this.init();
  }

  init() {
    // Initialize the game here
    console.log("Squidly Piano Game Initialized");
    SquidlyAPI.firebaseSet("pianoKeyPressed", null); // Initialize the value in Firebase
    this._setupAudioSources();
    this._setupKeyboard();
    this._setupListeners();
  }

  _setupAudioSources() {
    // Preload audio sources for each key
    for (const key in this.audioElements) {
      const audio = new Audio(`${BASE_URL}sounds/${key}.mp3`);
      this.audioElements[key] = audio;
    }
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
    for (const key in this.audioElements) {
      const accessButtonWrapper = document.createElement("access-button");
      const button = document.createElement("button");
      button.textContent = key;
      //   elongated button, font size 2xl, with some padding, rounded corners, and a shadow
      button.className =
        "w-[clamp(3rem,15vmin,6rem)] h-[clamp(3rem,15vmin,6rem)] bg-white text-black font-bold text-sm sm:text-lg md:text-2xl py-2 px-3 rounded-lg shadow-lg m-1 sm:m-3 md:m-5 transform transition hover:-translate-y-0.5 active:translate-y-0";

      accessButtonWrapper.addEventListener("access-click", () => {
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
      // value will be in the format "key_timestamp", we only want the key
      // null returned if the value is deleted, so we need to check for that
      if (!value) return;
      const key = value.split("_")[0];
      console.log("Piano key pressed:", key);
      // Reuse pre-loaded audio if available
      if (this.audioElements[key]) {
        this.audioElements[key].play().catch(() => {});
      }
    });
  }
}

// Instantiate the app to run it
window.onload = () => {
  new SquidlyPianoGame();
};
