import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const PIANO_CONFIG = {
  keySpacing: 20.5,
  groupScale: 1.2,
  materials: {
    white: {
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.0,
      envMapIntensity: 1.5,
    },
    black: {
      color: 0x333333,
      roughness: 0.05,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 2.0,
    },
  },
  // xIndex is a multiplier of keySpacing, centered around 0 (F = 0)
  whiteKeys: [
    { note: "C", file: "Left Piano Key.stl", xIndex: -3 },
    { note: "D", file: "Middle Piano Key.stl", xIndex: -2 },
    { note: "E", file: "Right Piano Key.stl", xIndex: -1 },
    { note: "F", file: "Left Piano Key.stl", xIndex: 0 },
    { note: "G", file: "Middle Piano Key.stl", xIndex: 1 },
    { note: "A", file: "Middle Piano Key.stl", xIndex: 2 },
    { note: "B", file: "Right Piano Key.stl", xIndex: 3 },
  ],
  // xOffset is a half-spacing multiplier, e.g. -2.5 sits between xIndex -3 and -2
  blackKeys: [
    { note: "C#", xOffset: -2.5 },
    { note: "D#", xOffset: -1.5 },
    { note: "F#", xOffset: 0.5 },
    { note: "G#", xOffset: 1.5 },
    { note: "A#", xOffset: 2.5 },
  ],
  blackKeyScale: [1.2, 0.75, 0.4],
  blackKeyPosition: { y: 10, z: -10 },
};

export class Piano3D {
  constructor(container) {
    this.container = container;
    this.keys = [];
    this.init();
  }

  // let mouse = new Vector2(
  //           (x / this.clientWidth) * 2 - 1,
  //           -(y / this.clientHeight) * 2 + 1
  //       );
  //       let raycaster = new Raycaster();
  //       raycaster.setFromCamera(mouse, this.camera);
  //       let intersects = raycaster.intersectObjects(meshes || []);
  //       return intersects;

  // camera.getViewSize(zValue)

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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    // Positioned to hit the keys at an angle to create bright spec highlights
    dirLight.position.set(0, 150, 50);
    this.scene.add(dirLight);

    // Add a secondary light closer to front/top that acts purely as a strong reflection source
    const reflectionLight = new THREE.DirectionalLight(0xffffff, 2.0);
    reflectionLight.position.set(20, 50, 80);
    this.scene.add(reflectionLight);

    // Environment map for reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment()).texture;
    this.scene.environment = envTexture;
    pmremGenerator.dispose();

    this.loadModels();

    // Raycaster setup
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    window.addEventListener("resize", this.onWindowResize.bind(this));
    window.addEventListener("pointerdown", this.onPointerDown.bind(this));

    this.animate();
  }

  loadModels() {
    const loader = new STLLoader();
    const {
      keySpacing,
      groupScale,
      materials,
      whiteKeys,
      blackKeys,
      blackKeyScale,
      blackKeyPosition,
    } = PIANO_CONFIG;

    this.keysGroup = new THREE.Group();
    this.keysGroup.scale.setScalar(groupScale);
    this.scene.add(this.keysGroup);

    const materialWhite = new THREE.MeshStandardMaterial(materials.white);
    const materialBlack = new THREE.MeshPhysicalMaterial(materials.black);

    whiteKeys.forEach((keyDef) => {
      loader.load(`./mesh/${keyDef.file}`, (geometry) => {
        geometry.computeVertexNormals();
        geometry.center();
        const mesh = new THREE.Mesh(geometry, materialWhite);
        mesh.position.set(keyDef.xIndex * keySpacing, 0, 0);
        mesh.rotation.x = -Math.PI / 2;
        this.keysGroup.add(mesh);
        // store back-reference on mesh for raycaster
        mesh.userData = { note: keyDef.note };
        this.keys.push({ note: keyDef.note, mesh, restingY: mesh.position.y });
      });
    });

    blackKeys.forEach((keyDef) => {
      loader.load("./mesh/black key.stl", (geometry) => {
        geometry.computeVertexNormals();
        geometry.center();
        const mesh = new THREE.Mesh(geometry, materialBlack);
        mesh.position.set(
          keyDef.xOffset * keySpacing,
          blackKeyPosition.y,
          blackKeyPosition.z,
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.set(...blackKeyScale);
        mesh.userData = { note: keyDef.note };
        this.keysGroup.add(mesh);
        this.keys.push({ note: keyDef.note, mesh, restingY: mesh.position.y });
      });
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onPointerDown(event) {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the picking ray with the camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Calculate objects intersecting the picking ray
    // Intersect only with meshes inside keysGroup
    const intersects = this.raycaster.intersectObjects(
      this.keysGroup.children,
      false,
    );

    if (intersects.length > 0) {
      // The first intersected object is the closest one
      const hitMesh = intersects[0].object;
      const note = hitMesh.userData.note;
      if (note) {
        // Dispatch a custom event so the main app can integrate it with Firebase/Audio seamlessly
        const pianoEvent = new CustomEvent("piano3d-keypress", {
          detail: { note },
        });
        window.dispatchEvent(pianoEvent);
      }
    }
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
