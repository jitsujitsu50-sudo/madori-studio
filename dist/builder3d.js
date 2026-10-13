// 3D room builder (three.js / WebGL).
// floorTiles, items and hiddenEdges are shared with the 2D plan, undo history and localStorage.
// World units are meters: plan px / PX. Plan x -> world X, plan y -> world Z.
const builderCanvas=$('builder3dCanvas');
let wallHeightCm=240;
const B3={tool:'add',yaw:Math.PI/4,pitch:.9,dist:16,target:null,hover:null,stroke:null,orbit:null,pointers:new Map(),pinch:null,selectedId:null,dragItem:null,cutaway:false,dirty:true,raf:0,fitted:false};
let b3renderer=null,b3scene,b3camera,b3root,b3hover,b3sun,b3ray;
const B3_THICK=.12;
const b3Mats={};

function b3Open(){return!$('builder3dModal').classList.contains('hidden')}
function b3Mat(key,color,opts={}){const k=key+color;if(!b3Mats[k])b3Mats[k]=new THREE.MeshStandardMaterial({color,roughness:.82,metalness:0,...opts});return b3Mats[k]}
function tileKey(x,y,size){return`${x}:${y}:${size}`}
function cellM(){return gridPx()/PX}
function normalizedTiles(){const size=gridPx();return floorTiles.filter(t=>t.size===size).map(t=>({...t,gx:Math.round(t.x/size),gy:Math.round(t.y/size)}))}
function wallEligibleTiles(tiles){const all=new Set(tiles.map(t=>`${t.gx}:${t.gy}`)),eligible=new Set(),visited=new Set();tiles.forEach(start=>{const first=`${start.gx}:${start.gy}`;if(visited.has(first))return;const queue=[[start.gx,start.gy]],component=[];visited.add(first);while(queue.length){const [x,y]=queue.shift();component.push(`${x}:${y}`);[[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(([nx,ny])=>{const key=`${nx}:${ny}`;if(all.has(key)&&!visited.has(key)){visited.add(key);queue.push([nx,ny])}})}if(component.length>=4)component.forEach(key=>eligible.add(key))});return eligible}

// Edges: 'h' = top edge of cell (gx,gy); 'v' = left edge of cell (gx,gy). Keys are stored in plan px so they survive grid changes.
function edgeKey(k,gx,gy,size=gridPx()){return`${k}:${gx*size}:${gy*size}:${size}`}
function edgePoints(e,size=gridPx()){const x=e.gx*size,y=e.gy*size;return e.k==='h'?[[x,y],[x+size,y]]:[[x,y],[x,y+size]]}
function autoEdges(tiles){const size=gridPx(),set=new Set(tiles.map(t=>`${t.gx}:${t.gy}`)),elig=wallEligibleTiles(tiles),edges=new Map(),add=(k,gx,gy)=>edges.set(edgeKey(k,gx,gy,size),{k,gx,gy});
  tiles.forEach(t=>{if(!elig.has(`${t.gx}:${t.gy}`))return;if(!set.has(`${t.gx}:${t.gy-1}`))add('h',t.gx,t.gy);if(!set.has(`${t.gx}:${t.gy+1}`))add('h',t.gx,t.gy+1);if(!set.has(`${t.gx-1}:${t.gy}`))add('v',t.gx,t.gy);if(!set.has(`${t.gx+1}:${t.gy}`))add('v',t.gx+1,t.gy)});
  items.filter(i=>i.type==='room'&&Math.abs(i.rotation||0)<1).forEach(room=>{const x0=Math.floor(room.x/size),y0=Math.floor(room.y/size),x1=Math.ceil((room.x+room.w)/size),y1=Math.ceil((room.y+room.h)/size),has=(x,y)=>elig.has(`${x}:${y}`);for(let x=x0;x<x1;x++){if(has(x,y0))add('h',x,y0);if(has(x,y1-1))add('h',x,y1)}for(let y=y0;y<y1;y++){if(has(x0,y))add('v',x0,y);if(has(x1-1,y))add('v',x1,y)}});
  return edges}
function visibleAutoEdges(tiles){const hidden=new Set(hiddenEdges),all=autoEdges(tiles),out=new Map();all.forEach((e,k)=>{if(!hidden.has(k))out.set(k,e)});return{all,visible:out}}
function edgeRuns(edges){const groups={};edges.forEach(e=>{const line=e.k==='h'?e.gy:e.gx,pos=e.k==='h'?e.gx:e.gy,g=`${e.k}:${line}`;(groups[g]||(groups[g]={k:e.k,line,list:[]})).list.push(pos)});const runs=[];Object.values(groups).forEach(g=>{g.list.sort((a,b)=>a-b);let start=g.list[0],prev=start;for(let n=1;n<=g.list.length;n++){const p=g.list[n];if(p===prev+1){prev=p;continue}runs.push({k:g.k,line:g.line,from:start,to:prev+1});start=prev=p}});return runs}

function wallItemCovers(w,a,b){const [p,q]=wallSegment(w),vx=q[0]-p[0],vy=q[1]-p[1],len=Math.hypot(vx,vy);if(len<1)return null;const ux=vx/len,uy=vy/len,off=pt=>Math.abs((pt[0]-p[0])*uy-(pt[1]-p[1])*ux),t=pt=>(pt[0]-p[0])*ux+(pt[1]-p[1])*uy;if(off(a)>2.5||off(b)>2.5)return null;const ta=Math.min(t(a),t(b)),tb=Math.max(t(a),t(b));if(ta<-1.5||tb>len+1.5)return null;return{p,ux,uy,len,ta:Math.max(0,ta),tb:Math.min(len,tb)}}
function wallPiece(base,p,ux,uy,t0,t1){const len=t1-t0,cx=p[0]+ux*(t0+len/2),cy=p[1]+uy*(t0+len/2);return{...base,id:uid(),x:cx-len/2,y:cy-base.h/2,w:len}}
function newWallItem(a,b){const len=Math.hypot(b[0]-a[0],b[1]-a[1]),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2,rot=Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?0:90;return{id:uid(),type:'wall',name:'壁',x:cx-len/2,y:cy-2,w:len,h:4,rotation:rot,color:'#414844',from3d:true}}
function mergeWalls3d(){let merged=true;while(merged){merged=false;const ws=items.filter(i=>i.type==='wall'&&i.from3d);outer:for(const a of ws)for(const b of ws){if(a===b||(a.rotation%180)!==(b.rotation%180))continue;const [a0,a1]=wallSegment(a),[b0,b1]=wallSegment(b),touch=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<1.5;let s=null;if(touch(a1,b0))s=[a0,b1];else if(touch(b1,a0))s=[b0,a1];else continue;const w=newWallItem(s[0],s[1]);w.id=a.id;w.color=a.color;w.name=a.name;items=items.filter(i=>i!==a&&i!==b);items.push(w);merged=true;break outer}}}

// Returns 'add' | 'remove' depending on the action applied to this edge.
function toggleEdge(e,forced){const size=gridPx(),[a,b]=edgePoints(e,size),key=edgeKey(e.k,e.gx,e.gy,size),covers=items.filter(i=>i.type==='wall').map(w=>({w,c:wallItemCovers(w,a,b)})).filter(x=>x.c);
  if(e.itemId&&forced!=='add'&&!covers.some(x=>x.w.id===e.itemId)){b3Checkpoint();items=items.filter(i=>i.id!==e.itemId);B3.stroke&&(B3.stroke.changed=true);return'remove'}
  const {all}=visibleAutoEdges(normalizedTiles()),hidden=hiddenEdges.includes(key),autoVisible=all.has(key)&&!hidden,exists=covers.length||autoVisible,action=forced||(exists?'remove':'add');
  if(action==='remove'){if(!exists)return action;b3Checkpoint();covers.forEach(({w,c})=>{const pieces=[];if(c.ta>2)pieces.push(wallPiece(w,c.p,c.ux,c.uy,0,c.ta));if(c.len-c.tb>2)pieces.push(wallPiece(w,c.p,c.ux,c.uy,c.tb,c.len));items=items.filter(i=>i!==w).concat(pieces)});if(autoVisible)hiddenEdges.push(key)}
  else{if(exists)return action;b3Checkpoint();if(hidden&&all.has(key))hiddenEdges=hiddenEdges.filter(k=>k!==key);else items.push(newWallItem(a,b))}
  B3.stroke&&(B3.stroke.changed=true);return action}

function b3Checkpoint(){if(B3.stroke){if(B3.stroke.saved)return;B3.stroke.saved=true}checkpoint()}

function b3Init(){if(b3renderer)return true;if(!window.THREE){toast('3D表示ライブラリを読み込めませんでした');return false}
  try{b3renderer=new THREE.WebGLRenderer({canvas:builderCanvas,antialias:true,preserveDrawingBuffer:true})}catch(err){toast('この端末では3D表示を利用できません');return false}
  b3renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));b3renderer.shadowMap.enabled=true;b3renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  b3scene=new THREE.Scene();b3scene.background=new THREE.Color('#c9d8de');b3scene.fog=new THREE.Fog('#c9d8de',60,220);
  b3camera=new THREE.PerspectiveCamera(40,1,.1,600);B3.target=new THREE.Vector3();
  b3scene.add(new THREE.HemisphereLight('#ffffff','#8d7b62',1.15));b3sun=new THREE.DirectionalLight('#fff3df',1.7);b3sun.castShadow=true;b3sun.shadow.mapSize.set(2048,2048);b3sun.shadow.bias=-.0005;b3scene.add(b3sun,b3sun.target);
  b3root=new THREE.Group();b3scene.add(b3root);
  b3hover=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#f0a733',transparent:true,opacity:.55,depthWrite:false}));b3hover.visible=false;b3hover.renderOrder=5;b3scene.add(b3hover);
  b3ray=new THREE.Raycaster();return true}

function b3Box(w,h,d,mat,x,y,z,rot=0,shadow=true){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.y=rot;m.castShadow=shadow;m.receiveShadow=true;b3root.add(m);return m}
function itemCenter(i){return[(i.x+i.w/2)/PX,(i.y+i.h/2)/PX]}
function itemRot(i){return-(i.rotation||0)*Math.PI/180}
function furnitureHeight(i){const n=i.name||'';return/ベッド/.test(n)?.48:/ソファ/.test(n)?.8:/テーブル/.test(n)?.72:/収納/.test(n)?1.8:/キッチン/.test(n)?.9:/トイレ/.test(n)?.75:/洗/.test(n)?.85:.6}
function furnitureColor(i){const n=i.name||'';if(i.color&&i.color!=='#e7e5dd')return i.color;return/ベッド/.test(n)?'#f2eee6':/ソファ/.test(n)?'#7f9284':/テーブル/.test(n)?'#a87b52':/収納/.test(n)?'#cdb894':/キッチン/.test(n)?'#e9e6df':'#c9c2b4'}
// Walls drop to waist height while cut-away is on, and automatically while editing walls/openings so interior edges stay clickable.
function b3Lowered(){return B3.cutaway||['wall','door','window'].includes(B3.tool)}
function wallH(){const h=wallHeightCm/100;return b3Lowered()?Math.min(h,.9):h}

function b3Rebuild(){if(!b3renderer)return;B3.dirty=false;
  b3root.traverse(o=>{if(o.geometry)o.geometry.dispose()});b3root.clear();
  const size=gridPx(),s=size/PX,tiles=normalizedTiles(),H=wallH(),PW=canvas.clientWidth/PX,PH=canvas.clientHeight/PX;
  // ground + grid near content
  const box=b3ContentBox(),gx0=Math.max(0,Math.floor(box.minX/s)-6),gy0=Math.max(0,Math.floor(box.minZ/s)-6),gx1=Math.min(Math.floor(PW/s),Math.ceil(box.maxX/s)+6),gy1=Math.min(Math.floor(PH/s),Math.ceil(box.maxZ/s)+6);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(PW,PH),b3Mat('ground','#bfb39d',{roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(PW/2,0,PH/2);ground.receiveShadow=true;ground.userData.ground=true;b3root.add(ground);
  const pts=[];for(let x=gx0;x<=gx1;x++)pts.push(x*s,.004,gy0*s,x*s,.004,gy1*s);for(let y=gy0;y<=gy1;y++)pts.push(gx0*s,.004,y*s,gx1*s,.004,y*s);const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));b3root.add(new THREE.LineSegments(gg,b3Mats.grid||(b3Mats.grid=new THREE.LineBasicMaterial({color:'#8f846f',transparent:true,opacity:.45}))));
  // floor tiles (instanced)
  if(tiles.length){const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(s,.06,s),b3Mat('floor','#ffffff',{roughness:.7}),tiles.length),m=new THREE.Matrix4(),c=new THREE.Color();tiles.forEach((t,n)=>{m.makeTranslation((t.gx+.5)*s,.03,(t.gy+.5)*s);inst.setMatrixAt(n,m);inst.setColorAt(n,c.set(t.color||floorColor))});inst.receiveShadow=true;inst.userData.floor=true;b3root.add(inst)}
  // automatic walls (perimeter + room partitions) minus walls removed in 3D
  const wallMat=b3Mat('wall','#f2eee6'),{visible}=visibleAutoEdges(tiles);
  edgeRuns(visible).forEach(r=>{const len=(r.to-r.from)*s,mid=(r.from+r.to)/2*s,line=r.line*s,m=r.k==='h'?b3Box(len+B3_THICK,H,B3_THICK,wallMat,mid,H/2,line):b3Box(B3_THICK,H,len+B3_THICK,wallMat,line,H/2,mid);m.userData.autoWall=r});
  // plan items
  items.forEach(i=>{const [cx,cz]=itemCenter(i),rot=itemRot(i),sel=i.id===B3.selectedId,hl=sel?{emissive:new THREE.Color('#b86b00'),emissiveIntensity:.45}:{};let m=null;
    if(i.type==='wall'){m=b3Box(i.w/PX+B3_THICK,H,Math.max(B3_THICK,i.h/PX),b3Mat('iwall'+(sel?'s':''),'#e7e1d6',hl),cx,H/2,cz,rot)}
    else if(i.type==='pillar'){m=b3Box(i.w/PX,H,i.h/PX,b3Mat('pillar'+(sel?'s':''),'#8b8579',hl),cx,H/2,cz,rot)}
    else if(isOpening(i)){const w=i.w/PX,isDoor=i.type==='door'||i.type==='sliding-door',lift=i.type==='door'?i.h/2/PX:0,a=-rot,lx=cx-Math.sin(a)*lift,lz=cz+Math.cos(a)*lift;
      if(isDoor){const dh=Math.min(2.0,wallHeightCm/100-.05);m=b3Box(w,Math.min(dh,H+.02),B3_THICK+.05,b3Mat('door'+(sel?'s':''),i.type==='door'?'#9c7552':'#b89a73',hl),lx,Math.min(dh,H+.02)/2,lz,rot)}
      else{const bottom=.9,top=Math.min(wallHeightCm/100-.25,2.0),wh=Math.max(.3,Math.min(top,H+.02)-bottom);if(H<bottom+.05){m=b3Box(w,.04,B3_THICK+.06,b3Mat('sill','#6f8fa0'),lx,H+.02,lz,rot)}else{m=b3Box(w,wh,B3_THICK+.06,b3Mat('glass'+(sel?'s':''),'#9cc4d8',{roughness:.15,metalness:.1,transparent:true,opacity:.78,...hl}),lx,bottom+wh/2,lz,rot,false)}}}
    else if(i.type==='furniture'){const fh=furnitureHeight(i);m=b3Box(i.w/PX,fh,i.h/PX,b3Mat('furn'+(sel?'s':''),furnitureColor(i),hl),cx,fh/2,cz,rot);if(/ベッド/.test(i.name)){const p=new THREE.Mesh(new THREE.BoxGeometry(Math.min(.6,i.w/PX*.4),.1,.32),b3Mat('pillow','#ffffff'));p.position.set(0,fh/2+.05,-(i.h/PX)/2+.25);p.castShadow=true;m.add(p)}}
    if(m)m.userData.itemId=i.id});
  // sun follows content
  const cx=(box.minX+box.maxX)/2,cz=(box.minZ+box.maxZ)/2,r=Math.max(6,Math.hypot(box.maxX-box.minX,box.maxZ-box.minZ)/2+2);b3sun.position.set(cx+r*.6,r*1.6,cz+r*.9);b3sun.target.position.set(cx,0,cz);Object.assign(b3sun.shadow.camera,{left:-r,right:r,top:r,bottom:-r,near:.5,far:r*5});b3sun.shadow.camera.updateProjectionMatrix();
  b3UpdateStatus()}

function b3ContentBox(){const pts=[];floorTiles.forEach(t=>{pts.push([t.x/PX,t.y/PX],[(t.x+t.size)/PX,(t.y+t.size)/PX])});items.forEach(i=>{pts.push([i.x/PX,i.y/PX],[(i.x+i.w)/PX,(i.y+i.h)/PX])});if(!pts.length){const cx=canvas.clientWidth/PX/2,cz=canvas.clientHeight/PX/2;return{minX:cx-4,maxX:cx+4,minZ:cz-4,maxZ:cz+4}}return{minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),minZ:Math.min(...pts.map(p=>p[1])),maxZ:Math.max(...pts.map(p=>p[1]))}}
function b3Fit(){const b=b3ContentBox(),r=Math.max(3,Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)/2+wallHeightCm/200),aspect=b3camera?b3camera.aspect:1.5,fov=40*Math.PI/180,fit=r/Math.sin(Math.min(fov/2,Math.atan(Math.tan(fov/2)*aspect)));B3.target.set((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2);B3.dist=Math.min(260,Math.max(4,fit*1.25));b3Draw()}
function b3UpdateCamera(){const cp=Math.cos(B3.pitch);b3camera.position.set(B3.target.x+B3.dist*cp*Math.sin(B3.yaw),B3.target.y+B3.dist*Math.sin(B3.pitch),B3.target.z+B3.dist*cp*Math.cos(B3.yaw));b3camera.lookAt(B3.target)}
function b3Draw(){if(!b3renderer||B3.raf)return;B3.raf=requestAnimationFrame(()=>{B3.raf=0;if(!b3Open())return;if(B3.dirty)b3Rebuild();b3UpdateCamera();b3renderer.render(b3scene,b3camera)})}
function b3MarkDirty(){B3.dirty=true;if(b3Open())b3Draw()}
function resizeBuilder(){if(!b3Init())return;const r=builderCanvas.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(320,Math.round(r.height));b3renderer.setSize(w,h,false);b3camera.aspect=w/h;b3camera.updateProjectionMatrix();B3.dirty=true;if(!B3.fitted){B3.fitted=true;b3Fit()}b3Draw()}
function drawBuilder(){b3MarkDirty()}

function b3NDC(e){const r=builderCanvas.getBoundingClientRect();return new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1)}
function b3Ground(e){b3UpdateCamera();b3ray.setFromCamera(b3NDC(e),b3camera);const p=new THREE.Vector3();return b3ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.06),p)?p:null}
function b3Pick(e,filter){b3UpdateCamera();b3ray.setFromCamera(b3NDC(e),b3camera);return b3ray.intersectObjects(b3root.children,false).find(h=>filter(h.object))||null}
function b3Cell(e){const p=b3Ground(e);if(!p)return null;const s=cellM();return{gx:Math.floor(p.x/s),gy:Math.floor(p.z/s)}}
function b3Edge(e){const s=cellM(),hit=b3Pick(e,o=>o.userData.autoWall||o.userData.itemId&&items.find(i=>i.id===o.userData.itemId)?.type==='wall');let p=hit?hit.point:b3Ground(e);if(!p)return null;const itemId=hit&&!hit.object.userData.autoWall?hit.object.userData.itemId:null;if(hit?.object.userData.autoWall){const r=hit.object.userData.autoWall;return r.k==='h'?{k:'h',gx:Math.floor(p.x/s),gy:r.line}:{k:'v',gx:r.line,gy:Math.floor(p.z/s)}}
  const fx=p.x/s,fy=p.z/s,gx=Math.floor(fx),gy=Math.floor(fy),dx=fx-gx,dy=fy-gy,opts=[[dy,{k:'h',gx,gy}],[1-dy,{k:'h',gx,gy:gy+1}],[dx,{k:'v',gx,gy}],[1-dx,{k:'v',gx:gx+1,gy}]];opts.sort((a,b)=>a[0]-b[0]);return itemId?{...opts[0][1],itemId}:opts[0][1]}
function b3ShowHover(){const h=B3.hover,s=cellM();if(!h||!b3hover){if(b3hover)b3hover.visible=false;return}b3hover.visible=true;b3hover.material.color.set(B3.tool==='remove'?'#e0533d':'#f0a733');
  if(h.cell){b3hover.scale.set(s*.96,.08,s*.96);b3hover.position.set((h.cell.gx+.5)*s,.07,(h.cell.gy+.5)*s)}
  else if(h.edge){const e=h.edge,hh=B3.tool==='wall'?wallH():.25;if(e.k==='h'){b3hover.scale.set(s,hh,B3_THICK+.06);b3hover.position.set((e.gx+.5)*s,hh/2,e.gy*s)}else{b3hover.scale.set(B3_THICK+.06,hh,s);b3hover.position.set(e.gx*s,hh/2,(e.gy+.5)*s)}}}

function editBuildCell(gx,gy){const size=gridPx(),x=gx*size,y=gy*size;if(x<0||y<0||x+size>canvas.clientWidth||y+size>canvas.clientHeight)return false;const at=floorTiles.findIndex(t=>t.x===x&&t.y===y&&t.size===size);if(B3.tool==='remove'){if(at<0)return false;b3Checkpoint();floorTiles.splice(at,1)}else{if(at>=0)return false;b3Checkpoint();floorTiles.push({x,y,size,color:floorColor,key:tileKey(x,y,size)})}return true}
function b3PaintTo(cell){const st=B3.stroke,from=st.last||cell,steps=Math.max(Math.abs(cell.gx-from.gx),Math.abs(cell.gy-from.gy));let changed=false;for(let n=st.last?1:0;n<=steps;n++){const t=steps?n/steps:0;if(editBuildCell(Math.round(from.gx+(cell.gx-from.gx)*t),Math.round(from.gy+(cell.gy-from.gy)*t)))changed=true}st.last=cell;if(changed){st.changed=true;b3MarkDirty()}}
function b3EndStroke(){const st=B3.stroke;B3.stroke=null;if(!st)return;if(st.kind==='wall')mergeWalls3d();if(st.changed){render();scheduleSave()}}

function b3PlaceOpening(e){const size=gridPx(),[a,b]=edgePoints(e,size),mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,set=new Set(floorTiles.filter(t=>t.size===size).map(t=>`${Math.round(t.x/size)}:${Math.round(t.y/size)}`)),door=B3.tool==='door',type=door?'door':'window',name=door?'片開き戸':'引違い窓',w=door?.8*PX:1.6*PX,h=door?.8*PX:.1*PX;let rot=e.k==='h'?0:90;
  if(door){if(e.k==='h')rot=set.has(`${e.gx}:${e.gy}`)?180:0;else rot=set.has(`${e.gx}:${e.gy}`)?90:270}
  const r=rot*Math.PI/180,lift=door?h/2:0,cx=mx+Math.sin(r)*lift,cy=my-Math.cos(r)*lift;checkpoint();const item={id:uid(),type,name,x:cx-w/2,y:cy-h/2,w,h,rotation:rot,color:'#e7e5dd'};items.push(item);render();scheduleSave();b3Select(item.id);toast(`${name}を配置しました`)}

function b3Select(id){B3.selectedId=id;if(id)select(id);else{selected=null;render()}b3UpdateSelection();b3MarkDirty()}
function b3UpdateSelection(){const i=items.find(x=>x.id===B3.selectedId);$('builder3dSelection').classList.toggle('hidden',!i);if(i)$('b3SelName').textContent=i.name}
function b3UpdateStatus(){const area=floorTiles.reduce((a,t)=>a+(t.size/PX)**2,0),hints={add:'ドラッグで床を連続で塗る',remove:'ドラッグで床を連続で消す',wall:'辺をクリック／なぞって壁を追加・削除',door:'壁の辺をクリックしてドアを配置',window:'壁の辺をクリックして窓を配置',move:'家具・建具をドラッグで移動／空き地ドラッグで視点回転'};$('builder3dStatus').innerHTML=`<b>${floorTiles.length}マス・${area.toFixed(1)}㎡</b><span>壁高 ${wallHeightCm}cm${b3Lowered()?'（壁を下げて表示中）':''}</span><small>${hints[B3.tool]||''}</small>`}

function b3PointerDown(e){if(!b3renderer)return;try{builderCanvas.setPointerCapture(e.pointerId)}catch{}B3.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(B3.pointers.size===2){const st=B3.stroke;if(st&&e.pointerType==='touch'&&performance.now()-st.t0<350&&st.saved&&history.length){B3.stroke=null;restoreState(history.pop());render()}else b3EndStroke();B3.dragItem=null;const [p,q]=[...B3.pointers.values()];B3.pinch={d:Math.hypot(p.x-q.x,p.y-q.y),mx:(p.x+q.x)/2,my:(p.y+q.y)/2,dist:B3.dist,yaw:B3.yaw,pitch:B3.pitch};B3.orbit=null;return}
  if(B3.pointers.size>2)return;
  const orbitBtn=e.button===2||e.button===1||e.altKey;if(orbitBtn){B3.orbit={x:e.clientX,y:e.clientY,yaw:B3.yaw,pitch:B3.pitch,pan:e.shiftKey||e.button===1,target:B3.target.clone()};return}
  if(e.button!==0)return;
  if(B3.tool==='add'||B3.tool==='remove'){const c=b3Cell(e);if(!c)return;B3.stroke={kind:'floor',last:null,changed:false,saved:false,t0:performance.now()};b3PaintTo(c);return}
  if(B3.tool==='wall'){const ed=b3Edge(e),g=b3Ground(e);if(!ed)return;const s=cellM(),ends=ed.k==='h'?[[ed.gx,ed.gy],[ed.gx+1,ed.gy]]:[[ed.gx,ed.gy],[ed.gx,ed.gy+1]],near=g?ends.sort((p,q)=>Math.hypot(p[0]*s-g.x,p[1]*s-g.z)-Math.hypot(q[0]*s-g.x,q[1]*s-g.z))[0]:ends[1];B3.stroke={kind:'wall',changed:false,saved:false,t0:performance.now(),lastV:near};B3.stroke.action=toggleEdge(ed);b3MarkDirty();return}
  if(B3.tool==='door'||B3.tool==='window'){const ed=b3Edge(e);if(ed)b3PlaceOpening(ed);return}
  if(B3.tool==='move'){const hit=b3Pick(e,o=>o.userData.itemId&&['furniture','door','sliding-door','window','fixed-window','pillar'].includes(items.find(i=>i.id===o.userData.itemId)?.type));if(hit){const it=items.find(i=>i.id===hit.object.userData.itemId),g=b3Ground(e);b3Select(it.id);if(g)B3.dragItem={id:it.id,sx:g.x,sz:g.z,ox:it.x,oy:it.y,moved:false};return}b3Select(null);B3.orbit={x:e.clientX,y:e.clientY,yaw:B3.yaw,pitch:B3.pitch,pan:e.shiftKey,target:B3.target.clone()}}}

function b3PointerMove(e){if(!b3renderer)return;if(B3.pointers.has(e.pointerId))B3.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(B3.pinch&&B3.pointers.size>=2){const [p,q]=[...B3.pointers.values()],d=Math.hypot(p.x-q.x,p.y-q.y),mx=(p.x+q.x)/2,my=(p.y+q.y)/2;B3.dist=Math.min(260,Math.max(2.5,B3.pinch.dist*B3.pinch.d/Math.max(20,d)));B3.yaw=B3.pinch.yaw-(mx-B3.pinch.mx)*.008;B3.pitch=Math.min(1.45,Math.max(.2,B3.pinch.pitch+(my-B3.pinch.my)*.006));b3Draw();return}
  if(B3.orbit){const o=B3.orbit,dx=e.clientX-o.x,dy=e.clientY-o.y;if(o.pan){const k=B3.dist*.0016,f=new THREE.Vector3(Math.sin(B3.yaw),0,Math.cos(B3.yaw)),r=new THREE.Vector3(f.z,0,-f.x);B3.target.copy(o.target).addScaledVector(r,-dx*k).addScaledVector(f,-dy*k)}else{B3.yaw=o.yaw-dx*.008;B3.pitch=Math.min(1.45,Math.max(.2,o.pitch+dy*.006))}b3Draw();return}
  if(B3.dragItem){const d=B3.dragItem,g=b3Ground(e),it=items.find(i=>i.id===d.id);if(!g||!it)return;const nx=Math.max(0,Math.min(canvas.clientWidth-it.w,snap(d.ox+(g.x-d.sx)*PX))),ny=Math.max(0,Math.min(canvas.clientHeight-it.h,snap(d.oy+(g.z-d.sz)*PX)));if(nx!==it.x||ny!==it.y){if(!d.moved){checkpoint();d.moved=true}it.x=nx;it.y=ny;b3MarkDirty()}return}
  if(B3.stroke?.kind==='floor'){const c=b3Cell(e);if(c&&(c.gx!==B3.stroke.last?.gx||c.gy!==B3.stroke.last?.gy))b3PaintTo(c)}
  else if(B3.stroke?.kind==='wall'){const g=b3Ground(e);if(g){// walk grid vertices so a drag draws clean straight / L-shaped walls
    const s=cellM(),st=B3.stroke,tx=Math.round(g.x/s),ty=Math.round(g.z/s);let [vx,vy]=st.lastV,n=0;while((vx!==tx||vy!==ty)&&n++<60){let ed;if(vx!==tx){const nx=vx+Math.sign(tx-vx);ed={k:'h',gx:Math.min(vx,nx),gy:vy};vx=nx}else{const ny=vy+Math.sign(ty-vy);ed={k:'v',gx:vx,gy:Math.min(vy,ny)};vy=ny}toggleEdge(ed,st.action)}if(n){st.lastV=[vx,vy];b3MarkDirty()}}}
  if(e.pointerType!=='touch'||B3.stroke){const tool=B3.tool;B3.hover=tool==='add'||tool==='remove'?{cell:b3Cell(e)}:tool==='wall'||tool==='door'||tool==='window'?{edge:b3Edge(e)}:null;if(B3.hover&&!B3.hover.cell&&!B3.hover.edge)B3.hover=null;b3ShowHover();b3Draw()}}

function b3PointerUp(e){B3.pointers.delete(e.pointerId);if(B3.pointers.size<2)B3.pinch=null;if(B3.pointers.size)return;B3.orbit=null;b3EndStroke();if(B3.dragItem){const d=B3.dragItem,it=items.find(i=>i.id===d.id);B3.dragItem=null;if(d.moved&&it){if(isOpening(it))attachOpening(it);render();scheduleSave()}}if(e.pointerType==='touch'){B3.hover=null;b3ShowHover();b3Draw()}}

builderCanvas.addEventListener('pointerdown',b3PointerDown);builderCanvas.addEventListener('pointermove',b3PointerMove);builderCanvas.addEventListener('pointerup',b3PointerUp);builderCanvas.addEventListener('pointercancel',b3PointerUp);
builderCanvas.addEventListener('pointerleave',()=>{if(!B3.pointers.size){B3.hover=null;b3ShowHover();b3Draw()}});
builderCanvas.addEventListener('contextmenu',e=>e.preventDefault());
builderCanvas.addEventListener('wheel',e=>{e.preventDefault();B3.dist=Math.min(260,Math.max(2.5,B3.dist*Math.exp(e.deltaY*.0012)));b3Draw()},{passive:false});

function b3AnimateYaw(delta){const from=B3.yaw,to=from+delta,t0=performance.now();const step=now=>{const t=Math.min(1,(now-t0)/260),k=t<.5?2*t*t:1-(-2*t+2)**2/2;B3.yaw=from+(to-from)*k;b3Draw();if(t<1)requestAnimationFrame(step)};requestAnimationFrame(step)}

// wrap 2D render so undo/redo and 2D edits refresh the 3D scene
const renderBefore3d=render;render=function(){renderBefore3d();if(B3.selectedId&&!items.some(i=>i.id===B3.selectedId))B3.selectedId=null;if(b3Open()){b3UpdateSelection();b3MarkDirty()}};

$('builder3dBtn').onclick=()=>{$('builder3dModal').classList.remove('hidden');B3.fitted=false;B3.selectedId=null;b3UpdateSelection();requestAnimationFrame(resizeBuilder)};
$('closeBuilder3dBtn').onclick=()=>{b3EndStroke();$('builder3dModal').classList.add('hidden');B3.selectedId=null;render();toast('3D編集を間取り図へ反映しました')};
document.querySelectorAll('[data-build-tool]').forEach(b=>b.onclick=()=>{B3.tool=b.dataset.buildTool;document.querySelectorAll('[data-build-tool]').forEach(x=>x.classList.toggle('active',x===b));builderCanvas.dataset.tool=B3.tool;B3.hover=null;b3ShowHover();b3MarkDirty()});
$('wallHeight').oninput=e=>{wallHeightCm=+e.target.value;$('wallHeightLabel').textContent=wallHeightCm+'cm';try{localStorage.setItem('madori-wall-height',wallHeightCm)}catch{}b3MarkDirty()};
$('rotateBuilderLeft').onclick=()=>b3AnimateYaw(-Math.PI/2);$('rotateBuilderRight').onclick=()=>b3AnimateYaw(Math.PI/2);
$('fitBuilderBtn').onclick=()=>b3Fit();
$('cutawayBtn').onclick=()=>{B3.cutaway=!B3.cutaway;$('cutawayBtn').classList.toggle('active',B3.cutaway);b3MarkDirty()};
$('b3UndoBtn').onclick=()=>$('undoBtn').click();
$('b3RotateItem').onclick=()=>{const it=items.find(i=>i.id===B3.selectedId);if(!it)return;checkpoint();it.rotation=((it.rotation||0)+90)%360;render();scheduleSave()};
$('b3DeleteItem').onclick=()=>{if(!B3.selectedId)return;checkpoint();items=items.filter(i=>i.id!==B3.selectedId);B3.selectedId=null;selected=null;render();scheduleSave();b3UpdateSelection()};
$('b3AddFurniture').onchange=e=>{const v=e.target.value;e.target.value='';if(!v)return;const [name,w,h]=v.split('|'),W=+w*PX,Hh=+h*PX,x=Math.max(0,B3.target.x*PX-W/2),y=Math.max(0,B3.target.z*PX-Hh/2);const it=addItem('furniture',name,W,Hh,x,y,false,true);B3.tool='move';document.querySelectorAll('[data-build-tool]').forEach(b=>b.classList.toggle('active',b.dataset.buildTool==='move'));builderCanvas.dataset.tool='move';b3Select(it.id);b3UpdateStatus();toast(`${name}を配置しました。ドラッグで移動できます`)};
window.addEventListener('keydown',e=>{if(!b3Open()||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(e.key==='Escape')$('closeBuilder3dBtn').click();else if((e.key==='r'||e.key==='R')&&B3.selectedId)$('b3RotateItem').click();else if(e.key==='q'||e.key==='Q')$('rotateBuilderLeft').click();else if(e.key==='e'||e.key==='E')$('rotateBuilderRight').click()});

$('roomsTo3dBtn').onclick=()=>{const rooms=items.filter(i=>i.type==='room');if(!rooms.length){toast('先に部屋を配置してください');return}checkpoint();const size=gridPx(),keys=new Set(floorTiles.map(t=>tileKey(t.x,t.y,t.size)));rooms.forEach(room=>{for(let y=Math.floor(room.y/size)*size;y<room.y+room.h;y+=size)for(let x=Math.floor(room.x/size)*size;x<room.x+room.w;x+=size){const key=tileKey(x,y,size);if(!keys.has(key)){floorTiles.push({x,y,size,color:room.color||floorColor,key});keys.add(key)}}});render();scheduleSave();B3.fitted=false;resizeBuilder();toast('既存の部屋を3D化しました')};
try{wallHeightCm=+(localStorage.getItem('madori-wall-height')||240)||240}catch{}$('wallHeight').value=wallHeightCm;$('wallHeightLabel').textContent=wallHeightCm+'cm';
window.addEventListener('resize',()=>{if(b3Open())resizeBuilder()});
