import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { WoodNodeMaterial } from "three/addons/materials/WoodNodeMaterial.js";
import { PianoKeyEffects } from "./pianoKeyEffects.js";

const PIANO_CONFIG = {
  keySpacing: 20.5,
  groupScale: 1.9,
  groupRotationX: Math.PI / 8,
  materials: {
    white: {
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0.0,
      envMapIntensity: 0.8,
    },
    black: {
      color: 0x0a0a0a,
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 0.22,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.45,
    },
  },
  whiteKeys: [
    { note: "C", file: "Left Piano Key.stl", xIndex: -3 },
    { note: "D", file: "Middle Piano Key.stl", xIndex: -2 },
    { note: "E", file: "Right Piano Key.stl", xIndex: -1 },
    { note: "F", file: "Left Piano Key.stl", xIndex: 0 },
    { note: "G", file: "Middle Piano Key.stl", xIndex: 1 },
    { note: "A", file: "Middle Piano Key.stl", xIndex: 2 },
    { note: "B", file: "Right Piano Key.stl", xIndex: 3 },
  ],
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
  leftUIRatio: 0,
};

export class Piano3D {
  constructor(container) {
    this.container = container;
    this.keys = [];
    this.clickableMeshes = [];
    this.brightHighlightPalette = [
      0x5e102b, 0x5c3200, 0x544600, 0x144726, 0x083f43, 0x163268, 0x432668,
      0x5c2940,
    ];
    this.init();
  }

  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const { width, height } = this._getViewportBounds();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 150, 200);

    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.background = "transparent";
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    await this.renderer.init();

    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.zIndex = "-1";
    this._applyRendererLayout();
    this.container.appendChild(this.renderer.domElement);

    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.target.set(0, -30, 0);
    controls.update();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(0, 150, 50);
    this.scene.add(dirLight);

    const reflectionLight = new THREE.DirectionalLight(0xffffff, 0.55);
    reflectionLight.position.set(20, 50, 80);
    this.scene.add(reflectionLight);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment()).texture;
    this.scene.environment = envTexture;
    pmremGenerator.dispose();

    this.loadModels();

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
    this.baseGroupScale = groupScale;
    this.keysGroup.rotation.x = groupRotationX;
    this.keysGroup.position.y = -25;
    this._updateResponsivePianoScale();

    const worldWidth = this._getWorldWidthAtZ(this.camera.position.z);
    this.keysGroup.position.x += worldWidth * (leftUIRatio / 3);
    this.scene.add(this.keysGroup);

    this.effects = new PianoKeyEffects(this.keysGroup, {
      palette: this.brightHighlightPalette,
    });

    const materialWhite = new THREE.MeshStandardMaterial(materials.white);
    const materialBlack = new THREE.MeshPhysicalMaterial(materials.black);

    const whiteKeyLoads = whiteKeys.map((keyDef) =>
      loader.loadAsync(`./mesh/${keyDef.file}`).then((geometry) => {
        const mesh = this._buildKeyMesh(geometry, materialWhite, keyDef.note);
        mesh.position.set(keyDef.xIndex * keySpacing, 0, 0);
        mesh.userData.baseScale = mesh.scale.clone();

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
        mesh.userData.baseScale = mesh.scale.clone();

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
      this.keys.forEach((keyObj) => this.effects.ensureEffect(keyObj));
    });
  }

  onWindowResize() {
    this._applyRendererLayout();
    this._updateResponsivePianoScale();
  }

  onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(
      this.clickableMeshes,
      false,
    );
    if (!intersects.length) return;

    const note = intersects[0].object.userData.note;
    if (!note) return;

    const pianoEvent = new CustomEvent("piano3d-keypress", {
      detail: { note },
    });
    window.dispatchEvent(pianoEvent);
  }

  pressKey(note) {
    const keyObj = this.keys.find((k) => k.note === note);
    if (!keyObj?.mesh || !this.effects) return;
    this.effects.trigger(keyObj);
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    if (this.effects) this.effects.update(performance.now());
    this.renderer.render(this.scene, this.camera);
  }

  _buildKeyMesh(geometry, material, note) {
    geometry.computeVertexNormals();
    geometry.center();
    geometry.computeBoundingBox();

    const keyMaterial = material.clone();
    if (keyMaterial.emissive) {
      keyMaterial.emissive.set(0x000000);
      keyMaterial.emissiveIntensity = 0;
    }

    const mesh = new THREE.Mesh(geometry, keyMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData = { note };
    return mesh;
  }

  _buildBodyMesh(geometry) {
    geometry.computeVertexNormals();
    geometry.center();
    geometry.computeBoundingBox();

    const material = WoodNodeMaterial.fromPreset("walnut", "semigloss");
    const mesh = new THREE.Mesh(geometry, material);
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

  getKeyScreenPosition(keyObj) {
    const worldPos = new THREE.Vector3();
    keyObj.mesh.getWorldPosition(worldPos);

    const ndc = worldPos.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();

    const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
    return { x, y };
  }

  getAllKeyScreenPositions() {
    return this.keys.map((k) => ({
      note: k.note,
      ...this.getKeyScreenPosition(k),
    }));
  }

  _getViewportBounds() {
    const width = window.innerWidth * 0.8;
    const height = window.innerHeight;
    const left = window.innerWidth * 0.2;
    return { left, top: 0, width, height };
  }

  _applyRendererLayout() {
    const { left, top, width, height } = this._getViewportBounds();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.left = `${left}px`;
    this.renderer.domElement.style.top = `${top}px`;
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
  }

  _updateResponsivePianoScale() {
    if (!this.keysGroup || !this.baseGroupScale) return;

    const { width } = this._getViewportBounds();
    const scaleFactor = THREE.MathUtils.clamp(width / 1200, 0.8, 1.15);
    this.keysGroup.scale.setScalar(this.baseGroupScale * scaleFactor);
  }

  _getWorldWidthAtZ(z) {
    const vFOV = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(vFOV / 2) * Math.abs(z);
    return height * this.camera.aspect;
  }
}
