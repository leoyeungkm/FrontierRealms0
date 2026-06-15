import * as THREE from 'three';

let _scene = null;

/** 必須在 scene 建立後呼叫一次 */
export function initMap(scene) {
  _scene = scene;
}

// ─── 路徑 ─────────────────────────────────────────────────────
export function addPath(x1,z1,x2,z2,w=9,color=0xa09070){
  const dx=x2-x1,dz=z2-z1,len=Math.sqrt(dx*dx+dz*dz);
  const g=new THREE.Group(); g.position.set((x1+x2)/2,0.015,(z1+z2)/2); g.rotation.y=Math.atan2(dx,dz);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,len),new THREE.MeshLambertMaterial({color}));
  m.rotation.x=-Math.PI/2; m.receiveShadow=true; g.add(m); _scene.add(g);
}

// ─── 裝飾 ─────────────────────────────────────────────────────
export function addTree(x,z,s=1){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.32,2.2,6),new THREE.MeshLambertMaterial({color:0x6b3a2a}));
  trunk.position.y=1.1; trunk.castShadow=true; g.add(trunk);
  [[0x2d6a2d,1.6,2.8],[0x3a8a3a,1.3,4.1],[0x1f5a1f,1.0,5.3]].forEach(([c,r,y])=>{
    const cone=new THREE.Mesh(new THREE.ConeGeometry(r,2.2,7),new THREE.MeshLambertMaterial({color:c}));
    cone.position.y=y; cone.castShadow=true; g.add(cone);
  });
  g.position.set(x,0,z); g.rotation.y=Math.random()*Math.PI*2;
  g.scale.setScalar(s*(0.85+Math.random()*0.35)); _scene.add(g);
}

export function addRock(x,z){
  const r=new THREE.Mesh(new THREE.DodecahedronGeometry(0.4+Math.random()*0.7,0),new THREE.MeshLambertMaterial({color:0x888080}));
  r.position.set(x,0.3,z); r.rotation.set(Math.random(),Math.random(),Math.random());
  r.castShadow=true; r.receiveShadow=true; _scene.add(r);
}

// ─── 主堡 ─────────────────────────────────────────────────────
export function buildCastle(cx, cz, isRed = false) {
  const stoneCol = isRed ? 0xa07070 : 0xb0a090;
  const darkCol  = isRed ? 0x7a5050 : 0x907e6e;
  const roofCol  = isRed ? 0x6b1010 : 0x8b2020;
  const flagCol  = isRed ? 0xcc2200 : 0x2244cc;
  const stone=new THREE.MeshLambertMaterial({color:stoneCol});
  const dark=new THREE.MeshLambertMaterial({color:darkCol});
  const roofMat=new THREE.MeshLambertMaterial({color:roofCol});
  const g=new THREE.Group();
  const keep=new THREE.Mesh(new THREE.BoxGeometry(9,11,9),stone); keep.position.y=5.5; keep.castShadow=true; g.add(keep);
  for(let i=0;i<12;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(1.1,2,1.1),dark),a=(i/12)*Math.PI*2;b.position.set(Math.cos(a)*5,12,Math.sin(a)*5);g.add(b);}
  [[-5.5,-5.5],[5.5,-5.5],[-5.5,5.5],[5.5,5.5]].forEach(([tx,tz])=>{
    const t=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.5,9,8),stone);t.position.set(tx,4.5,tz);t.castShadow=true;g.add(t);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(1.8,3.5,8),roofMat);roof.position.set(tx,10.75,tz);g.add(roof);
  });
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,4.5,4),new THREE.MeshLambertMaterial({color:0x8b7355}));
  pole.position.set(0,13.25,0);g.add(pole);
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.3),new THREE.MeshLambertMaterial({color:flagCol,side:THREE.DoubleSide}));
  flag.position.set(1.1,14.8,0);g.add(flag);
  [[-2.2,2,-4.5],[2.2,2,-4.5]].forEach(([x,y,z])=>{const gp=new THREE.Mesh(new THREE.BoxGeometry(0.8,4,1.5),stone);gp.position.set(x,y,z);g.add(gp);});
  const gateTop=new THREE.Mesh(new THREE.BoxGeometry(5.2,1.2,1.5),stone);gateTop.position.set(0,4.6,-4.5);g.add(gateTop);
  g.position.set(cx,0,cz); _scene.add(g);
}

// ─── 重生點 ───────────────────────────────────────────────────
export function buildSpawn(x,z){
  const dark=new THREE.MeshLambertMaterial({color:0x2a0808});
  const g=new THREE.Group();
  const portal=new THREE.Mesh(new THREE.CircleGeometry(7,24),new THREE.MeshLambertMaterial({color:0x0d0005}));
  portal.rotation.x=-Math.PI/2;portal.position.y=0.02;g.add(portal);
  for(let i=0;i<7;i++){const a=(i/7)*Math.PI*2,h=1.5+Math.random()*3;const p=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.38,h,6),dark);p.position.set(Math.cos(a)*6,h/2,Math.sin(a)*6);p.rotation.z=(Math.random()-0.5)*0.45;p.castShadow=true;g.add(p);}
  const orb=new THREE.Mesh(new THREE.SphereGeometry(1,12,12),new THREE.MeshLambertMaterial({color:0x660022,emissive:new THREE.Color(0x330011),emissiveIntensity:1}));
  orb.position.y=2;g.add(orb);
  g.position.set(x,0,z); _scene.add(g);
}
