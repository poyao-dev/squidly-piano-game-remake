import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const PIANO_CONFIG = {
  keySpacing: 20.5,
  groupScale: 1.5,
  groupRotationX: Math.PI / 8,
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
    { note: "Db", xOffset: -2.5 },
    { note: "Eb", xOffset: -1.5 },
    { note: "Gb", xOffset: 0.5 },
    { note: "Ab", xOffset: 1.5 },
    { note: "Bb", xOffset: 2.5 },
  ],
  blackKeyScale: [1.2, 0.9, 0.4],
  blackKeyPosition: { y: 8, z: -13 },
  body: {
    file: "piano body.stl",
    yOffset: 60,
    zOffset: -20,
    widthPadding: 28,
    depthPadding: 40,
    topGap: 8,
  },
  leftUIRatio: 0.2,
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
      groupRotationX,
      materials,
      whiteKeys,
      blackKeys,
      blackKeyScale,
      blackKeyPosition,
      body,
      leftUIRatio,
    } = PIANO_CONFIG;

    this.keysGroup = new THREE.Group();
    this.clickableMeshes = [];
    this.keysGroup.scale.setScalar(groupScale);
    this.keysGroup.rotation.x = groupRotationX;
    const worldWidth = this._getWorldWidthAtZ(this.camera.position.z);
    // shift by half of the UI portion (because center moves)
    const shiftX = worldWidth * (leftUIRatio / 3);

    this.keysGroup.position.x += shiftX;
    this.scene.add(this.keysGroup);

    const materialWhite = new THREE.MeshStandardMaterial(materials.white);
    const materialBlack = new THREE.MeshPhysicalMaterial(materials.black);

    const whiteKeyLoads = whiteKeys.map((keyDef) =>
      loader.loadAsync(`./mesh/${keyDef.file}`).then((geometry) => {
        const mesh = this._buildKeyMesh(geometry, materialWhite, keyDef.note);
        mesh.position.set(keyDef.xIndex * keySpacing, 0, 0);
        this.keysGroup.add(mesh);
        this.clickableMeshes.push(mesh);
        this.keys.push({ note: keyDef.note, mesh, restingY: mesh.position.y });
      }),
    );

    const blackKeyLoads = blackKeys.map((keyDef) =>
      loader.loadAsync("./mesh/black key.stl").then((geometry) => {
        const mesh = this._buildKeyMesh(geometry, materialBlack, keyDef.note);
        mesh.position.set(
          keyDef.xOffset * keySpacing,
          blackKeyPosition.y,
          blackKeyPosition.z,
        );
        mesh.scale.set(...blackKeyScale);
        this.keysGroup.add(mesh);
        this.clickableMeshes.push(mesh);
        this.keys.push({ note: keyDef.note, mesh, restingY: mesh.position.y });
      }),
    );

    const bodyLoad = loader
      .loadAsync(`./mesh/${body.file}`)
      .then((geometry) => {
        this.bodyMesh = this._buildBodyMesh(geometry);
        this.keysGroup.add(this.bodyMesh);
      });

    Promise.all([...whiteKeyLoads, ...blackKeyLoads, bodyLoad]).then(() => {
      this._placeBodyMesh();
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
      this.clickableMeshes,
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

  _buildKeyMesh(geometry, material, note) {
    geometry.computeVertexNormals();
    geometry.center();
    geometry.computeBoundingBox();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData = { note };
    return mesh;
  }

  _buildBodyMesh(geometry) {
    geometry.computeVertexNormals();
    geometry.center();
    geometry.computeBoundingBox();

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: 0xead8bd,
        roughness: 0.45,
        metalness: 0.05,
        clearcoat: 0.2,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  _placeBodyMesh() {
    if (!this.bodyMesh || !this.keys.length) return;

    const { body } = PIANO_CONFIG;
    const keyBounds = new THREE.Box3();

    this.keys.forEach(({ mesh }) => {
      mesh.updateMatrix();
      const meshBounds = mesh.geometry.boundingBox
        .clone()
        .applyMatrix4(mesh.matrix);
      keyBounds.union(meshBounds);
    });

    this.bodyMesh.scale.set(1, 1, 1);
    this.bodyMesh.updateMatrix();

    const bodyBounds = this.bodyMesh.geometry.boundingBox
      .clone()
      .applyMatrix4(this.bodyMesh.matrix);
    const keySize = keyBounds.getSize(new THREE.Vector3());
    const keyCenter = keyBounds.getCenter(new THREE.Vector3());
    const bodySize = bodyBounds.getSize(new THREE.Vector3());

    const scaleX = (keySize.x + body.widthPadding) / bodySize.x;
    const scaleZ = (keySize.z + body.depthPadding) / bodySize.z;

    this.bodyMesh.scale.set(scaleX, 1, scaleZ);
    this.bodyMesh.updateMatrix();

    const scaledBodyBounds = this.bodyMesh.geometry.boundingBox
      .clone()
      .applyMatrix4(this.bodyMesh.matrix);

    this.bodyMesh.position.set(
      keyCenter.x,
      keyBounds.min.y - scaledBodyBounds.max.y + body.topGap + body.yOffset,
      keyCenter.z + body.zOffset,
    );
  }

  // Add this method to the Piano3D class

  /**
   * Projects a 3D key's world position to 2D screen coordinates.
   * Returns { x, y } in pixels relative to the viewport.
   */
  getKeyScreenPosition(keyObj) {
    const worldPos = new THREE.Vector3();
    keyObj.mesh.getWorldPosition(worldPos);

    // Project 3D → NDC (normalized device coordinates)
    const ndc = worldPos.clone().project(this.camera);

    // NDC → screen pixels
    const x = (ndc.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-ndc.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y };
  }

  /**
   * Returns screen positions for all keys.
   * Call this after models have loaded and on each resize.
   */
  getAllKeyScreenPositions() {
    return this.keys.map((k) => ({
      note: k.note,
      ...this.getKeyScreenPosition(k),
    }));
  }

  _getWorldWidthAtZ(z) {
    const vFOV = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(vFOV / 2) * Math.abs(z);
    const width = height * this.camera.aspect;
    return width;
  }
}
