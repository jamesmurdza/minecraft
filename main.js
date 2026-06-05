import * as THREE from './node_modules/three/build/three.module.js';
import { PointerLockControls } from './node_modules/three/examples/jsm/controls/PointerLockControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 18, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const uiMessage = document.getElementById('message');
const hotbar = document.getElementById('hotbar');

const blockTypes = [
  { name: 'Grass', color: 0x67b04a },
  { name: 'Dirt', color: 0x8b5a2b },
  { name: 'Stone', color: 0x8e8e8e },
  { name: 'Wood', color: 0xb07a42 },
];

const selected = { index: 0 };

for (let i = 0; i < blockTypes.length; i++) {
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.innerHTML = `<div>${i + 1}</div><div>${blockTypes[i].name}</div>`;
  hotbar.appendChild(slot);
}

function updateHotbar() {
  [...hotbar.children].forEach((slot, i) => slot.classList.toggle('selected', i === selected.index));
}
updateHotbar();

const ambient = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(8, 20, 10);
scene.add(sun);

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blockMeshes = new Map();
const raycaster = new THREE.Raycaster();

function keyFor(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, typeIndex = 0) {
  const key = keyFor(x, y, z);
  if (blockMeshes.has(key)) return false;

  const material = new THREE.MeshLambertMaterial({ color: blockTypes[typeIndex].color });
  const mesh = new THREE.Mesh(blockGeometry, material);
  mesh.position.set(x, y, z);
  mesh.userData = { x, y, z, typeIndex };
  scene.add(mesh);
  blockMeshes.set(key, mesh);
  return true;
}

function removeBlock(x, y, z) {
  const key = keyFor(x, y, z);
  const mesh = blockMeshes.get(key);
  if (!mesh) return false;
  scene.remove(mesh);
  mesh.material.dispose();
  blockMeshes.delete(key);
  return true;
}

function hasBlock(x, y, z) {
  return blockMeshes.has(keyFor(x, y, z));
}

function makeGround() {
  const size = 14;
  for (let x = -size; x <= size; x++) {
    for (let z = -size; z <= size; z++) {
      const height = Math.max(0, Math.floor((Math.sin(x * 0.45) + Math.cos(z * 0.42)) * 0.7 + Math.random() * 0.9));
      addBlock(x, 0, z, 0);
      if (height > 0) addBlock(x, 1, z, 1);
      if (height > 1) addBlock(x, 2, z, 1);
      if (Math.random() < 0.035) addBlock(x, height + 1, z, 3);
    }
  }

  for (let i = 0; i < 9; i++) {
    const cx = Math.floor(Math.random() * 18 - 9);
    const cz = Math.floor(Math.random() * 18 - 9);
    const height = Math.floor(Math.random() * 3) + 2;
    for (let y = 1; y <= height; y++) addBlock(cx, y, cz, y < height ? 1 : 3);
  }
}
makeGround();

const player = {
  velocity: new THREE.Vector3(),
  onGround: false,
  eyeHeight: 1.6,
  height: 1.8,
  halfWidth: 0.3,
};
controls.getObject().position.set(0, 4, 8);

const keys = new Set();
let pointerLocked = false;

function feetFromEye(eyePos) {
  return new THREE.Vector3(eyePos.x, eyePos.y - player.eyeHeight, eyePos.z);
}

function blockBounds(mesh) {
  const { x, y, z } = mesh.position;
  return {
    minX: x - 0.5,
    maxX: x + 0.5,
    minY: y - 0.5,
    maxY: y + 0.5,
    minZ: z - 0.5,
    maxZ: z + 0.5,
  };
}

function overlapsPlayer(eyePos, mesh) {
  const feet = feetFromEye(eyePos);
  const minX = feet.x - player.halfWidth;
  const maxX = feet.x + player.halfWidth;
  const minY = feet.y;
  const maxY = feet.y + player.height;
  const minZ = feet.z - player.halfWidth;
  const maxZ = feet.z + player.halfWidth;
  const b = blockBounds(mesh);
  return (
    minX < b.maxX && maxX > b.minX &&
    minY < b.maxY && maxY > b.minY &&
    minZ < b.maxZ && maxZ > b.minZ
  );
}

function resolveAxis(eyePos, axis, delta) {
  if (delta === 0) return;
  eyePos[axis] += delta;

  const feet = feetFromEye(eyePos);
  const minX = feet.x - player.halfWidth;
  const maxX = feet.x + player.halfWidth;
  const minY = feet.y;
  const maxY = feet.y + player.height;
  const minZ = feet.z - player.halfWidth;
  const maxZ = feet.z + player.halfWidth;

  let corrected = null;
  for (const mesh of blockMeshes.values()) {
    const b = blockBounds(mesh);
    const xOverlap = minX < b.maxX && maxX > b.minX;
    const yOverlap = minY < b.maxY && maxY > b.minY;
    const zOverlap = minZ < b.maxZ && maxZ > b.minZ;
    if (!(xOverlap && yOverlap && zOverlap)) continue;

    if (axis === 'x') {
      corrected = delta > 0 ? Math.min(corrected ?? Infinity, b.minX - player.halfWidth) : Math.max(corrected ?? -Infinity, b.maxX + player.halfWidth);
    } else if (axis === 'z') {
      corrected = delta > 0 ? Math.min(corrected ?? Infinity, b.minZ - player.halfWidth) : Math.max(corrected ?? -Infinity, b.maxZ + player.halfWidth);
    } else if (axis === 'y') {
      corrected = delta > 0 ? Math.min(corrected ?? Infinity, b.minY - player.height + player.eyeHeight) : Math.max(corrected ?? -Infinity, b.maxY + player.eyeHeight);
    }
  }

  if (corrected !== null) {
    eyePos[axis] = corrected;
    if (axis === 'y' && delta < 0) player.onGround = true;
  }
}

function canPlaceAt(x, y, z) {
  if (hasBlock(x, y, z)) return false;
  const testEye = controls.getObject().position.clone();
  const testMesh = new THREE.Mesh(blockGeometry, new THREE.MeshBasicMaterial());
  testMesh.position.set(x, y, z);
  const result = !overlapsPlayer(testEye, testMesh);
  testMesh.material.dispose();
  return result;
}

function interact(action) {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects([...blockMeshes.values()], false);
  if (!hits.length) return;

  const hit = hits[0];
  const { x, y, z } = hit.object.position;
  const normal = hit.face.normal;

  if (action === 'remove') {
    removeBlock(x, y, z);
  } else if (action === 'place') {
    const px = x + normal.x;
    const py = y + normal.y;
    const pz = z + normal.z;
    if (canPlaceAt(px, py, pz)) addBlock(px, py, pz, selected.index);
  }
}

window.addEventListener('click', () => {
  if (!pointerLocked) {
    controls.lock();
  }
});

controls.addEventListener('lock', () => {
  pointerLocked = true;
  uiMessage.textContent = 'Locked: explore and build';
});

controls.addEventListener('unlock', () => {
  pointerLocked = false;
  uiMessage.textContent = 'Click anywhere to lock the mouse';
});

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousedown', (e) => {
  if (!pointerLocked) return;
  if (e.button === 0) interact('remove');
  if (e.button === 2) interact('place');
});

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  const number = Number(e.key);
  if (number >= 1 && number <= blockTypes.length) {
    selected.index = number - 1;
    updateHotbar();
  }
  if (e.code === 'Escape') uiMessage.textContent = 'Mouse unlocked';
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

function updateMovement(dt) {
  const eyePos = controls.getObject().position;
  const moveSpeed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8 : 4) * dt;
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

  const wish = new THREE.Vector3();
  wish.addScaledVector(dir, forward * moveSpeed);
  wish.addScaledVector(right, sideways * moveSpeed);

  resolveAxis(eyePos, 'x', wish.x);
  resolveAxis(eyePos, 'z', wish.z);

  player.velocity.y -= 20 * dt;
  if (keys.has('Space') && player.onGround) {
    player.velocity.y = 7.5;
    player.onGround = false;
  }

  player.onGround = false;
  resolveAxis(eyePos, 'y', player.velocity.y * dt);
  if (player.onGround) player.velocity.y = Math.max(0, player.velocity.y);

  // keep above void
  if (eyePos.y < -20) eyePos.set(0, 8, 8);
}

let lastTime = performance.now();
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  if (pointerLocked) updateMovement(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
