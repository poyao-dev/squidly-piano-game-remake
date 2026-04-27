import * as THREE from "three";

const PIANO_KEY_EFFECTS_CONFIG = {
  palette: [
    0x5e102b, 0x5c3200, 0x544600, 0x144726, 0x083f43, 0x163268, 0x432668,
    0x5c2940,
  ],
  particleCount: 10,
  keyPressDepth: 5,
  durationMs: 260,
  noteCount: 16,
  notesPerTrigger: 4,
  noteBurst: {
    angleSpread: Math.PI * 0.8,
    horizontalSpeedMin: 0.9,
    horizontalSpeedRange: 1.4,
    verticalSpeedMin: 1.8,
    verticalSpeedRange: 2.2,
    depthVelocityFactor: 0.3,
    gravity: 0.015,
    decayMin: 0.006,
    decayRange: 0.006,
    rotationSpeedRange: 0.08,
    scale: 8,
    maxDeltaTime: 50,
    deltaScale: 0.06,
  },
  outline: {
    baseScale: 1.03,
    pulseScale: 0.08,
    thresholdAngle: 12,
    renderOrder: 999,
  },
  particles: {
    geometryRadius: 0.9,
    geometryWidthSegments: 8,
    geometryHeightSegments: 8,
    speedMin: 14,
    speedRange: 18,
    riseMin: 10,
    riseRange: 16,
    hueJitter: 0.08,
    hueShiftSpeed: 0.25,
    saturation: 0.95,
    lightness: 0.55,
    scaleStart: 1.4,
    scaleEnd: 0.15,
    pulseLift: 6,
    renderOrder: 999,
  },
  whiteKey: {
    emissiveIntensity: 0.7,
    colorLerp: 0.55,
    glowYOffset: 12,
    glowZOffset: -4,
  },
  blackKey: {
    emissiveIntensity: 0.9,
    glowYOffset: 9,
    glowZOffset: 0,
  },
  squash: {
    amount: 0.035,
  },
};

/**
 * Key press visual effects:
 * - outline pulse
 * - particle burst
 * - key squash
 * - emissive/color highlight updates
 * - flying note sprite burst
 */
export class PianoKeyEffects {
  constructor(keysGroup, options = {}) {
    this.keysGroup = keysGroup;
    this.scene = options.scene || keysGroup;
    this.effectsByNote = new Map();
    this.animationsByNote = new Map();
    this.activeNotes = [];
    this.noteTextures = [];
    this._lastNoteUpdateTime = null;

    this.config = {
      ...PIANO_KEY_EFFECTS_CONFIG,
      ...options,
      noteBurst: {
        ...PIANO_KEY_EFFECTS_CONFIG.noteBurst,
        ...(options.noteBurst || {}),
      },
      outline: {
        ...PIANO_KEY_EFFECTS_CONFIG.outline,
        ...(options.outline || {}),
      },
      particles: {
        ...PIANO_KEY_EFFECTS_CONFIG.particles,
        ...(options.particles || {}),
      },
      whiteKey: {
        ...PIANO_KEY_EFFECTS_CONFIG.whiteKey,
        ...(options.whiteKey || {}),
      },
      blackKey: {
        ...PIANO_KEY_EFFECTS_CONFIG.blackKey,
        ...(options.blackKey || {}),
      },
      squash: {
        ...PIANO_KEY_EFFECTS_CONFIG.squash,
        ...(options.squash || {}),
      },
    };

    this.palette = this.config.palette;
    this.particleCount = this.config.particleCount;
    this.keyPressDepth = this.config.keyPressDepth;
    this.durationMs = this.config.durationMs;
    this.noteCount = this.config.noteCount;
    this.notesPerTrigger = this.config.notesPerTrigger;

    this._loadNoteTextures();
  }

  trigger(keyObj) {
    if (!keyObj?.note || !keyObj?.mesh) return;

    const highlightColor =
      this.palette[Math.floor(Math.random() * this.palette.length)];

    const effect = this.ensureEffect(keyObj);
    this._activateEffect(effect, keyObj, highlightColor);
    this._triggerNoteBurst(keyObj);

    this.animationsByNote.set(keyObj.note, {
      keyObj,
      startTime: performance.now(),
      duration: this.durationMs,
      highlightColor,
      effect,
    });
  }

  update(now = performance.now()) {
    this.animationsByNote.forEach((animation, note) => {
      const { keyObj, startTime, duration, highlightColor, effect } = animation;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const pulse = Math.sin(progress * Math.PI);
      const isWhiteKey = keyObj.note.length === 1;
      const highlight = new THREE.Color(highlightColor);
      const baseScale =
        keyObj.mesh.userData.baseScale || new THREE.Vector3(1, 1, 1);

      keyObj.mesh.position.y = keyObj.restingY - this.keyPressDepth * pulse;

      if (keyObj.mesh.material?.emissive) {
        keyObj.mesh.material.emissive.copy(highlight);
        keyObj.mesh.material.emissiveIntensity =
          (isWhiteKey
            ? this.config.whiteKey.emissiveIntensity
            : this.config.blackKey.emissiveIntensity) * pulse;
      }

      if (isWhiteKey && keyObj.mesh.material?.color) {
        keyObj.mesh.material.color.copy(
          new THREE.Color(0xffffff).lerp(
            highlight,
            this.config.whiteKey.colorLerp * pulse,
          ),
        );
      }

      this._updateEffect(effect, keyObj, highlightColor, pulse, progress);

      const squash = 1 + pulse * this.config.squash.amount;
      keyObj.mesh.scale.set(
        baseScale.x * squash,
        baseScale.y,
        baseScale.z * squash,
      );

      if (progress >= 1) {
        this._resetKeyVisuals(keyObj, effect, isWhiteKey, baseScale);
        this.animationsByNote.delete(note);
      }
    });

    this._updateFlyingNotes(now);
  }

  ensureEffect(keyObj) {
    if (this.effectsByNote.has(keyObj.note)) {
      return this.effectsByNote.get(keyObj.note);
    }

    const outlineGeometry = new THREE.EdgesGeometry(
      keyObj.mesh.geometry,
      this.config.outline.thresholdAngle,
    );
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });

    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    outline.visible = false;
    outline.renderOrder = this.config.outline.renderOrder;
    outline.scale.setScalar(this.config.outline.baseScale);
    keyObj.mesh.add(outline);

    const particles = [];
    const particleGeometry = new THREE.SphereGeometry(
      this.config.particles.geometryRadius,
      this.config.particles.geometryWidthSegments,
      this.config.particles.geometryHeightSegments,
    );

    for (let i = 0; i < this.particleCount; i++) {
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });

      const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
      mesh.visible = false;
      mesh.renderOrder = this.config.particles.renderOrder;
      this.keysGroup.add(mesh);

      particles.push({
        mesh,
        angle: 0,
        speed: 0,
        rise: 0,
        hue: 0,
      });
    }

    const effect = { outline, particles };
    this.effectsByNote.set(keyObj.note, effect);
    return effect;
  }

  _activateEffect(effect, keyObj, highlightColor) {
    effect.outline.visible = true;
    effect.outline.material.color.set(highlightColor);

    effect.particles.forEach((particle, index) => {
      particle.angle = Math.random() * Math.PI * 2;
      particle.speed =
        this.config.particles.speedMin +
        Math.random() * this.config.particles.speedRange;
      particle.rise =
        this.config.particles.riseMin +
        Math.random() * this.config.particles.riseRange;
      particle.hue =
        (index / effect.particles.length +
          Math.random() * this.config.particles.hueJitter) %
        1;

      particle.mesh.visible = true;
      particle.mesh.material.color.setHSL(
        particle.hue,
        this.config.particles.saturation,
        this.config.particles.lightness,
      );
      particle.mesh.material.opacity = 1;
    });
  }

  _updateEffect(effect, keyObj, highlightColor, pulse, progress) {
    const origin = this._getGlowOrigin(keyObj);

    effect.outline.visible = true;
    effect.outline.material.color.set(highlightColor);
    effect.outline.material.opacity = Math.max(0, 1 - progress);
    effect.outline.scale.setScalar(
      this.config.outline.baseScale + pulse * this.config.outline.pulseScale,
    );

    effect.particles.forEach((particle) => {
      const drift = particle.speed * progress;
      const hueShift =
        (particle.hue + progress * this.config.particles.hueShiftSpeed) % 1;

      particle.mesh.position.set(
        origin.x + Math.cos(particle.angle) * drift,
        origin.y +
          particle.rise * progress +
          this.config.particles.pulseLift * pulse,
        origin.z + Math.sin(particle.angle) * drift,
      );

      particle.mesh.scale.setScalar(
        this.config.particles.scaleStart * (1 - progress) +
          this.config.particles.scaleEnd,
      );
      particle.mesh.material.color.setHSL(
        hueShift,
        this.config.particles.saturation,
        this.config.particles.lightness,
      );
      particle.mesh.material.opacity = Math.max(0, 1 - progress);
    });
  }

  _resetKeyVisuals(keyObj, effect, isWhiteKey, baseScale) {
    keyObj.mesh.position.y = keyObj.restingY;

    if (keyObj.mesh.material?.emissive) {
      keyObj.mesh.material.emissiveIntensity = 0;
    }

    if (isWhiteKey && keyObj.mesh.material?.color) {
      keyObj.mesh.material.color.set(0xffffff);
    }

    effect.outline.visible = false;
    effect.outline.material.opacity = 0;
    effect.outline.scale.setScalar(this.config.outline.baseScale);

    effect.particles.forEach((particle) => {
      particle.mesh.visible = false;
      particle.mesh.material.opacity = 0;
    });

    keyObj.mesh.scale.copy(baseScale);
  }

  _getGlowOrigin(keyObj) {
    const isWhiteKey = keyObj.note.length === 1;
    const pos = keyObj.mesh.position.clone();

    pos.y += isWhiteKey
      ? this.config.whiteKey.glowYOffset
      : this.config.blackKey.glowYOffset;
    pos.z += isWhiteKey
      ? this.config.whiteKey.glowZOffset
      : this.config.blackKey.glowZOffset;

    return pos;
  }

  async _loadNoteTextures() {
    const textureLoader = new THREE.TextureLoader();
    const loadPromises = [];

    for (let i = 1; i <= this.noteCount; i++) {
      const promise = new Promise((resolve) => {
        textureLoader.load(
          `./images/note-${i}.png`,
          (texture) => {
            this.noteTextures.push(texture);
            resolve();
          },
          undefined,
          () => resolve(),
        );
      });
      loadPromises.push(promise);
    }

    await Promise.all(loadPromises);
  }

  _triggerNoteBurst(keyObj) {
    if (!keyObj?.mesh || this.noteTextures.length === 0) return;

    const origin = new THREE.Vector3();
    keyObj.mesh.getWorldPosition(origin);

    const isWhiteKey = keyObj.note.length === 1;
    origin.y += isWhiteKey
      ? this.config.whiteKey.glowYOffset
      : this.config.blackKey.glowYOffset;
    origin.z += isWhiteKey
      ? this.config.whiteKey.glowZOffset
      : this.config.blackKey.glowZOffset;

    for (let i = 0; i < this.notesPerTrigger; i++) {
      this._spawnFlyingNote(origin.clone());
    }
  }

  _spawnFlyingNote(origin) {
    const texture =
      this.noteTextures[Math.floor(Math.random() * this.noteTextures.length)];

    if (!texture) return;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(origin);
    sprite.scale.set(
      this.config.noteBurst.scale,
      this.config.noteBurst.scale,
      1,
    );

    const angle = (Math.random() - 0.5) * this.config.noteBurst.angleSpread;
    const horizontalSpeed =
      this.config.noteBurst.horizontalSpeedMin +
      Math.random() * this.config.noteBurst.horizontalSpeedRange;
    const verticalSpeed =
      this.config.noteBurst.verticalSpeedMin +
      Math.random() * this.config.noteBurst.verticalSpeedRange;

    const note = {
      sprite,
      velocity: new THREE.Vector3(
        Math.sin(angle) * horizontalSpeed,
        verticalSpeed,
        Math.cos(angle) *
          horizontalSpeed *
          this.config.noteBurst.depthVelocityFactor,
      ),
      life: 1.0,
      decay:
        this.config.noteBurst.decayMin +
        Math.random() * this.config.noteBurst.decayRange,
      rotationSpeed:
        (Math.random() - 0.5) * this.config.noteBurst.rotationSpeedRange,
    };

    this.scene.add(sprite);
    this.activeNotes.push(note);
  }

  _updateFlyingNotes(now) {
    if (this._lastNoteUpdateTime == null) {
      this._lastNoteUpdateTime = now;
      return;
    }

    const deltaTime = Math.min(
      now - this._lastNoteUpdateTime,
      this.config.noteBurst.maxDeltaTime,
    );
    this._lastNoteUpdateTime = now;

    for (let i = this.activeNotes.length - 1; i >= 0; i--) {
      const note = this.activeNotes[i];

      note.sprite.position.add(
        note.velocity
          .clone()
          .multiplyScalar(deltaTime * this.config.noteBurst.deltaScale),
      );

      note.velocity.y -=
        this.config.noteBurst.gravity *
        deltaTime *
        this.config.noteBurst.deltaScale;
      note.life -= note.decay * deltaTime * this.config.noteBurst.deltaScale;

      const fade = Math.max(0, note.life);
      note.sprite.material.opacity = fade;
      note.sprite.material.rotation +=
        note.rotationSpeed * deltaTime * this.config.noteBurst.deltaScale;

      if (note.life <= 0) {
        this.scene.remove(note.sprite);
        note.sprite.material.dispose();
        this.activeNotes.splice(i, 1);
      }
    }
  }
}
