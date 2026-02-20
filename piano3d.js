import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class Piano3D {
  constructor(container) {
    this.container = container;
    this.keys = [];
    this.init();
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x333333);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 150, 200); // Adjusted for typical STL scales

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Style the canvas to be in the background
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.zIndex = "-1";
    this.container.appendChild(this.renderer.domElement);

    // Controls
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.target.set(0, -30, 0);
    controls.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    this.scene.add(dirLight);

    this.loadModels();

    window.addEventListener("resize", this.onWindowResize.bind(this));

    this.animate();
  }

  loadModels() {
    const loader = new STLLoader();
    const materialWhite = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.1,
    });
    const materialBlack = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.2,
      metalness: 0.1,
    });

    // Define the layout for C, D, E, F, G
    // You may need to adjust the spacing (xOffset) and scale depending on the actual STL sizes
    const keySpacing = 22;
    const layout = [
      {
        note: "C",
        file: "Left Piano Key.stl",
        material: materialWhite,
        x: -keySpacing * 2,
      },
      {
        note: "D",
        file: "Middle Piano Key.stl",
        material: materialWhite,
        x: -keySpacing,
      },
      { note: "E", file: "Right Piano Key.stl", material: materialWhite, x: 0 },
      {
        note: "F",
        file: "Left Piano Key.stl",
        material: materialWhite,
        x: keySpacing,
      },
      {
        note: "G",
        file: "Right Piano Key.stl",
        material: materialWhite,
        x: keySpacing * 2,
      },
    ];

    layout.forEach((keyDef) => {
      loader.load(`./mesh/${keyDef.file}`, (geometry) => {
        geometry.computeVertexNormals();
        // Center the geometry to make positioning easier
        geometry.center();

        const mesh = new THREE.Mesh(geometry, keyDef.material);
        mesh.position.set(keyDef.x, 0, 0);

        // STL models often need to be rotated to face upwards correctly
        mesh.rotation.x = -Math.PI / 2;

        this.scene.add(mesh);
        this.keys.push({
          note: keyDef.note,
          mesh: mesh,
          restingY: mesh.position.y,
        });
      });
    });

    // Example of loading a black key (C#)
    loader.load("./mesh/black key.stl", (geometry) => {
      geometry.computeVertexNormals();
      geometry.center();
      const mesh = new THREE.Mesh(geometry, materialBlack);
      // Position it between C and D, slightly higher and further back
      mesh.position.set(-keySpacing * 1.5, 10, -10);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(1, 0.65, 1); // Shorten length to avoid overlapping white keys
      this.scene.add(mesh);
    });

    // Example of loading a black key (D#)
    loader.load("./mesh/black key.stl", (geometry) => {
      geometry.computeVertexNormals();
      geometry.center();
      const mesh = new THREE.Mesh(geometry, materialBlack);
      // Position it between D and E
      mesh.position.set(-keySpacing * 0.5, 10, -10);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(1, 0.65, 1); // Shorten length to avoid overlapping white keys
      this.scene.add(mesh);
    });

    // You can add more black keys (F#, G#) similarly if needed
    loader.load("./mesh/black key.stl", (geometry) => {
      geometry.computeVertexNormals();
      geometry.center();
      const mesh = new THREE.Mesh(geometry, materialBlack);
      // Position it between F and G
      mesh.position.set(keySpacing * 1.5, 10, -10);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(1, 0.65, 1); // Shorten length to avoid overlapping white keys
      this.scene.add(mesh);
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  pressKey(note) {
    const keyObj = this.keys.find((k) => k.note === note);
    if (keyObj && keyObj.mesh) {
      keyObj.mesh.position.y = keyObj.restingY - 5; // Move down

      // Reset after a short delay
      setTimeout(() => {
        keyObj.mesh.position.y = keyObj.restingY;
      }, 150);
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}
