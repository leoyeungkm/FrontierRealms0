import * as THREE from 'three';
import { TOWER_COST, OBELISK_COST, OBELISK_SOI_RADIUS, SUMMON_DEFS } from '../constants.js';
import { createTower } from '../entities/tower.js';
import { createObelisk } from '../world/soi.js';
import { activateSummon } from '../entities/summonSystem.js';
import { showAnnounce, updateCrystalHUD } from '../ui/hud.js';

// ─── State ───────────────────────────────────────────────────
export const menuState = { buildOpen: false, summonOpen: false };

// ─── Injected refs ───────────────────────────────────────────
let _scene = null, _playerPos = null;
let _getPlayerYaw = () => 0;
let _crystalState = null;          // { count: number }
let _towersLeftRef = null;         // { value: number }
let _updateTowerCount = null;      // (n) => void
let _getRoom = () => null;

export function initBuildMenu(scene, playerPos, getPlayerYaw, crystalState, towersLeftRef, updateTowerCount, getRoom) {
  _scene          = scene;
  _playerPos      = playerPos;
  _getPlayerYaw   = getPlayerYaw;
  _crystalState   = crystalState;
  _towersLeftRef  = towersLeftRef;
  _updateTowerCount = updateTowerCount;
  _getRoom        = getRoom;
}

// ─── Build Menu ──────────────────────────────────────────────
export function toggleBuildMenu() {
  menuState.buildOpen = !menuState.buildOpen;
  document.getElementById('build-menu').style.display = menuState.buildOpen ? 'flex' : 'none';
}

export function selectAndPlace(type) {
  if (type === 'tower')   placeTower();
  if (type === 'obelisk') placeObelisk();
  if (menuState.buildOpen) toggleBuildMenu();
}

export function placeTower() {
  if (_towersLeftRef.value <= 0) { showAnnounce('箭塔已達上限！'); return; }
  if (_crystalState.count < TOWER_COST) { showAnnounce(`需要 ${TOWER_COST} 💎 水晶！（現有 ${_crystalState.count}）`); return; }
  _crystalState.count -= TOWER_COST;
  updateCrystalHUD(_crystalState.count);
  const yaw = _getPlayerYaw();
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));   // 角色面向（修正：原本反向 → 建在背後）
  const pos = _playerPos.clone().addScaledVector(fwd, 5);
  createTower(pos.x, pos.z);
  _towersLeftRef.value--;
  _updateTowerCount(_towersLeftRef.value);
}

export function placeObelisk() {
  if (_crystalState.count < OBELISK_COST) {
    showAnnounce(`需要 ${OBELISK_COST} 💎 水晶！（現有 ${_crystalState.count}）`);
    return;
  }
  _crystalState.count -= OBELISK_COST;
  updateCrystalHUD(_crystalState.count);
  const yaw = _getPlayerYaw();
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));   // 角色面向（修正：原本反向 → 建在背後）
  const pos = _playerPos.clone().addScaledVector(fwd, 5);
  createObelisk(pos.x, pos.z);
}

// ─── Build Ghost Preview ─────────────────────────────────────
let ghostGroup = null;

function showBuildGhost() {
  clearBuildGhost();
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.5, 0.55),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.35, depthWrite: false }));
  shaft.position.y = 3.15; g.add(shaft);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.4, 4),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5, depthWrite: false }));
  cap.position.y = 6.65; g.add(cap);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.4, 32),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.renderOrder = 2; g.add(ring);
  const soiPreview = new THREE.Mesh(new THREE.RingGeometry(OBELISK_SOI_RADIUS - 0.5, OBELISK_SOI_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  soiPreview.rotation.x = -Math.PI / 2; soiPreview.position.y = 0.04; soiPreview.renderOrder = 1; g.add(soiPreview);
  _scene.add(g);
  ghostGroup = g;
}

export function clearBuildGhost() {
  if (ghostGroup) { _scene.remove(ghostGroup); ghostGroup = null; }
}

export function updateBuildGhost() {
  if (!menuState.buildOpen) { clearBuildGhost(); return; }
  if (!ghostGroup) showBuildGhost();
  const yaw = _getPlayerYaw();
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));   // 角色面向（修正：原本反向 → 建在背後）
  const pos = _playerPos.clone().addScaledVector(fwd, 5);
  ghostGroup.position.set(pos.x, 0, pos.z);
  const color = _crystalState.count >= OBELISK_COST ? 0x00ff88 : _crystalState.count >= TOWER_COST ? 0xffcc00 : 0xff3322;
  ghostGroup.traverse(c => { if (c.isMesh) c.material.color.setHex(color); });
}

// ─── Summon Menu ─────────────────────────────────────────────
export function toggleSummonMenu(summonActive) {
  if (summonActive) return;
  menuState.summonOpen = !menuState.summonOpen;
  document.getElementById('summon-menu').style.display = menuState.summonOpen ? 'flex' : 'none';
  if (menuState.summonOpen && menuState.buildOpen) {
    menuState.buildOpen = false;
    document.getElementById('build-menu').style.display = 'none';
  }
}

export function selectSummon(type) {
  const def = SUMMON_DEFS[type];
  if (!def) return;
  if (_crystalState.count < def.cost) { showAnnounce(`需要 ${def.cost} 💎 召喚 ${def.name}！`); return; }
  _crystalState.count -= def.cost;
  updateCrystalHUD(_crystalState.count);
  menuState.summonOpen = false;
  document.getElementById('summon-menu').style.display = 'none';
  activateSummon(type, _getRoom());
}
