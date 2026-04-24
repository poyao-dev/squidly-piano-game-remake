import * as THREE from "three";

/**
 * Small helper focused only on key press visual effects:
 * - outline pulse
 * - particle burst
 * - key squash
 * - emissive/color highlight updates
 *
 * Keep this module intentionally narrow so Piano3D stays readable.
 */
export class PianoKeyEffects {
  constructor(keysGroup, options = {}) {
    this.keysGroup = keysGroup;
    this.effectsByNote = new Map();
    this.animationsByNote = new Map();

    this.palette = options.palette || [
      0x5e102b, 0x5c3200, 0x544600, 0x144726, 0x083f43, 0x163268, 0x432668,
      0x5c2940,
    ];

    this.particleCount = options.particleCount ?? 10;
    this.keyPressDepth = options.keyPressDepth ?? 5;
    this.durationMs = options.durationMs ?? 260;
  }

  trigger(keyObj) {
    if (!keyObj?.note || !keyObj?.mesh) return;

    const highlightColor =
      this.palette[Math.floor(Math.random() * this.palette.length)];

    const effect = this.ensureEffect(keyObj);
    this._activateEffect(effect, keyObj, highlightColor);

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

      // Key movement
      keyObj.mesh.position.y = keyObj.restingY - this.keyPressDepth * pulse;

      // Emissive glow
      if (keyObj.mesh.material?.emissive) {
        keyObj.mesh.material.emissive.copy(highlight);
        keyObj.mesh.material.emissiveIntensity =
          (isWhiteKey ? 0.7 : 0.9) * pulse;
      }

      // White key tint
      if (isWhiteKey && keyObj.mesh.material?.color) {
        keyObj.mesh.material.color.copy(
          new THREE.Color(0xffffff).lerp(highlight, 0.55 * pulse),
        );
      }

      // Outline + particles + squash
      this._updateEffect(effect, keyObj, highlightColor, pulse, progress);
      const squash = 1 + pulse * 0.035;
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
  }

  ensureEffect(keyObj) {
    if (this.effectsByNote.has(keyObj.note)) {
      return this.effectsByNote.get(keyObj.note);
    }

    const outlineGeometry = new THREE.EdgesGeometry(keyObj.mesh.geometry, 12);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });

    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    outline.visible = false;
    outline.renderOrder = 999;
    outline.scale.setScalar(1.03);
    keyObj.mesh.add(outline);

    const particles = [];
    const particleGeometry = new THREE.SphereGeometry(0.9, 8, 8);

    for (let i = 0; i < this.particleCount; i++) {
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });

      const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
      mesh.visible = false;
      mesh.renderOrder = 999;
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
      particle.speed = 14 + Math.random() * 18;
      particle.rise = 10 + Math.random() * 16;
      particle.hue =
        (index / effect.particles.length + Math.random() * 0.08) % 1;

      particle.mesh.visible = true;
      particle.mesh.material.color.setHSL(particle.hue, 0.95, 0.55);
      particle.mesh.material.opacity = 1;
    });
  }

  _updateEffect(effect, keyObj, highlightColor, pulse, progress) {
    const origin = this._getGlowOrigin(keyObj);

    effect.outline.visible = true;
    effect.outline.material.color.set(highlightColor);
    effect.outline.material.opacity = Math.max(0, 1 - progress);
    effect.outline.scale.setScalar(1.03 + pulse * 0.08);

    effect.particles.forEach((particle) => {
      const drift = particle.speed * progress;
      const hueShift = (particle.hue + progress * 0.25) % 1;

      particle.mesh.position.set(
        origin.x + Math.cos(particle.angle) * drift,
        origin.y + particle.rise * progress + 6 * pulse,
        origin.z + Math.sin(particle.angle) * drift,
      );

      particle.mesh.scale.setScalar(1.4 * (1 - progress) + 0.15);
      particle.mesh.material.color.setHSL(hueShift, 0.95, 0.55);
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
    effect.outline.scale.setScalar(1.03);

    effect.particles.forEach((particle) => {
      particle.mesh.visible = false;
      particle.mesh.material.opacity = 0;
    });

    keyObj.mesh.scale.copy(baseScale);
  }

  _getGlowOrigin(keyObj) {
    const isWhiteKey = keyObj.note.length === 1;
    const pos = keyObj.mesh.position.clone();

    pos.y += isWhiteKey ? 12 : 9;
    pos.z += isWhiteKey ? -4 : 0;

    return pos;
  }
}
