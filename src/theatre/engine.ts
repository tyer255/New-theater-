import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  HALL_BOUNDS,
  STAGE_BOUNDS,
  SCREEN_GEOMETRY,
  SPAWN_POSE,
  SEATS,
  SeatDef,
  clamp,
  easeInOutCubic,
  smoothstep01,
  dampAngle,
  lerpAngle,
  floorHeightAt,
  findNearestSeat,
  resolveCollisions,
  computeCameraBoomDistance,
  getChordScreenDimensions,
} from './math';
import { makeRadialGlowTexture } from './textures';
import { CharacterRig } from './character';
import { MovieScreenRenderer } from './movieScreen';
import { buildTheatreHall, TheatreHallController } from './architecture';
import { TheatreAudio } from './audio';

export interface EngineUIState {
  nearSeat: string | null;
  seated: boolean;
  busy: boolean;
  seatLabel: string | null;
  streaming: boolean;
  playerStatus: 'idle' | 'loading' | 'ready' | 'stalled';
  focused: boolean;
}

export interface EngineOptions {
  mobile: boolean;
  onState: (state: EngineUIState) => void;
}

const WALK_SPEED = 2.7;
const RUN_SPEED = 4.3;

export function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class CinemaEngine {
  audio = new TheatreAudio();
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  char = new CharacterRig();
  theatre: TheatreHallController;
  movie: MovieScreenRenderer;
  container: HTMLElement;
  opts: EngineOptions;
  ro: ResizeObserver;
  isSoftwareGl: boolean;
  frameId = 0;
  disposed = false;

  lastNow = -1;
  paused = false;
  time = 0;
  keys = new Set<string>();
  joy = new THREE.Vector2();
  lookId: number | null = null;
  lastPX = 0;
  lastPY = 0;
  downX = 0;
  downY = 0;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw: number = SPAWN_POSE.yaw;
  walkPhase = 0;
  camYaw: number = SPAWN_POSE.yaw;
  camPitch = 0.27;
  camDist = 3.4;
  camPos = new THREE.Vector3();
  camLook = new THREE.Vector3();
  seatLookYaw = 0;
  seatLookPitch = 0;
  portrait = false;
  introBlend = 1;
  entered = false;
  phase: 'free' | 'sitting' | 'seated' | 'standing' = 'free';
  seat: SeatDef | null = null;
  camSeat: SeatDef | null = null;
  trans = 0;
  transDur = 0.65;
  from = new THREE.Vector3();
  to = new THREE.Vector3();
  yawFrom = 0;
  yawTo = 0;
  sitBlend = 0;
  seatCam = 0;

  dpr: number;
  maxDpr: number;
  minDpr: number;
  perfFrames = 0;
  perfTime = 0;
  goodStreak = 0;
  lastUI = '';

  css: CSS3DRenderer;
  screenFrame: HTMLIFrameElement;
  screenObj: CSS3DObject;
  screenOverlay: HTMLDivElement;
  overlayTitle: HTMLDivElement;
  overlayNote: HTMLDivElement;
  overlayPoster: HTMLDivElement;
  status: 'idle' | 'loading' | 'ready' | 'stalled' = 'idle';
  stallTimer = 0;
  streaming = false;
  interactive = false;
  focus = false;
  focusBlend = 0;
  lightsOut = 0;

  streamColors = [
    new THREE.Color(0.1, 0.12, 0.2),
    new THREE.Color(0.12, 0.12, 0.2),
    new THREE.Color(0.1, 0.11, 0.18),
  ];
  flickerSeed = [0.2, 0.5, 0.8];
  scratchColor = new THREE.Color();

  marker: THREE.Mesh;
  markerMat: THREE.MeshBasicMaterial;
  markerSeat: SeatDef | null = null;
  dim = 0;

  // Pre-allocated scratch vectors for zero-GC render loop
  v1 = new THREE.Vector3();
  v2 = new THREE.Vector3();
  v3 = new THREE.Vector3();
  v4 = new THREE.Vector3();
  v5 = new THREE.Vector3();
  v6 = new THREE.Vector3();
  v7 = new THREE.Vector3();
  v8 = new THREE.Vector3();
  v9 = new THREE.Vector3();
  v10 = new THREE.Vector3();
  v11 = new THREE.Vector3();
  v12 = new THREE.Vector3();
  v13 = new THREE.Vector3();
  v14 = new THREE.Vector3();
  v15 = new THREE.Vector3();
  v16 = new THREE.Vector3();
  v17 = new THREE.Vector3();
  ip = new THREE.Vector3();
  il = new THREE.Vector3();

  constructor(container: HTMLElement, opts: EngineOptions) {
    this.container = container;
    this.opts = opts;
    const mobile = opts.mobile;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      stencil: false,
    });

    this.maxDpr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    this.minDpr = this.isSoftwareGl ? 1 : Math.min(this.maxDpr, mobile ? 0.75 : 1);
    this.dpr = this.maxDpr;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '1';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    this.css = new CSS3DRenderer();
    const cssEl = this.css.domElement;
    cssEl.style.position = 'absolute';
    cssEl.style.inset = '0';
    cssEl.style.zIndex = '2';
    cssEl.style.pointerEvents = 'none';
    container.appendChild(cssEl);

    this.scene.background = new THREE.Color(0x020203);
    this.scene.fog = new THREE.FogExp2(0x050407, 0.02);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 80);

    this.movie = new MovieScreenRenderer(this.renderer, mobile, this.isSoftwareGl);
    this.theatre = buildTheatreHall(this.scene, this.movie.texture, {
      aniso: Math.min(this.renderer.capabilities.getMaxAnisotropy(), mobile ? 4 : 8),
      mobile,
    });
    this.scene.add(this.char.root);

    // CSS3D curved screen overlay for streaming embeds
    const chord = getChordScreenDimensions();
    const pxW = 1920;
    const pxH = Math.round((pxW * chord.h) / chord.w);
    const scale = chord.w / pxW;

    const screenDiv = document.createElement('div');
    screenDiv.style.cssText = `width:${pxW}px;height:${pxH}px;background:#000;overflow:hidden;position:relative;`;

    this.screenFrame = document.createElement('iframe');
    this.screenFrame.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#000;';
    this.screenFrame.allow =
      'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write';
    this.screenFrame.setAttribute('referrerpolicy', 'origin');
    screenDiv.appendChild(this.screenFrame);

    this.screenOverlay = document.createElement('div');
    this.screenOverlay.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:90px;background:radial-gradient(ellipse at center,#11131c 0%,#05060a 70%);color:#fff;font-family:Outfit,system-ui,sans-serif;transition:opacity .45s ease;pointer-events:none;';

    this.overlayPoster = document.createElement('div');
    this.overlayPoster.style.cssText =
      'width:420px;height:630px;border-radius:26px;background-size:cover;background-position:center;box-shadow:0 40px 120px rgba(0,0,0,.8);border:3px solid rgba(255,255,255,.14);flex:none;display:none;';

    const textCol = document.createElement('div');
    textCol.style.cssText = 'max-width:900px;';
    this.overlayTitle = document.createElement('div');
    this.overlayTitle.style.cssText =
      'font-size:92px;font-weight:700;line-height:1.05;margin-bottom:26px;';
    this.overlayNote = document.createElement('div');
    this.overlayNote.style.cssText = 'font-size:46px;opacity:.72;font-weight:400;';
    textCol.appendChild(this.overlayTitle);
    textCol.appendChild(this.overlayNote);

    this.screenOverlay.appendChild(this.overlayPoster);
    this.screenOverlay.appendChild(textCol);
    screenDiv.appendChild(this.screenOverlay);

    this.screenObj = new CSS3DObject(screenDiv);
    this.screenObj.position.set(0, chord.y, chord.z);
    this.screenObj.scale.setScalar(scale);
    this.screenObj.visible = false;
    this.scene.add(this.screenObj);

    this.markerMat = new THREE.MeshBasicMaterial({
      map: makeRadialGlowTexture(),
      color: 0xffa040,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -6,
    });
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), this.markerMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 2;
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.pos.set(SPAWN_POSE.pos.x, SPAWN_POSE.pos.y, SPAWN_POSE.pos.z);
    this.yaw = SPAWN_POSE.yaw;
    this.camYaw = SPAWN_POSE.yaw;
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;

    const intro = this.introPose(0);
    this.camPos.copy(intro.pos);
    this.camLook.copy(intro.look);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContext);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.scheduleNextFrame();
  }

  private afterDraw(cb: () => void) {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(this.tick, 16);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  enter() {
    if (!this.entered) {
      this.entered = true;
      this.audio.start();
    }
  }

  setJoystick(x: number, y: number) {
    this.joy.set(x, y);
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
    if (!muted && this.entered && !this.audio.started) {
      this.audio.start();
    }
  }

  toggleSit() {
    if (!this.entered) return;
    if (this.phase === 'free') {
      const seat = this.nearestSeat();
      if (!seat) return;
      this.sitOn(seat);
    } else if (this.phase === 'seated' && this.seat) {
      this.phase = 'standing';
      this.trans = 0;
      this.from.copy(this.pos);
      this.to.set(this.seat.standPos.x, this.seat.standPos.y, this.seat.standPos.z);
      this.yawFrom = this.yaw;
      this.yawTo = Math.PI;
      this.focus = false;
    }
  }

  sitOn(seat: SeatDef) {
    this.seat = seat;
    this.camSeat = seat;
    this.phase = 'sitting';
    this.trans = 0;
    this.from.copy(this.pos);
    this.to.set(seat.sitPos.x, seat.sitPos.y, seat.sitPos.z);
    this.transDur = clamp(0.65 + this.from.distanceTo(this.to) * 0.16, 0.65, 2.2);
    this.yawFrom = this.yaw;
    this.yawTo = Math.PI;
    this.vel.set(0, 0, 0);
    this.joy.set(0, 0);
    this.seatLookYaw = 0;
    this.seatLookPitch = 0;
    this.audio.thump();
  }

  ensureSeated() {
    if (!this.entered || this.phase !== 'free') return;
    let best = SEATS[2];
    let bestDist = Infinity;
    for (const s of SEATS) {
      const d = Math.hypot(this.pos.x - s.x, this.pos.z - s.z);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    this.sitOn(best);
  }

  playOnScreen(url: string | null, meta?: { title?: string; poster?: string | null }) {
    const active = !!url;
    const sameUrl = active && this.streaming && !!url && this.screenFrame.src === url;
    if (active && !sameUrl) {
      this.overlayTitle.textContent = meta?.title ?? 'Starting…';
      this.overlayNote.textContent = 'Loading the feed…';
      this.overlayPoster.style.backgroundImage = meta?.poster ? `url("${meta.poster}")` : '';
      this.overlayPoster.style.display = meta?.poster ? 'block' : 'none';
      this.screenOverlay.style.opacity = '1';
      this.status = 'loading';
      this.stallTimer = 0;
      this.screenFrame.onload = () => {
        if (this.status === 'loading') {
          this.status = 'ready';
          this.screenOverlay.style.opacity = '0';
        }
      };
      if (this.screenFrame.src !== url) {
        this.screenFrame.src = url!;
      }
    } else if (!active) {
      this.screenFrame.onload = null;
      if (this.screenFrame.src && this.screenFrame.src !== 'about:blank') {
        this.screenFrame.src = 'about:blank';
      }
      this.status = 'idle';
      this.setScreenFocus(false);
    }
    this.audio.setMusicDucked(active);
    if (active !== this.streaming) {
      this.streaming = active;
      this.screenObj.visible = active;
      this.theatre.setStreaming(active);
      if (!active) this.setPlayerInteractive(false);
    }
  }

  setScreenFocus(focused: boolean) {
    this.focus = focused && this.streaming;
    if (!this.focus) {
      this.seatLookYaw = 0;
      this.seatLookPitch = 0;
    }
  }

  get screenFocused() {
    return this.focus;
  }

  get musicDucked() {
    return this.audio.isMusicDucked;
  }

  focusPose(posOut: THREE.Vector3, lookOut: THREE.Vector3) {
    const chord = getChordScreenDimensions();
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distV = (chord.h * 0.64) / Math.tan(vFov / 2);
    const distH = (chord.w * 0.6) / Math.tan(hFov / 2);
    const dist = Math.min(Math.max(distV, distH), 14);
    posOut.set(0, chord.y - 0.35, Math.min(chord.z + dist, 6.4));
    lookOut.set(this.seatLookYaw * 6, chord.y - 0.05 + this.seatLookPitch * 4, chord.z - 0.5);
  }

  setPlayerInteractive(interactive: boolean) {
    this.interactive = interactive && this.streaming;
    this.css.domElement.style.pointerEvents = this.interactive ? 'auto' : 'none';
    this.renderer.domElement.style.pointerEvents = this.interactive ? 'none' : 'auto';
    if (this.interactive) {
      this.keys.clear();
      this.joy.set(0, 0);
      this.lookId = null;
    }
  }

  get playerInteractive() {
    return this.interactive;
  }

  updateStreamLight(dt: number) {
    const t = this.time;
    for (let i = 0; i < 3; i++) {
      const seed = this.flickerSeed[i];
      const wave = 0.5 + 0.5 * Math.sin(t * (0.21 + seed * 0.13) + seed * 7);
      const lum =
        0.035 + 0.065 * (0.55 + 0.45 * Math.sin(t * (1.7 + seed) + Math.sin(t * 0.7 + seed * 3) * 2));
      this.scratchColor.setRGB(
        lum * (0.75 + wave * 0.5),
        lum * (0.8 + wave * 0.2),
        lum * (1.25 - wave * 0.35)
      );
      this.streamColors[i].lerp(this.scratchColor, 1 - Math.exp(-dt * 4));
    }
    return this.streamColors;
  }

  teleport(x: number, z: number, yaw = Math.PI) {
    this.pos.set(x, floorHeightAt(x, z), z);
    this.yaw = yaw;
    this.camYaw = yaw;
    this.vel.set(0, 0, 0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('contextmenu', this.onContext);

    this.ro.disconnect();
    this.audio.dispose();
    this.movie.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (mat) {
        (Array.isArray(mat) ? mat : [mat]).forEach((m) => {
          Object.values(m).forEach((val) => {
            if (val instanceof THREE.Texture) val.dispose();
          });
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.screenFrame.src = 'about:blank';
    this.css.domElement.remove();
    canvas.remove();
  }

  onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    this.keys.add(e.code);
    if (!e.repeat && (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Space' || e.code === 'Enter')) {
      if (tag === 'BUTTON') (e.target as HTMLElement).blur();
      this.toggleSit();
      e.preventDefault();
    }
  };

  onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  onBlur = () => {
    this.keys.clear();
    this.joy.set(0, 0);
  };

  onContext = (e: Event) => e.preventDefault();

  onPointerDown = (e: PointerEvent) => {
    if (!this.entered || this.lookId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    this.lookId = e.pointerId;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
    this.downX = e.clientX;
    this.downY = e.clientY;
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {}
  };

  onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.lookId) return;
    const dx = e.clientX - this.lastPX;
    const dy = e.clientY - this.lastPY;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
    if (this.focus && this.phase === 'free' && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 24) {
      this.focus = false;
    }
    const sens = e.pointerType === 'touch' ? 0.0068 : 0.0052;
    if (this.phase === 'seated' || this.phase === 'sitting') {
      this.seatLookYaw = clamp(this.seatLookYaw - dx * sens, -1, 1);
      this.seatLookPitch = clamp(this.seatLookPitch - dy * sens * 0.8, -0.35, 0.45);
    } else {
      this.camYaw -= dx * sens;
      this.camPitch = clamp(this.camPitch + dy * sens * 0.7, -0.05, 1.05);
    }
  };

  onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  };

  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camDist = clamp(this.camDist + e.deltaY * 0.003, 2.4, 6.5);
  };

  nearestSeat(): SeatDef | null {
    return findNearestSeat(this.pos);
  }

  updateMovement(dt: number): number {
    let moveX = 0;
    let moveZ = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) moveZ += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) moveZ -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) moveX += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) moveX -= 1;

    let mag = Math.hypot(moveX, moveZ);
    if (mag > 1) {
      moveX /= mag;
      moveZ /= mag;
    }

    const joyLen = this.joy.length();
    if (joyLen > 0.12) {
      const scale = Math.min(1, (joyLen - 0.12) / 0.8) / joyLen;
      moveX += this.joy.x * scale;
      moveZ += this.joy.y * scale;
    }

    mag = Math.hypot(moveX, moveZ);
    if (mag > 1) {
      moveX /= mag;
      moveZ /= mag;
      mag = 1;
    }

    if (!this.entered) {
      moveX = 0;
      moveZ = 0;
      mag = 0;
    }
    if (this.focus && mag > 0.05) {
      this.focus = false;
    }

    const sprint =
      k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : smoothstep01((joyLen - 0.86) / 0.14);
    const speed = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * sprint;
    const sinY = Math.sin(this.camYaw);
    const cosY = Math.cos(this.camYaw);
    const worldX = sinY * moveZ - cosY * moveX;
    const worldZ = cosY * moveZ + sinY * moveX;
    const accel = 1 - Math.exp(-dt * 12);

    this.vel.x += (worldX * speed - this.vel.x) * accel;
    this.vel.z += (worldZ * speed - this.vel.z) * accel;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    resolveCollisions(this.pos);

    if (mag > 0.05) {
      this.yaw = dampAngle(this.yaw, Math.atan2(worldX, worldZ), 12, dt);
      if (moveZ > 0.05 && this.lookId === null) {
        this.camYaw = dampAngle(this.camYaw, this.yaw, 1.7 * moveZ, dt);
      }
    }

    const targetY = floorHeightAt(this.pos.x, this.pos.z);
    this.pos.y += (targetY - this.pos.y) * (1 - Math.exp(-dt * 16));
    return Math.hypot(this.vel.x, this.vel.z);
  }

  updateSeat(dt: number) {
    if (this.phase !== 'sitting' && this.phase !== 'standing') return;
    this.trans = Math.min(1, this.trans + dt / this.transDur);
    const t = easeInOutCubic(this.trans);
    this.pos.lerpVectors(this.from, this.to, t);
    this.pos.y += Math.sin(Math.PI * this.trans) * 0.14;
    this.yaw = lerpAngle(this.yawFrom, this.yawTo, t);
    this.sitBlend = this.phase === 'sitting' ? t : 1 - t;
    if (this.trans >= 1) {
      if (this.phase === 'sitting') {
        this.phase = 'seated';
      } else {
        this.phase = 'free';
        this.seat = null;
        this.camYaw = Math.PI;
        this.camPitch = 0.27;
      }
    }
  }

  introPose(elapsed: number) {
    const sway = Math.sin(elapsed * 0.12);
    this.ip.set(-5 + sway * 0.45, 3.65 + Math.sin(elapsed * 0.09) * 0.2, 7.35);
    this.il.set(1.4 + sway * 0.6, 2.85, -6);
    return { pos: this.ip, look: this.il };
  }

  updateCamera(dt: number) {
    const anchor = this.v1.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
    const sinY = Math.sin(this.camYaw);
    const cosY = Math.cos(this.camYaw);
    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);
    const backDir = this.v2.set(-sinY * cosP, sinP, -cosY * cosP);
    const desiredDist = this.camDist * (this.portrait ? 1.25 : 1);
    const actualDist = computeCameraBoomDistance(anchor, backDir, desiredDist);
    const thirdPos = this.v3.copy(anchor).addScaledVector(backDir, actualDist);
    if (actualDist < desiredDist) {
      thirdPos.y += (desiredDist - actualDist) * 0.35;
    }
    thirdPos.y = clamp(thirdPos.y, floorHeightAt(thirdPos.x, thirdPos.z) + 0.5, HALL_BOUNDS.height - 0.35);
    const thirdLook = this.v4.set(anchor.x + sinY * 2.4, anchor.y - 0.1, anchor.z + cosY * 2.4);

    let targetPos = thirdPos;
    let targetLook = thirdLook;

    if (this.camSeat && this.seatCam > 0.0005) {
      const s = this.camSeat;
      const headPos = this.v5.set(s.x, s.y + 1.26, s.z - 0.12);
      const toScreen = this.v6
        .set(s.x * 0.1, SCREEN_GEOMETRY.bottom + SCREEN_GEOMETRY.height * 0.52, SCREEN_GEOMETRY.z + 0.5)
        .sub(headPos);
      const dist = toScreen.length();
      toScreen.normalize();
      const cosLY = Math.cos(this.seatLookYaw);
      const sinLY = Math.sin(this.seatLookYaw);
      const rx = toScreen.x * cosLY + toScreen.z * sinLY;
      const rz = -toScreen.x * sinLY + toScreen.z * cosLY;
      toScreen.set(rx, toScreen.y + this.seatLookPitch, rz).normalize();
      const seatLook = this.v7.copy(headPos).addScaledVector(toScreen, dist);
      const blend = easeInOutCubic(this.seatCam);
      targetPos = this.v8.lerpVectors(thirdPos, headPos, blend);
      targetLook = this.v9.lerpVectors(thirdLook, seatLook, blend);
    }

    if (this.focusBlend > 0.0005) {
      this.focusPose(this.v12, this.v13);
      const blend = easeInOutCubic(this.focusBlend);
      targetPos = this.v14.lerpVectors(targetPos, this.v12, blend);
      targetLook = this.v15.lerpVectors(targetLook, this.v13, blend);
    }

    if (this.introBlend > 0.0005) {
      const intro = this.introPose(this.time);
      const blend = easeInOutCubic(this.introBlend);
      targetPos = this.v10.lerpVectors(targetPos, intro.pos, blend);
      targetLook = this.v11.lerpVectors(targetLook, intro.look, blend);
    }

    this.char.root.visible = this.seatCam < 0.45 && this.focusBlend < 0.35;
    const damp = 1 - Math.exp(-dt * 7);
    this.camPos.lerp(targetPos, damp);
    this.camLook.lerp(targetLook, damp);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.renderer.domElement.style.visibility = paused ? 'hidden' : 'visible';
    this.css.domElement.style.visibility = paused ? 'hidden' : 'visible';
    if (!paused) this.lastNow = -1;
  }

  tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    if (this.paused) {
      this.lastNow = now;
      this.scheduleNextFrame();
      return;
    }
    const rawDt = this.lastNow < 0 ? 1 / 60 : (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (!this.isSoftwareGl) {
      this.updatePerf(rawDt);
    }
    const dt = Math.min(rawDt, 1 / 20);
    this.step(dt);
    this.updateMarker(dt);

    let screenColors = this.movie.colors;
    if (this.streaming) {
      screenColors = this.updateStreamLight(dt);
    } else {
      this.movie.update(this.renderer, this.time, dt);
    }
    this.theatre.update(this.time, screenColors, this.dpr, this.dim);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);

    if (this.streaming) {
      this.camera.getWorldDirection(this.v16);
      const toScreen = this.v17
        .set(0, SCREEN_GEOMETRY.bottom + SCREEN_GEOMETRY.height / 2, SCREEN_GEOMETRY.z)
        .sub(this.camera.position);
      this.screenObj.visible = this.v16.dot(toScreen) > 0.2;
      this.css.render(this.scene, this.camera);
    }
    this.emitUI();

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  step(dt: number) {
    this.time += dt;
    let speed = 0;
    if (this.phase === 'free') {
      speed = this.updateMovement(dt);
    } else {
      this.updateSeat(dt);
    }
    const isSittingOrSeated = this.phase === 'sitting' || this.phase === 'seated';
    this.seatCam = clamp(this.seatCam + (isSittingOrSeated ? dt : -dt) / 1.1, 0, 1);
    if (this.seatCam === 0 && !isSittingOrSeated) {
      this.camSeat = null;
    }
    if (this.entered) {
      this.introBlend = Math.max(0, this.introBlend - dt / 1.8);
    }
    const prevStep = Math.floor(this.walkPhase / Math.PI);
    this.walkPhase += dt * speed * 3.4;
    if (speed > 0.5 && Math.floor(this.walkPhase / Math.PI) !== prevStep) {
      this.audio.footstep();
    }
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
    this.char.update(dt, this.time, this.walkPhase, speed / WALK_SPEED, easeInOutCubic(this.sitBlend));
    this.updateCamera(dt);

    this.focusBlend = clamp(this.focusBlend + (this.focus ? dt / 1.1 : -dt / 0.9), 0, 1);
    if (this.status === 'loading') {
      this.stallTimer += dt;
      if (this.stallTimer > 13) {
        this.status = 'stalled';
        this.overlayNote.textContent =
          'This server is not responding — try another server below.';
      }
    }
    this.dim = clamp(this.dim + (isSittingOrSeated || this.streaming ? dt / 2.5 : -dt / 1.2), 0, 1);
    this.lightsOut = clamp(this.lightsOut + (this.streaming ? dt / 1.6 : -dt / 1.1), 0, 1);
    this.theatre.setLightsOut(this.lightsOut);
    this.audio.setImmersion(this.sitBlend);
  }

  updateMarker(dt: number) {
    const near = this.phase === 'free' && this.entered ? this.nearestSeat() : null;
    if (near) this.markerSeat = near;
    const targetOp = near ? 1 : 0;
    const op = this.markerMat.opacity + (targetOp * 0.9 - this.markerMat.opacity) * (1 - Math.exp(-dt * 10));
    this.markerMat.opacity = op;
    this.marker.visible = op > 0.01 && this.markerSeat !== null;
    if (this.markerSeat) {
      const s = this.markerSeat;
      const pulse = 1 + Math.sin(this.time * 4) * 0.06;
      this.marker.position.set(s.x, s.y + 0.012, s.z - 0.62);
      this.marker.scale.set(pulse, pulse, 1);
    }
  }

  emitUI() {
    const near = this.phase === 'free' && this.entered ? this.nearestSeat() : null;
    const state: EngineUIState = {
      nearSeat: near ? near.label : null,
      seated: this.phase === 'seated',
      busy: this.phase === 'sitting' || this.phase === 'standing',
      seatLabel: this.seat ? this.seat.label : null,
      streaming: this.streaming,
      playerStatus: this.status,
      focused: this.focus,
    };
    const key = `${state.nearSeat}|${state.seated}|${state.busy}|${state.seatLabel}|${state.streaming}|${state.playerStatus}|${state.focused}`;
    if (key !== this.lastUI) {
      this.lastUI = key;
      this.opts.onState(state);
    }
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.css.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.portrait = aspect < 0.9;
    this.camera.fov = aspect < 0.75 ? 70 : aspect < 1.2 ? 63 : 55;
    this.camera.updateProjectionMatrix();
  }

  updatePerf(dt: number) {
    if (dt > 0.25) return;
    this.perfFrames++;
    this.perfTime += dt;
    if (this.perfTime < 2) return;
    const fps = this.perfFrames / this.perfTime;
    this.perfFrames = 0;
    this.perfTime = 0;
    if (fps < 45 && this.dpr > this.minDpr) {
      this.dpr = Math.max(this.minDpr, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      this.goodStreak = 0;
    } else if (fps > 57) {
      this.goodStreak++;
      if (this.goodStreak >= 3 && this.dpr < this.maxDpr) {
        this.dpr = Math.min(this.maxDpr, this.dpr + 0.25);
        this.renderer.setPixelRatio(this.dpr);
        this.resize();
        this.goodStreak = 0;
      }
    } else {
      this.goodStreak = 0;
    }
  }
}
