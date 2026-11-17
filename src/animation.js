// Plays the animation clips that come with a glTF / FBX model.
import * as THREE from 'three';

export class AnimationPlayer {
  /**
   * @param {THREE.Object3D} root  the loaded model
   * @param {THREE.AnimationClip[]} clips  its animations (empty ones are skipped)
   */
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips.filter((c) => c.duration > 0);
    this.playing = true; // start playing straight away, like a video
    this.action = null;
    this.index = -1;
    if (this.clips.length) this.select(0);
  }

  get hasClips() {
    return this.clips.length > 0;
  }

  get duration() {
    return this.clips[this.index]?.duration ?? 0;
  }

  get time() {
    return this.action?.time ?? 0;
  }

  /** Switch to clip `i` and start it from the beginning. */
  select(i) {
    this.action?.stop();
    this.index = i;
    this.action = this.mixer.clipAction(this.clips[i]);
    this.action.reset().play();
  }

  toggle() {
    this.playing = !this.playing;
  }

  /** Jump to `t` seconds (timeline slider). */
  seek(t) {
    if (!this.action) return;
    this.action.time = t;
    this.mixer.update(0);
  }

  update(dt) {
    if (this.playing) this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
