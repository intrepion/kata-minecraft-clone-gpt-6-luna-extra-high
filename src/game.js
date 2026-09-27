import * as THREE from "three";

const canvas = document.querySelector("#world");
const welcome = document.querySelector("#welcome");
const enterButton = document.querySelector("#enter-button");
const welcomeTitle = document.querySelector("#welcome-title");
const welcomeCopy = document.querySelector("#welcome-copy");
const hotbar = document.querySelector("#hotbar");
const positionLabel = document.querySelector("#position-label");
const targetLabel = document.querySelector("#target-label");
const clockLabel = document.querySelector("#clock-label");
const regionLabel = document.querySelector("#region-label");

const BLOCKS = [
  { id: "grass", name: "Grass", color: "#77a957", top: "#85b963", side: "#946c45" },
  { id: "dirt", name: "Dirt", color: "#946c45" },
  { id: "stone", name: "Stone", color: "#858984" },
  { id: "wood", name: "Wood", color: "#986f45", top: "#ba9561" },
  { id: "leaves", name: "Leaves", color: "#638c4d" },
  { id: "sand", name: "Sand", color: "#d4c07e" },
];
const BLOCK_IDS = [...BLOCKS.map((block) => block.id), "bedrock"];
const blockMap = new Map();
const worldMeshes = [];
const pressedKeys = new Set();
const clock = new THREE.Clock();
const player = { x: 0, y: 4, z: 0, velocityY: 0, grounded: false, yaw: 0, pitch: -0.09 };
const playerHeight = 1.76;
const playerRadius = 0.29;
const spawn = { x: 0, z: 0, y: 3 };
let selectedBlock = 0;
let hasEntered = false;
let elapsedWorldTime = 0;
let currentTarget = null;
let positionAccumulator = 0;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;

const scene = new THREE.Scene();
const daySky = new THREE.Color(0xb9dce6);
const duskSky = new THREE.Color(0xe0ae83);
const nightSky = new THREE.Color(0x42586d);
scene.background = daySky.clone();
scene.fog = new THREE.Fog(scene.background, 34, 82);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 100);
camera.rotation.order = "YXZ";
camera.position.set(0, 0, 0);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xd8efff, 0x586347, 1.7));
const sun = new THREE.DirectionalLight(0xfff0d5, 2.15);
sun.position.set(-25, 36, 17);
scene.add(sun);

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const blockMaterials = Object.fromEntries(BLOCK_IDS.map((id) => [id, createBlockMaterials(id)]));
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.008, 1.008, 1.008)),
  new THREE.LineBasicMaterial({ color: 0xfff5c9, transparent: true, opacity: 0.9, depthTest: true }),
);
outline.visible = false;
scene.add(outline);

function seededHash(x, z) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + 1442695041;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = THREE.MathUtils.lerp(seededHash(x0, z0), seededHash(x0 + 1, z0), sx);
  const b = THREE.MathUtils.lerp(seededHash(x0, z0 + 1), seededHash(x0 + 1, z0 + 1), sx);
  return THREE.MathUtils.lerp(a, b, sz) * 2 - 1;
}

function terrainHeight(x, z) {
  const broad = smoothNoise((x + 17) * 0.055, (z - 8) * 0.055) * 3.1;
  const detail = smoothNoise((x - 5) * 0.15, (z + 4) * 0.15) * 0.9;
  const ridge = Math.max(0, smoothNoise(x * 0.028, z * 0.028) - 0.05) * 2.5;
  return Math.floor(2.2 + broad + detail + ridge);
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function setBlock(x, y, z, type) {
  blockMap.set(blockKey(x, y, z), type);
}

function getBlock(x, y, z) {
  return blockMap.get(blockKey(x, y, z));
}

function addTree(x, z, groundY) {
  const trunkHeight = 4;
  for (let y = 1; y <= trunkHeight; y += 1) setBlock(x, groundY + y, z, "wood");
  for (let layer = 0; layer < 4; layer += 1) {
    const radius = layer < 2 ? 2 : 1;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.abs(dx) === radius && Math.abs(dz) === radius && seededHash(x + dx * 3 + layer, z + dz * 5) > 0.44) continue;
        const y = groundY + 3 + layer;
        if (dx === 0 && dz === 0 && y <= groundY + trunkHeight) continue;
        if (!getBlock(x + dx, y, z + dz)) setBlock(x + dx, y, z + dz, "leaves");
      }
    }
  }
}

function generateWorld() {
  blockMap.clear();
  for (let x = -24; x < 24; x += 1) {
    for (let z = -24; z < 24; z += 1) {
      const top = terrainHeight(x, z);
      for (let y = -4; y <= top; y += 1) {
        let type = "stone";
        if (y === -4) type = "bedrock";
        else if (y === top) type = top <= 0 ? "sand" : "grass";
        else if (y >= top - 3) type = top <= 0 ? "sand" : "dirt";
        setBlock(x, y, z, type);
      }
    }
  }

  for (let x = -21; x <= 20; x += 6) {
    for (let z = -21; z <= 20; z += 6) {
      const chance = seededHash(x + 101, z - 29);
      if (chance < 0.61 || (Math.abs(x) < 7 && Math.abs(z) < 7)) continue;
      const ground = terrainHeight(x, z);
      const nearby = [terrainHeight(x + 1, z), terrainHeight(x - 1, z), terrainHeight(x, z + 1), terrainHeight(x, z - 1)];
      if (Math.max(...nearby.map((height) => Math.abs(height - ground))) <= 1) addTree(x, z, ground);
    }
  }

  spawn.y = terrainHeight(0, 0) + 0.51;
  player.x = spawn.x;
  player.z = spawn.z;
  player.y = spawn.y;
  player.velocityY = 0;
  rebuildWorldMeshes();
  addClouds();
}

function createBlockMaterials(type) {
  const color = (face) => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    const palettes = {
      grass: face === "top" ? ["#77a957", "#8db967", "#6d994f"] : ["#8f6945", "#9d754a", "#79583d"],
      dirt: ["#906844", "#9d754d", "#805b3c"],
      stone: ["#838780", "#969990", "#747871"],
      bedrock: ["#555b59", "#69706c", "#454b49"],
      wood: face === "top" ? ["#bd9860", "#a98451", "#d0ad71"] : ["#946b42", "#a47a4b", "#795738"],
      leaves: ["#5d8648", "#6d9854", "#4e743f"],
      sand: ["#d2bf7c", "#e0ce8d", "#c4b16e"],
    };
    const palette = palettes[type] ?? palettes.stone;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        let selected = palette[Math.floor(seededHash(x + y * 17, y * 13 + x * 7) * palette.length)];
        if (type === "grass" && face === "side" && y < 3) selected = y === 2 ? "#819f54" : "#79a853";
        if (type === "wood" && face === "side" && x % 5 === 0) selected = "#795938";
        context.fillStyle = selected;
        context.fillRect(x, y, 1, 1);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 1, transparent: type === "leaves", alphaTest: type === "leaves" ? 0.35 : 0 });
  };

  if (type === "grass") return [color("side"), color("side"), color("top"), color("side"), color("side"), color("side")];
  if (type === "wood") return [color("side"), color("side"), color("top"), color("top"), color("side"), color("side")];
  return color(type);
}

function rebuildWorldMeshes() {
  for (const mesh of worldMeshes) scene.remove(mesh);
  worldMeshes.length = 0;
  const groups = Object.fromEntries(BLOCK_IDS.map((id) => [id, []]));
  for (const [key, type] of blockMap) groups[type].push(key.split(",").map(Number));

  const dummy = new THREE.Object3D();
  for (const type of BLOCK_IDS) {
    const positions = groups[type];
    if (positions.length === 0) continue;
    const mesh = new THREE.InstancedMesh(cubeGeometry, blockMaterials[type], positions.length);
    mesh.name = `${type}-blocks`;
    mesh.userData.blockType = type;
    mesh.frustumCulled = true;
    for (let i = 0; i < positions.length; i += 1) {
      dummy.position.set(...positions[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    worldMeshes.push(mesh);
  }
}

function addClouds() {
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xf8fcf1, transparent: true, opacity: 0.76 });
  const cloudGeometry = new THREE.BoxGeometry(1.7, 0.5, 1.25);
  const cloudPositions = [];
  for (let group = 0; group < 9; group += 1) {
    const centerX = (seededHash(group * 17, 9) - 0.5) * 76;
    const centerZ = (seededHash(group * 23, 4) - 0.5) * 66;
    const centerY = 13 + seededHash(group, 33) * 4;
    const count = 3 + Math.floor(seededHash(group + 8, group + 22) * 4);
    for (let i = 0; i < count; i += 1) {
      cloudPositions.push([centerX + (i - count / 2) * 1.15, centerY + (i % 2) * 0.25, centerZ + (i % 3 - 1) * 0.75]);
    }
  }
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, cloudPositions.length);
  const dummy = new THREE.Object3D();
  cloudPositions.forEach((position, index) => {
    dummy.position.set(...position);
    dummy.updateMatrix();
    clouds.setMatrixAt(index, dummy.matrix);
  });
  clouds.instanceMatrix.needsUpdate = true;
  clouds.name = "clouds";
  scene.add(clouds);
}

function renderHotbar() {
  hotbar.replaceChildren();
  BLOCKS.forEach((block, index) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `slot${index === selectedBlock ? " selected" : ""}`;
    slot.setAttribute("aria-label", `${index + 1}: ${block.name}`);
    slot.setAttribute("aria-pressed", String(index === selectedBlock));
    slot.innerHTML = `<span class="slot-number">${index + 1}</span><span class="block-icon" style="--block:${block.color}"></span><span class="slot-name">${block.name}</span>`;
    slot.addEventListener("click", () => selectBlock(index));
    hotbar.append(slot);
  });
}

function selectBlock(index) {
  selectedBlock = (index + BLOCKS.length) % BLOCKS.length;
  renderHotbar();
}

function collidesAt(x, y, z) {
  const minX = Math.floor(x - playerRadius + 0.5);
  const maxX = Math.floor(x + playerRadius + 0.5);
  const minY = Math.floor(y + 0.015 + 0.5);
  const maxY = Math.floor(y + playerHeight - 0.015 + 0.5);
  const minZ = Math.floor(z - playerRadius + 0.5);
  const maxZ = Math.floor(z + playerRadius + 0.5);
  for (let bx = minX; bx <= maxX; bx += 1) {
    for (let by = minY; by <= maxY; by += 1) {
      for (let bz = minZ; bz <= maxZ; bz += 1) {
        if (getBlock(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

function updatePlayer(delta) {
  const forward = (pressedKeys.has("KeyW") ? 1 : 0) - (pressedKeys.has("KeyS") ? 1 : 0);
  const strafe = (pressedKeys.has("KeyD") ? 1 : 0) - (pressedKeys.has("KeyA") ? 1 : 0);
  const length = Math.hypot(forward, strafe) || 1;
  const speed = pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight") ? 7.1 : 4.8;
  const moveX = ((-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) / length) * speed * delta;
  const moveZ = ((-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) / length) * speed * delta;

  const nextX = THREE.MathUtils.clamp(player.x + moveX, -23.25, 22.25);
  if (!collidesAt(nextX, player.y, player.z)) player.x = nextX;
  const nextZ = THREE.MathUtils.clamp(player.z + moveZ, -23.25, 22.25);
  if (!collidesAt(player.x, player.y, nextZ)) player.z = nextZ;

  if (pressedKeys.has("Space") && player.grounded) {
    player.velocityY = 8.4;
    player.grounded = false;
  }
  player.velocityY -= 23 * delta;
  const nextY = player.y + player.velocityY * delta;
  let landed = false;
  if (player.velocityY <= 0) {
    const minX = Math.floor(player.x - playerRadius + 0.5);
    const maxX = Math.floor(player.x + playerRadius + 0.5);
    const minZ = Math.floor(player.z - playerRadius + 0.5);
    const maxZ = Math.floor(player.z + playerRadius + 0.5);
    let floorY = -Infinity;
    for (let bx = minX; bx <= maxX; bx += 1) {
      for (let bz = minZ; bz <= maxZ; bz += 1) {
        for (let by = Math.ceil(nextY - 0.5); by <= Math.floor(player.y + 0.5); by += 1) {
          if (getBlock(bx, by, bz)) {
            const top = by + 0.5;
            if (player.y >= top - 0.025 && nextY <= top + 0.01) floorY = Math.max(floorY, top);
          }
        }
      }
    }
    if (floorY !== -Infinity) {
      player.y = floorY;
      player.velocityY = 0;
      player.grounded = true;
      landed = true;
    }
  }

  if (!landed) {
    if (player.velocityY > 0 && collidesAt(player.x, nextY, player.z)) player.velocityY = 0;
    else player.y = nextY;
    player.grounded = false;
  }
  if (player.y < -8) {
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.velocityY = 0;
  }
}

function traceBlocks(origin, direction, maxDistance = 6.1) {
  let x = Math.floor(origin.x + 0.5);
  let y = Math.floor(origin.y + 0.5);
  let z = Math.floor(origin.z + 0.5);
  const stepX = Math.sign(direction.x);
  const stepY = Math.sign(direction.y);
  const stepZ = Math.sign(direction.z);
  const deltaX = direction.x === 0 ? Infinity : Math.abs(1 / direction.x);
  const deltaY = direction.y === 0 ? Infinity : Math.abs(1 / direction.y);
  const deltaZ = direction.z === 0 ? Infinity : Math.abs(1 / direction.z);
  const edgeX = stepX > 0 ? x + 0.5 : x - 0.5;
  const edgeY = stepY > 0 ? y + 0.5 : y - 0.5;
  const edgeZ = stepZ > 0 ? z + 0.5 : z - 0.5;
  let maxX = stepX === 0 ? Infinity : (edgeX - origin.x) / direction.x;
  let maxY = stepY === 0 ? Infinity : (edgeY - origin.y) / direction.y;
  let maxZ = stepZ === 0 ? Infinity : (edgeZ - origin.z) / direction.z;
  let previous = null;

  for (let distance = 0; distance <= maxDistance; distance = Math.min(maxX, maxY, maxZ)) {
    const type = getBlock(x, y, z);
    if (type) return { x, y, z, type, previous, distance };
    previous = { x, y, z };
    if (maxX <= maxY && maxX <= maxZ) {
      x += stepX;
      distance = maxX;
      maxX += deltaX;
    } else if (maxY <= maxZ) {
      y += stepY;
      distance = maxY;
      maxY += deltaY;
    } else {
      z += stepZ;
      distance = maxZ;
      maxZ += deltaZ;
    }
    if (distance > maxDistance) break;
    const found = getBlock(x, y, z);
    if (found) return { x, y, z, type: found, previous, distance };
  }
  return null;
}

function updateTarget() {
  camera.getWorldDirection(_direction);
  currentTarget = traceBlocks(camera.position, _direction);
  outline.visible = Boolean(currentTarget);
  if (currentTarget) {
    outline.position.set(currentTarget.x, currentTarget.y, currentTarget.z);
    const name = BLOCKS.find((block) => block.id === currentTarget.type)?.name ?? "Bedrock";
    targetLabel.textContent = name.toUpperCase();
  } else {
    targetLabel.textContent = "";
  }
}

const _direction = new THREE.Vector3();

function editTarget(button) {
  if (!currentTarget) return;
  const { x, y, z, type, previous } = currentTarget;
  if (button === 0) {
    if (type === "bedrock") return;
    blockMap.delete(blockKey(x, y, z));
    rebuildWorldMeshes();
  } else if (button === 2 && previous) {
    const { x: bx, y: by, z: bz } = previous;
    if (by < -3 || by > 12 || bx < -24 || bx >= 24 || bz < -24 || bz >= 24 || getBlock(bx, by, bz)) return;
    const intersectsPlayer = Math.abs(player.x - bx) < playerRadius + 0.5 && Math.abs(player.z - bz) < playerRadius + 0.5 && player.y < by + 0.5 && player.y + playerHeight > by - 0.5;
    if (intersectsPlayer) return;
    blockMap.set(blockKey(bx, by, bz), BLOCKS[selectedBlock].id);
    rebuildWorldMeshes();
  }
  updateTarget();
}

function updateLighting(delta) {
  elapsedWorldTime += delta;
  const day = (elapsedWorldTime / 260 + 0.36) % 1;
  const daylight = THREE.MathUtils.clamp(Math.sin(day * Math.PI * 2) * 0.5 + 0.55, 0.14, 1);
  const dusk = 1 - THREE.MathUtils.smoothstep(daylight, 0.25, 0.85);
  const sky = daySky.clone().lerp(duskSky, dusk * 0.58);
  if (daylight < 0.35) sky.lerp(nightSky, (0.35 - daylight) * 1.15);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  sun.intensity = 0.55 + daylight * 1.75;
  sun.position.set(Math.cos(day * Math.PI * 2) * 34, 8 + daylight * 34, Math.sin(day * Math.PI * 2) * 34);
  const totalMinutes = Math.floor(day * 24 * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  clockLabel.textContent = `DAY 01 · ${hours}:${minutes}`;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (document.pointerLockElement === canvas) {
    updatePlayer(delta);
    positionAccumulator += delta;
    if (positionAccumulator > 0.1) {
      positionAccumulator = 0;
      positionLabel.textContent = `X ${Math.floor(player.x)}   Y ${Math.floor(player.y)}   Z ${Math.floor(player.z)}`;
      const distanceFromHome = Math.hypot(player.x, player.z);
      regionLabel.textContent = distanceFromHome < 8 ? "A QUIET CORNER OF THE WORLD" : distanceFromHome < 17 ? "WHERE THE TREES GROW WILD" : "THE EDGE OF WHAT YOU KNOW";
    }
  }
  camera.position.set(player.x, player.y + 1.62, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
  updateTarget();
  updateLighting(delta);
  renderer.render(scene, camera);
}

function showWelcome(paused) {
  welcome.hidden = false;
  welcomeTitle.innerHTML = paused ? "Take a<br /><span>breath.</span>" : "Make room<br />for <span>wonder.</span>";
  welcomeCopy.textContent = paused ? "Your little corner of the world will be right here when you are ready." : "Wander a little. Take what you need. Leave the place more yours than you found it.";
  enterButton.querySelector("span:first-child").textContent = paused ? "Resume the world" : "Enter the world";
}

function requestLock() {
  hasEntered = true;
  if (canvas.requestPointerLock) canvas.requestPointerLock();
}

enterButton.addEventListener("click", requestLock);
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) welcome.hidden = true;
  else showWelcome(hasEntered);
});
document.addEventListener("pointerlockerror", () => {
  welcomeCopy.textContent = "Your browser could not start pointer lock. Try opening the game from a local web server in a desktop browser.";
});
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.0022, -Math.PI / 2 + 0.03, Math.PI / 2 - 0.03);
});
document.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  pressedKeys.add(event.code);
  if (event.code.startsWith("Digit")) {
    const index = Number(event.code.slice(5)) - 1;
    if (index >= 0 && index < BLOCKS.length) selectBlock(index);
  }
});
document.addEventListener("keyup", (event) => pressedKeys.delete(event.code));
window.addEventListener("blur", () => pressedKeys.clear());
window.addEventListener("wheel", (event) => {
  if (document.pointerLockElement === canvas) selectBlock(selectedBlock + Math.sign(event.deltaY));
}, { passive: true });
document.addEventListener("mousedown", (event) => {
  if (document.pointerLockElement === canvas && (event.button === 0 || event.button === 2)) editTarget(event.button);
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderHotbar();
generateWorld();
showWelcome(false);
animate();
