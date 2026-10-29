/* =====================================================================
   UI: map view, overlays, sidebar, editors, setup, kanban
   ===================================================================== */
const cv=$('map'),mctx=cv.getContext('2d'),wrap=$('mapwrap');
let cw=800,ch=600,dpr=1;
const view={cx:W/2,cy:H/2,z:.5};let fitZ=.5,dirty=true,flying=null,lastDraw=0;
let RS=1.5,baseCanvas=null,flatCanvas=null,baseReady=false,detail=null,detailJob=null,detailTimer=0;
let realmFill=null,polFill=null,realmPaths=[],provBorderPath=null;const provPathCache=new Map();
let mapMode='full';const MODES=['full','political','quests'],MODE_LABEL={full:'Full map',political:'Political map',quests:'Quest map'};
const pulses=[];let selTask=null,draft=null,hoverProv=-1;
const ui={realm:'all',showDone:false,tab:'quests',kbRealm:'all',renaming:null};
let phase='boot';
const SKILL_COLORS=['#c2452f','#3a6fb4','#8a5a3c','#d0a21e','#7b4fa6','#22958a','#c4527f','#55893a','#2d6a74','#b0612a','#5b5f97','#8f2d56'];
const skillColor=name=>{const i=skillIdx(name);return SKILL_COLORS[(i<0?0:i)%SKILL_COLORS.length]};
const realmColor=id=>{const r=WD&&WD.realms.find(x=>x.id===id);return r?r.rival.color:'#888'};
const realmName=id=>{const r=WD&&WD.realms.find(x=>x.id===id);return r?r.name:'No realm'};
const goalName=id=>{const g=WD&&WD.goals.find(x=>x.id===id);return g?g.name:''};

/* ---------------- map build ---------------- */
async function buildMap(seed,provinces,genRealms){
  baseReady=false;detail=null;provPathCache.clear();pathCache.clear();extraSett=[];$('loading').hidden=false;
  const prog=async(f,txt)=>{$('ld-fill').style.width=(f*100).toFixed(1)+'%';if(txt)$('ld-step').textContent=txt;await new Promise(r=>setTimeout(r,0))};
  await generate(seed,provinces,Object.assign({},CFG,{_realmCount:genRealms}),prog);
  const small=Math.min(screen.width,screen.height)<700||window.innerWidth<700;RS=Math.min(2.2,Math.sqrt((small?3.2e6:6.5e6)/(W*H)));
  baseCanvas=document.createElement('canvas');await renderRegion(baseCanvas,0,0,W,H,RS,null,f=>prog(.7+f*.22,'Inking the map'));
  flatCanvas=document.createElement('canvas');await renderRegion(flatCanvas,0,0,W,H,Math.min(RS,1.3),null,f=>prog(.92+f*.05,'Drawing the political map'),true);
  await prog(.98,'Marking the borders');
  provBorderPath=new Path2D();for(let p=0;p<P;p++)contourPath(k=>provId[k]===p,pbb[p*4],pbb[p*4+1],pbb[p*4+2],pbb[p*4+3],provBorderPath);
  baseReady=true;$('loading').hidden=true;resize();view.z=fitZ;view.cx=W/2;view.cy=H/2;dirty=true;
}
function provPath(p){if(!provPathCache.has(p))provPathCache.set(p,contourPath(k=>provId[k]===p,pbb[p*4],pbb[p*4+1],pbb[p*4+2],pbb[p*4+3]));return provPathCache.get(p)}
function rebuildRealm(){if(!owner)return;
  if(!realmFill){realmFill=document.createElement('canvas');realmFill.width=FW;realmFill.height=FH;polFill=document.createElement('canvas');polFill.width=FW;polFill.height=FH}
  const a=realmFill.getContext('2d'),b=polFill.getContext('2d'),ia=a.createImageData(FW,FH),ib=b.createImageData(FW,FH),da=ia.data,db=ib.data;const cols={};
  for(let k=0;k<N;k++){const p=provId[k];if(p<0)continue;const o=owner[p];const j=k*4;
    if(o<0){db[j]=150;db[j+1]=140;db[j+2]=120;db[j+3]=34;continue}
    const c=cols[o]||(cols[o]=hexRgb(colorOf(o)));da[j]=c[0];da[j+1]=c[1];da[j+2]=c[2];da[j+3]=o===PLAYER?84:26;db[j]=c[0];db[j+1]=c[1];db[j+2]=c[2];db[j+3]=o===PLAYER?185:140}
  a.putImageData(ia,0,0);b.putImageData(ib,0,0);
  const groups=new Map();for(let p=0;p<P;p++){const o=owner[p];if(o<0)continue;if(!groups.has(o))groups.set(o,[FW,FH,-1,-1]);const g=groups.get(o);
    g[0]=Math.min(g[0],pbb[p*4]);g[1]=Math.min(g[1],pbb[p*4+1]);g[2]=Math.max(g[2],pbb[p*4+2]);g[3]=Math.max(g[3],pbb[p*4+3])}
  realmPaths=[];for(const [o,g] of groups)realmPaths.push({o,path:contourPath(k=>{const p=provId[k];return p>=0&&owner[p]===o},g[0],g[1],g[2],g[3])});
  realmPaths.sort((x,y)=>(x.o===PLAYER)-(y.o===PLAYER));
  // label anchor per realm: cell-weighted centre, snapped into the realm if it falls outside
  const acc=new Map();for(let p=0;p<P;p++){const o=owner[p];if(o<0)continue;if(!acc.has(o))acc.set(o,{x:0,y:0,n:0,ps:[]});const a=acc.get(o);a.x+=pcx[p]*pcells[p];a.y+=pcy[p]*pcells[p];a.n+=pcells[p];a.ps.push(p)}
  realmLabels=[];for(const [o,a] of acc){let x=a.x/a.n,y=a.y/a.n;const c0=provId[cellAt(x,y)];if(c0<0||owner[c0]!==o){let best=a.ps[0],bd=Infinity;for(const p of a.ps){const d=(pcx[p]-x)**2+(pcy[p]-y)**2;if(d<bd){bd=d;best=p}}x=pcx[best];y=pcy[best]}
    realmLabels.push({o,x,y,area:a.n*CS*CS})}
  dirty=true}
let realmLabels=[];
function drawRealmLabels(c){const fade=clamp(1-(view.z/fitZ-2)/2.5,0,1);if(fade<=0)return;c.save();c.textAlign='center';c.textBaseline='middle';
  for(const L of realmLabels){const name=ownerName(L.o);if(!name)continue;const size=clamp(Math.sqrt(L.area)*1.5/Math.max(6,name.length*.55),16,90);
    c.font=`${size}px 'IM Fell English SC', 'Palatino Linotype', Georgia, serif`;try{c.letterSpacing=(size*.06)+'px'}catch(e){}
    c.globalAlpha=.8*fade;c.lineJoin='round';c.lineWidth=size*.12;c.strokeStyle='rgba(246,236,212,.92)';c.strokeText(name,L.x,L.y,Math.sqrt(L.area)*1.4);
    c.fillStyle=L.o===PLAYER?'#6d480f':'#2b2117';c.fillText(name,L.x,L.y,Math.sqrt(L.area)*1.4)}
  c.restore()}
function pulse(p,color){if(p==null||p<0)return;pulses.push({p,color,t0:performance.now()});dirty=true}

/* ---------------- view ---------------- */
function resize(){const r=wrap.getBoundingClientRect();cw=Math.max(1,r.width);ch=Math.max(1,r.height);dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);const of=fitZ;fitZ=Math.min(cw/W,ch/H)*.98;if(view.z===of||view.z<fitZ*.9)view.z=fitZ;clampView();dirty=true;scheduleDetail()}
function clampView(){view.z=clamp(view.z,fitZ*.9,16);view.cx=clamp(view.cx,0,W);view.cy=clamp(view.cy,0,H)}
const toScreen=(x,y)=>[(x-view.cx)*view.z+cw/2,(y-view.cy)*view.z+ch/2];
const toWorld=(sx,sy)=>[(sx-cw/2)/view.z+view.cx,(sy-ch/2)/view.z+view.cy];
function zoomAt(sx,sy,f){const [wx,wy]=toWorld(sx,sy);view.z=clamp(view.z*f,fitZ*.9,16);view.cx=wx-(sx-cw/2)/view.z;view.cy=wy-(sy-ch/2)/view.z;clampView();dirty=true;hideTip();hidePop();scheduleDetail()}
function flyTo(x,y,z){flying={a:{...view},b:{cx:x,cy:y,z:clamp(z||view.z,fitZ*.9,16)},t0:performance.now(),d:650}}
function flyHome(z){if(!WD||WD.home<0)return;const s=settById(WD.home);if(s)flyTo(s.x,s.y,z||Math.max(view.z,fitZ*2.4))}
function scheduleDetail(){clearTimeout(detailTimer);detailTimer=setTimeout(startDetail,260)}
async function startDetail(){
  if(!baseReady||mapMode!=='full')return;const target=view.z*dpr;if(target<=RS*1.15)return;
  const vw=cw/view.z,vh=ch/view.z;const x0=Math.max(0,view.cx-vw*.6),y0=Math.max(0,view.cy-vh*.6),x1=Math.min(W,view.cx+vw*.6),y1=Math.min(H,view.cy+vh*.6);
  const rw=x1-x0,rh=y1-y0;if(rw<=0||rh<=0)return;
  if(detail&&detail.scale>=Math.min(target,18)*.92&&detail.x0<=view.cx-vw/2&&detail.y0<=view.cy-vh/2&&detail.x0+detail.w>=view.cx+vw/2&&detail.y0+detail.h>=view.cy+vh/2)return;
  const scale=Math.min(target,18,Math.sqrt(4.2e6/(rw*rh)));if(scale<=RS*1.05)return;
  if(detailJob)detailJob.cancel=true;const job={cancel:false};detailJob=job;
  const cnv=document.createElement('canvas');const res=await renderRegion(cnv,x0,y0,rw,rh,scale,job);
  if(res&&!job.cancel){detail={canvas:cnv,x0,y0,w:res.pw/scale,h:res.ph/scale,scale};dirty=true}
}

/* ---------------- drawing ---------------- */
function settSize(s){const t=settType(s);return t==='castle'?13:t==='town'?9:t==='fort'?7.5:4.5}
function settScale(){return Math.max(1,.62/view.z)}
function besiegedIds(){const s=new Set();if(WD)for(const a of WD.armies)if(a.sieged||now()>=a.arrive)s.add(a.target);return s}
function draw(nowT){
  const c=mctx;c.setTransform(1,0,0,1,0,0);c.fillStyle=mapMode==='full'?'#16304a':'#c4d4d0';c.fillRect(0,0,cv.width,cv.height);
  if(!baseReady)return;
  const z=view.z*dpr,tx=cw*dpr/2-view.cx*z,ty=ch*dpr/2-view.cy*z;c.setTransform(z,0,0,z,tx,ty);
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  if(mapMode==='full'){c.drawImage(baseCanvas,0,0,W,H);if(detail)c.drawImage(detail.canvas,detail.x0,detail.y0,detail.w,detail.h)}else c.drawImage(flatCanvas,0,0,W,H);
  const px=1/view.z;c.lineCap='round';c.lineJoin='round';
  if(owner&&mapMode==='full'&&realmFill)c.drawImage(realmFill,0,0,W,H);
  if(owner&&mapMode==='political'&&polFill)c.drawImage(polFill,0,0,W,H);
  if(provBorderPath&&(mapMode!=='full'||view.z>fitZ*1.7)){c.strokeStyle=mapMode==='full'?'rgba(58,43,29,.28)':'rgba(58,43,29,.55)';c.lineWidth=(mapMode==='full'?1:1.1)*px;if(mapMode==='full')c.setLineDash([3*px,3*px]);c.stroke(provBorderPath);c.setLineDash([])}
  if(owner&&mapMode!=='quests')for(const rp of realmPaths){if(rp.o===PLAYER){c.strokeStyle='rgba(212,161,44,.45)';c.lineWidth=7*px;c.stroke(rp.path);c.strokeStyle='#7a5413';c.lineWidth=2*px;c.stroke(rp.path)}
    else{c.strokeStyle=colorOf(rp.o);c.globalAlpha=mapMode==='political'?1:.75;c.lineWidth=(mapMode==='political'?2:1.6)*px;if(mapMode==='full')c.setLineDash([5*px,4*px]);c.stroke(rp.path);c.setLineDash([]);c.globalAlpha=1}}
  if(mapMode==='full')drawWatermark(c);else if(mapMode==='political')drawRealmLabels(c);
  if(hoverProv>=0){c.strokeStyle=mapMode==='full'?'rgba(255,250,236,.95)':'rgba(43,33,23,.9)';c.lineWidth=2.2*px;c.stroke(provPath(hoverProv))}
  for(let i=pulses.length-1;i>=0;i--){const pu=pulses[i],a=1-(nowT-pu.t0)/2400;if(a<=0){pulses.splice(i,1);continue}
    c.globalAlpha=a;c.strokeStyle=pu.color;c.lineWidth=(4+6*(1-a))*px;c.stroke(provPath(pu.p));c.globalAlpha=1}
  if(!owner||!WD)return;
  // settlements (world space, scaled up when zoomed out)
  const bes=besiegedIds();
  {const sf=settScale();const vw=cw/view.z,vh=ch/view.z;
    const list=allSett().filter(s=>(mapMode!=='quests'||bes.has(s.id))&&Math.abs(s.x-view.cx)<vw/2+40&&Math.abs(s.y-view.cy)<vh/2+60).sort((a,b)=>a.y-b.y);
    for(const s of list){const o=owner[s.prov];const capOf=WD.realms.findIndex(r=>r.rival.capital===s.id);const main=s.id===WD.home;
      const t2=settType(s);const k=t2==='castle'?sf:Math.max(1,sf*.85);if(t2==='village'&&view.z<fitZ*1.25&&!main)continue;
      if(main){const g=c.createRadialGradient(s.x,s.y-8*k,1,s.x,s.y-8*k,26*k);g.addColorStop(0,'rgba(255,214,110,.55)');g.addColorStop(1,'rgba(255,214,110,0)');c.fillStyle=g;c.beginPath();c.arc(s.x,s.y-8*k,26*k,0,6.2832);c.fill()}
      c.save();c.translate(s.x,s.y);c.scale(k,k);drawSettlement(c,{type:t2,r:s.r},o>=0?colorOf(o):(t2==='castle'?'#8a7a66':null),main||(capOf>=0&&o===capOf));c.restore()}}
  // army routes
  const armies=[];
  for(const a of WD.armies){const st=armyState(a);armies.push([a,st]);if(st.phase!=='march')continue;
    const p=st.pa.p;c.beginPath();c.moveTo(st.pos.x,st.pos.y);for(let i=(st.pos.i+1)*2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);
    const col=armyRival(a).color;c.strokeStyle='rgba(30,20,12,.45)';c.lineWidth=4.2*px;c.stroke();c.strokeStyle=col;c.lineWidth=2.2*px;c.setLineDash([7*px,5*px]);c.lineDashOffset=-nowT/60*px;c.stroke();c.setLineDash([]);c.lineDashOffset=0}
  // screen-space sprites
  c.setTransform(dpr,0,0,dpr,0,0);
  for(const id of bes){const s=settById(id);if(!s)continue;const [x,y]=toScreen(s.x,s.y);const r=14+Math.sin(nowT/220)*2;
    c.strokeStyle='rgba(192,57,43,.9)';c.lineWidth=2.5;c.setLineDash([5,4]);c.beginPath();c.arc(x,y-6,r+settSize(s)*view.z*.6,0,6.2832);c.stroke();c.setLineDash([]);swords(c,x+16,y-22)}
  if(mapMode!=='political'){const tasks=WD.tasks.slice().sort((a,b)=>a.y-b.y);
    for(const t of tasks)if(t.status==='done'&&mapMode==='full')drawPin(c,t,t.id===selTask);
    for(const t of tasks)if(t.status!=='done')drawPin(c,t,t.id===selTask);
    if(draft)drawPin(c,draft,true)}
  for(const [a,st] of armies)drawArmy(c,a,st,nowT);
}
function drawWatermark(c){if(!WD||!WD.name)return;const a=.45*clamp(1-(view.z/fitZ-1)/1.5,0,1);if(a<=.005)return;
  const size=Math.min(250,W*.94/Math.max(5,WD.name.length*.5));c.save();c.globalAlpha=a;c.textAlign='center';c.textBaseline='middle';
  c.font=`${size}px 'IM Fell English SC', 'Palatino Linotype', Georgia, serif`;try{c.letterSpacing=(size*.08)+'px'}catch(e){}
  const x=W/2,y=H*.47;
  c.lineJoin='round';c.lineWidth=size*.07;c.strokeStyle='rgba(246,234,206,.9)';c.strokeText(WD.name,x,y,W*.9);c.fillStyle='#3a2b1d';c.fillText(WD.name,x,y,W*.9);
  c.restore()}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{dirty=true});
function swords(c,x,y){c.save();c.translate(x,y);c.strokeStyle='#2b2117';c.lineWidth=4;c.lineCap='round';c.beginPath();c.moveTo(-6,-6);c.lineTo(6,6);c.moveTo(6,-6);c.lineTo(-6,6);c.stroke();
  c.strokeStyle='#e8e2d6';c.lineWidth=2;c.beginPath();c.moveTo(-6,-6);c.lineTo(6,6);c.moveTo(6,-6);c.lineTo(-6,6);c.stroke();c.restore()}
function drawPin(c,t,sel){const [x,y]=toScreen(t.x,t.y);if(x<-200||y<-60||x>cw+30||y>ch+40)return;
  const col=realmColor(t.realm),st=isOverdue(t)?'overdue':taskStatus(t);c.lineJoin='round';
  if(st==='done'){c.globalAlpha=.9;c.strokeStyle=INK;c.lineWidth=1.2;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-15);c.stroke();
    c.beginPath();c.moveTo(x+.5,y-15);c.lineTo(x+10,y-13);c.lineTo(x+.5,y-9.5);c.closePath();c.fillStyle=GOLD;c.fill();c.stroke();c.globalAlpha=1;
    if(sel){c.strokeStyle='#fff7da';c.lineWidth=2;c.beginPath();c.arc(x,y,8,0,6.2832);c.stroke()}return}
  c.fillStyle='rgba(20,12,6,.35)';c.beginPath();c.ellipse(x,y+1,6,2.2,0,0,6.2832);c.fill();
  if(sel){c.strokeStyle='#fff7da';c.lineWidth=2.5;c.beginPath();c.arc(x,y,11,0,6.2832);c.stroke()}
  c.strokeStyle=INK;c.lineWidth=1.8;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-28);c.stroke();
  c.beginPath();c.moveTo(x+1,y-28);c.quadraticCurveTo(x+10,y-30,x+20,y-26);c.lineTo(x+15,y-21.5);c.lineTo(x+20,y-17);c.quadraticCurveTo(x+10,y-20,x+1,y-17);c.closePath();c.fillStyle=col;c.fill();c.lineWidth=1.2;c.stroke();
  c.fillStyle='rgba(255,248,230,.95)';for(let i=0;i<t.diff;i++){c.beginPath();c.arc(x+4.5+i*3.2,y-22.6,1.1,0,6.2832);c.fill()}
  c.beginPath();c.arc(x,y,2.8,0,6.2832);c.fillStyle='#f3e6c8';c.fill();c.lineWidth=1.2;c.strokeStyle=INK;c.stroke();
  if(st==='overdue'){c.beginPath();c.arc(x,y-29,3,0,6.2832);c.fillStyle='#c0392b';c.fill();c.stroke()}
  else if(t.deadline){c.beginPath();c.arc(x,y-29,2.4,0,6.2832);c.fillStyle='#e8a33a';c.fill();c.stroke()}
  if(mapMode==='quests'){const font=getComputedStyle(document.body).fontFamily;c.font='600 12.5px '+font;
    const due=t.deadline?(st==='overdue'?'Overdue':'Due '+fmtDay(deadlineEnd(t.deadline))):'';const title=t.title.length>34?t.title.slice(0,33)+'…':t.title;
    const w1=c.measureText(title).width;c.font='11.5px '+font;const w2=due?c.measureText(due).width:0;const bw=Math.max(w1,w2)+14,bh=due?34:20;
    const bx=x+22,by=y-30;c.fillStyle='rgba(248,240,221,.96)';c.strokeStyle='rgba(58,43,29,.6)';c.lineWidth=1;c.beginPath();c.roundRect?c.roundRect(bx,by,bw,bh,6):c.rect(bx,by,bw,bh);c.fill();c.stroke();
    c.fillStyle='#2b2117';c.font='600 12.5px '+font;c.fillText(title,bx+7,by+14);if(due){c.font='11.5px '+font;c.fillStyle=st==='overdue'?'#a5302a':'#6a5a42';c.fillText(due,bx+7,by+28)}}
}
function drawArmy(c,a,st,nowT){const [x,y]=toScreen(st.pos.x,st.pos.y);if(x<-40||y<-50||x>cw+40||y>ch+40)return;
  const col=armyRival(a).color;const sx0=st.phase==='siege'?x+18:x;c.lineJoin='round';
  c.fillStyle='rgba(20,12,6,.35)';c.beginPath();c.ellipse(sx0,y+3,15,4,0,0,6.2832);c.fill();
  [[-9,1],[0,-1],[9,1]].forEach(([dx,dy],i)=>{const b=st.phase==='march'?Math.sin(nowT/170+i*1.7)*1.2:0;const sx=sx0+dx,sy=y+dy+b;
    c.strokeStyle=INK;c.lineWidth=1;c.beginPath();c.moveTo(sx+3.5,sy+2);c.lineTo(sx+3.5,sy-15);c.stroke();
    c.beginPath();c.moveTo(sx+2,sy-15);c.lineTo(sx+3.5,sy-18);c.lineTo(sx+5,sy-15);c.closePath();c.fillStyle='#ddd';c.fill();c.stroke();
    c.beginPath();c.arc(sx,sy-10,2.6,0,6.2832);c.fillStyle='#8c8f96';c.fill();c.stroke();
    c.beginPath();c.moveTo(sx-3.6,sy-7);c.lineTo(sx+3.6,sy-7);c.lineTo(sx+3.2,sy-1.5);c.lineTo(sx,sy+1.5);c.lineTo(sx-3.2,sy-1.5);c.closePath();c.fillStyle=col;c.fill();c.stroke()});
  const bx=sx0-14,by=y;c.strokeStyle=INK;c.lineWidth=1.4;c.beginPath();c.moveTo(bx,by+2);c.lineTo(bx,by-30);c.stroke();
  const wv=Math.sin(nowT/260)*1.5;c.beginPath();c.moveTo(bx,by-30);c.quadraticCurveTo(bx-8,by-31+wv,bx-15,by-29);c.lineTo(bx-15,by-18);c.quadraticCurveTo(bx-8,by-20+wv,bx,by-19);c.closePath();c.fillStyle=col;c.fill();c.stroke();
  const left=st.eta-now();const label=(st.phase==='siege'?'Siege ':'')+fmtDur(left);
  c.font='700 12px '+getComputedStyle(document.body).fontFamily;const tw=c.measureText(label).width+10;
  c.fillStyle=st.phase==='siege'?'rgba(150,30,25,.95)':'rgba(43,33,23,.9)';c.beginPath();c.roundRect?c.roundRect(sx0-tw/2,y-40,tw,17,8):c.rect(sx0-tw/2,y-40,tw,17);c.fill();
  c.fillStyle=left<2*DAY?'#ffd2cc':'#f6ead0';c.textAlign='center';c.textBaseline='middle';c.fillText(label,sx0,y-31.3);c.textAlign='start';c.textBaseline='alphabetic';
}
function loop(nowT){requestAnimationFrame(loop);
  if(flying){const f=clamp((nowT-flying.t0)/flying.d,0,1),e=f<.5?2*f*f:1-Math.pow(-2*f+2,2)/2;const A=flying.a,B=flying.b;
    view.z=Math.exp(Math.log(A.z)+(Math.log(B.z)-Math.log(A.z))*e);view.cx=A.cx+(B.cx-A.cx)*e;view.cy=A.cy+(B.cy-A.cy)*e;dirty=true;if(f>=1){flying=null;clampView();scheduleDetail()}}
  const anim=pulses.length||(WD&&WD.armies&&WD.armies.length);
  if(!dirty&&!(anim&&nowT-lastDraw>45))return;lastDraw=nowT;dirty=false;draw(nowT)}

/* ---------------- hit testing & pointer ---------------- */
function hitAt(sx,sy){if(!WD||!owner||!baseReady)return null;
  for(const a of WD.armies){const st=armyState(a);const [x0,y]=toScreen(st.pos.x,st.pos.y);const x=st.phase==='siege'?x0+18:x0;if(Math.abs(sx-x)<20&&sy>y-42&&sy<y+6)return{kind:'army',a,st}}
  if(mapMode!=='political'){let best=null;for(const t of WD.tasks){if(t.status==='done'&&mapMode!=='full')continue;const [x,y]=toScreen(t.x,t.y);const big=t.status!=='done';if(sx>x-6&&sx<x+(big?22:12)&&sy>y-(big?31:17)&&sy<y+6)best={kind:'task',t}}if(best)return best}
  {const sf=settScale();let best=null,bd=1e9;const besH=besiegedIds();for(const s of allSett()){if(mapMode==='quests'&&!besH.has(s.id))continue;const t2=settType(s);if(t2==='village'&&view.z<fitZ*1.25&&s.id!==WD.home)continue;const [x,y]=toScreen(s.x,s.y);const r=Math.max(7,settSize(s)*view.z*sf);
      if(Math.abs(sx-x)<r&&sy>y-r*2.1&&sy<y+5){const d=Math.abs(sx-x)+Math.abs(sy-(y-r));if(d<bd){bd=d;best={kind:'sett',s}}}}if(best)return best}
  const [wx,wy]=toWorld(sx,sy);if(wx<0||wy<0||wx>W||wy>H)return null;const p=provId[cellAt(wx,wy)];return{kind:'prov',p,wx,wy}}
const pointers=new Map();let drag=null,pinch=null;
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});flying=null;
  if(pointers.size===1)drag={sx:e.offsetX,sy:e.offsetY,cx:view.cx,cy:view.cy,moved:false};
  else if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,z:view.z,w:toWorld((a.x+b.x)/2,(a.y+b.y)/2)};drag=null}});
cv.addEventListener('pointermove',e=>{
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
  if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()];const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;view.z=clamp(pinch.z*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d,fitZ*.9,16);
    view.cx=pinch.w[0]-(mx-cw/2)/view.z;view.cy=pinch.w[1]-(my-ch/2)/view.z;clampView();dirty=true;hideTip();hidePop();return}
  if(drag){const dx=e.offsetX-drag.sx,dy=e.offsetY-drag.sy;if(!drag.moved&&Math.abs(dx)+Math.abs(dy)>5){drag.moved=true;cv.classList.add('dragging');hideTip();hidePop()}
    if(drag.moved){view.cx=drag.cx-dx/view.z;view.cy=drag.cy-dy/view.z;clampView();dirty=true}return}
  if(e.pointerType==='mouse')onHover(e.offsetX,e.offsetY)});
function endPointer(e){const wasDrag=drag;pointers.delete(e.pointerId);cv.classList.remove('dragging');
  if(pinch){if(pointers.size<2){pinch=null;drag=null;scheduleDetail()}return}
  if(wasDrag){drag=null;if(!wasDrag.moved&&e.type==='pointerup')handleClick(e.offsetX,e.offsetY);else scheduleDetail()}}
cv.addEventListener('pointerup',endPointer);cv.addEventListener('pointercancel',endPointer);
cv.addEventListener('pointerleave',()=>{if(!drag){if(hoverProv>=0){hoverProv=-1;dirty=true}clearTimeout(tipT);tipKey='';scheduleHideTip()}});
cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.offsetX,e.offsetY,Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0016)))},{passive:false});

/* ---------------- tooltips ---------------- */
let tipT=0,tipKey='',tipHideT=0;const tipEl=$('tip');
function onHover(sx,sy){const h=hitAt(sx,sy);cv.classList.toggle('pointing',!!h&&h.kind!=='prov');
  const hp=h&&h.kind==='prov'?h.p:-1;if(hp!==hoverProv){hoverProv=hp;dirty=true}
  const key=!h||h.p<0&&h.kind==='prov'?'':h.kind+':'+(h.a?h.a.id:h.t?h.t.id:h.s?h.s.id:h.p);
  if(key===tipKey)return;tipKey=key;clearTimeout(tipT);
  if(!key){scheduleHideTip();return}
  if(!tipEl.hidden)scheduleHideTip();
  tipT=setTimeout(()=>{if(tipKey===key)showTip(h,sx,sy)},h.kind==='prov'?480:140)}
function scheduleHideTip(){clearTimeout(tipHideT);tipHideT=setTimeout(hideTip,240)}
function hideTip(){clearTimeout(tipHideT);tipEl.hidden=true}
tipEl.addEventListener('pointerenter',()=>{clearTimeout(tipHideT);clearTimeout(tipT)});
tipEl.addEventListener('pointerleave',()=>{tipKey='';scheduleHideTip()});
function placeFloat(el,sx,sy){el.hidden=false;el.style.left='0px';el.style.top='0px';const r=el.getBoundingClientRect();
  let x=sx+14,y=sy+14;if(x+r.width>cw-8)x=sx-r.width-14;if(y+r.height>ch-8)y=Math.max(8,sy-r.height-14);el.style.left=Math.max(8,x)+'px';el.style.top=Math.max(8,y)+'px'}
function provInfoHtml(p){const o=owner[p];const sid=settInProv(p);const s=sid>=0?settById(sid):null;const cap=isCapitalProv(p);
  let h=`<div class="k">${o>=0?`<span class="dot" style="--c:${colorOf(o)}"></span> `:''}${esc(ownerName(o))}</div><div class="m">${PTYPE_LABEL[ptype[p]]}${pcoast[p]?', coastal':''} · worth ${provRate(p).toFixed(0)} gold a day</div>`;
  if(s)h+=`<div class="m">${STYPE_LABEL[settType(s)]} of ${esc(settName(s.id))}${cap>=0&&owner[p]===cap?` · capital of ${esc(WD.realms[cap].rival.name)}`:''}${s.id===WD.home?' · your seat':''}</div>`;
  return h}
function showTip(h,sx,sy){let html='';const t0=now();
  if(h.kind==='prov'){if(h.p<0)return;const pc=plantCheck(h.p);html=provInfoHtml(h.p)+`<div class="m">${pc.ok?(pc.cost?esc(pc.text):'Click to plant a quest here.'):esc(pc.text||'')}</div>`}
  else if(h.kind==='task'){const t=h.t,st=isOverdue(t)?'overdue':taskStatus(t);
    html=`<button class="tlink k" data-open-task="${t.id}">${esc(t.title)}</button><div class="m">${esc(realmName(t.realm))}${t.goal?' · '+esc(goalName(t.goal)):''} · ${diffOf(t.diff).name}</div>
      <div class="m">${st==='done'?'Done '+fmtDay(t.doneAt):st==='overdue'?'<span class="danger"><b>!</b> Overdue</span>':t.deadline?'Due '+fmtWhen(deadlineEnd(t.deadline),t0):'No deadline'}${st!=='done'?' · '+STATUS_LABEL[t.status==='progress'?'progress':'open']:''}</div>
      ${st!=='done'?`<label><input type="checkbox" data-done-task="${t.id}"> Mark as done</label>`:''}`}
  else if(h.kind==='army'){const a=h.a,st=h.st,c=armyCause(a),r=armyRival(a);
    html=`<div class="k"><span class="dot" style="--c:${r.color}"></span> ${esc(r.name)}</div>
      <div class="m">${st.phase==='march'?`Marching on ${esc(settName(a.target))}. Arrives ${fmtWhen(a.arrive,t0)}${a.mtn?`, slowed by ${a.mtn} rough ${a.mtn>1?'provinces':'province'} (mountains, ashlands or craters)`:''}.`:`Besieging ${esc(settName(a.target))}. It falls ${fmtWhen(st.eta,t0)}.`}</div>
      <div class="m">Because of <button class="tlink" ${c.ref.task?`data-open-task="${c.ref.task}"`:`data-open-goal="${c.ref.goal}"`}>${esc(c.label)}</button>. ${c.why?esc(c.why):''} To stop it, ${esc(c.fix)}.</div>`}
  else if(h.kind==='sett'){const s=h.s,o=owner[s.prov],cap=WD.realms.findIndex(r=>r.rival.capital===s.id);const bes=besiegedIds().has(s.id);
    html=`<div class="k">${esc(settName(s.id))} ${bes?'<span class="besieged">⚔ under siege</span>':''}</div><div class="m">${s.id===WD.home?'Your seat of power':STYPE_LABEL[settType(s)]} · ${esc(ownerName(o))}</div>`;
    if(cap>=0&&o===cap)html+=`<div class="m">Capital of ${esc(WD.realms[cap].rival.name)} · ${rivalCount(cap)} provinces</div>`;
    html+=`<div class="m">Worth ${provRate(s.prov).toFixed(0)} gold a day with its province. Click to rename.</div>`}
  tipEl.innerHTML=html;placeFloat(tipEl,sx,sy)}
tipEl.addEventListener('click',e=>{const ot=e.target.closest('[data-open-task]');if(ot){const t=WD.tasks.find(x=>x.id===ot.dataset.openTask);hideTip();if(t)openQuestEditor(t,false);return}
  const og=e.target.closest('[data-open-goal]');if(og){const g=WD.goals.find(x=>x.id===og.dataset.openGoal);hideTip();if(g)openGoalEditor(g,false)}});
tipEl.addEventListener('change',e=>{const d=e.target.closest('[data-done-task]');if(d&&d.checked){const t=WD.tasks.find(x=>x.id===d.dataset.doneTask);hideTip();if(t)doComplete(t)}});

/* ---------------- click popover (plant / rename) ---------------- */
const popEl=$('pop');let popAt=null;
let popTimer=0;
function hidePop(){clearTimeout(popTimer);popEl.hidden=true;popAt=null}
function armPop(ms){clearTimeout(popTimer);popTimer=setTimeout(()=>{if(popEl.contains(document.activeElement)&&document.activeElement.tagName==='INPUT')return;hidePop()},ms)}
popEl.addEventListener('pointerenter',()=>clearTimeout(popTimer));
popEl.addEventListener('pointerleave',()=>{if(!popEl.hidden)armPop(1500)});
popEl.addEventListener('focusin',()=>clearTimeout(popTimer));
function handleClick(sx,sy){hideTip();
  if(phase==='seat'){const h=hitAt(sx,sy);if(h&&h.kind==='sett'&&settType(h.s)==='castle'){setSeat(h.s.id)}return}
  if(phase!=='play')return;$('npanel').hidden=true;
  const h=hitAt(sx,sy);if(!h){hidePop();return}
  if(h.kind==='task'){hidePop();openQuestEditor(h.t,false);return}
  if(h.kind==='army'){hidePop();const c=armyCause(h.a);if(c.ref.task){const t=WD.tasks.find(x=>x.id===c.ref.task);if(t)openQuestEditor(t,false)}else{const g=WD.goals.find(x=>x.id===c.ref.goal);if(g)openGoalEditor(g,false)}return}
  if(h.kind==='sett'){popAt={sett:h.s.id};popEl.innerHTML=`<div class="k">Rename ${STYPE_LABEL[settType(h.s)].toLowerCase()}</div><input type="text" id="pop-name" maxlength="40" value="${esc(settName(h.s.id))}"><div class="row"><button class="btn btn-gold" id="pop-save">Save name</button><button class="btn" id="pop-cancel">Cancel</button></div>`;
    placeFloat(popEl,sx,sy);clearTimeout(popTimer);setTimeout(()=>{const i=$('pop-name');if(i){i.focus();i.select()}},20);return}
  if(h.p<0){hidePop();return}
  const pc=plantCheck(h.p);popAt={x:h.wx,y:h.wy,p:h.p,cost:pc.cost||0};
  popEl.innerHTML=provInfoHtml(h.p)+(pc.ok?`<button class="btn btn-gold" id="pop-plant">${pc.cost?`Send a raiding expedition · ${pc.cost} gold`:'Plant a quest here'}</button>`:`<div class="m">${esc(pc.text)}</div>${pc.reason==='gold'?`<button class="btn" disabled>Raiding expedition · ${pc.cost} gold</button>`:''}`);
  placeFloat(popEl,sx,sy);armPop(3500);hoverProv=h.p;dirty=true}
popEl.addEventListener('click',e=>{const id=e.target.id;
  if(id==='pop-plant'&&popAt){const o=owner[popAt.p];const realm=o>=0&&o!==PLAYER?WD.realms[o].id:(ui.realm!=='all'?ui.realm:WD.realms[0].id);
    const t=newTask({x:popAt.x,y:popAt.y,prov:popAt.p,realm});t._raid=popAt.cost;hidePop();openQuestEditor(t,true)}
  else if(id==='pop-save'&&popAt){const v=$('pop-name').value.trim();if(v){WD.names[popAt.sett]=v;renderAll()}hidePop()}
  else if(id==='pop-cancel')hidePop()});
popEl.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pop-name'){e.preventDefault();$('pop-save').click()}});

/* ---------------- date picker ---------------- */
const nativeVal=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
const isoRe=/^\d{4}-\d\d-\d\d$/;
const isoOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dateOf=iso=>{const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d)};
function fmtLong(iso){return dateOf(iso).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
function enhanceDates(root){for(const el of root.querySelectorAll('input.datein')){if(el._dp)continue;el._dp=true;const iso=el.getAttribute('value')||'';
  Object.defineProperty(el,'value',{configurable:true,get(){return el.dataset.iso||''},set(v){el.dataset.iso=isoRe.test(v||'')?v:'';nativeVal.set.call(el,el.dataset.iso?fmtLong(el.dataset.iso):'')}});
  el.value=iso;el.readOnly=true;el.setAttribute('aria-haspopup','dialog');
  el.addEventListener('click',()=>openCal(el));
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '||e.key==='ArrowDown'){e.preventDefault();openCal(el)}else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();setDate(el,'')}})}}
function setDate(el,v){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
let calEl=null,calFor=null,calMonth=null;
function openCal(el){calFor=el;const base=el.value?dateOf(el.value):new Date(now());calMonth=new Date(base.getFullYear(),base.getMonth(),1);
  if(!calEl){calEl=document.createElement('div');calEl.className='cal';calEl.setAttribute('role','dialog');calEl.setAttribute('aria-label','Choose a date');calEl.hidden=true;document.body.appendChild(calEl);
    calEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!calFor)return;
      if(b.dataset.nav){calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+(+b.dataset.nav),1);renderCal();return}
      if(b.dataset.d){setDate(calFor,b.dataset.d);closeCal();return}
      const t=new Date(now());if(b.dataset.act==='today'){setDate(calFor,isoOf(t));closeCal()}else if(b.dataset.act==='week'){t.setDate(t.getDate()+7);setDate(calFor,isoOf(t));closeCal()}else if(b.dataset.act==='clear'){setDate(calFor,'');closeCal()}});
    calEl.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeCal()}});
    document.addEventListener('pointerdown',e=>{if(calEl&&!calEl.hidden&&!calEl.contains(e.target)&&e.target!==calFor)closeCal(true)},true)}
  renderCal();calEl.hidden=false;
  const r=el.getBoundingClientRect(),cr=calEl.getBoundingClientRect();let top=r.bottom+6;if(top+cr.height>innerHeight-8)top=Math.max(8,r.top-cr.height-6);
  calEl.style.top=top+'px';calEl.style.left=clamp(r.left,8,innerWidth-cr.width-8)+'px';
  const f=calEl.querySelector('.sel')||calEl.querySelector('.today');if(f)f.focus()}
function closeCal(quiet){if(!calEl)return;calEl.hidden=true;if(!quiet&&calFor)calFor.focus();calFor=null}
function renderCal(){const y=calMonth.getFullYear(),m=calMonth.getMonth(),sel=calFor?calFor.value:'',today=isoOf(new Date(now()));
  const first=(new Date(y,m,1).getDay()+6)%7;let cells='';
  for(let i=0;i<7;i++)cells+=`<span class="wd">${new Date(2024,0,1+i).toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</span>`;
  for(let i=0;i<42;i++){const d=new Date(y,m,1-first+i),iso=isoOf(d);const c=[d.getMonth()!==m?'out':'',iso<today?'past':'',iso===today?'today':'',iso===sel?'sel':''].filter(Boolean).join(' ');
    cells+=`<button type="button" class="${c}" data-d="${iso}" aria-label="${d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}">${d.getDate()}</button>`}
  calEl.innerHTML=`<div class="cal-h"><button type="button" class="cal-nav" data-nav="-1" aria-label="Previous month">‹</button><b>${calMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</b><button type="button" class="cal-nav" data-nav="1" aria-label="Next month">›</button></div>
    <div class="cal-g">${cells}</div><div class="cal-f"><button type="button" class="link" data-act="today">Today</button><button type="button" class="link" data-act="week">In a week</button><button type="button" class="link" data-act="clear">No deadline</button></div>`}

/* ---------------- toasts, dialogs, notifications ---------------- */
const KIND_COLOR={war:'#b3312b',campaign:'#b3312b',siege:'#c0392b',loot:'#8f1d17',victory:'#4f7a35',quest:'#3a6fb4',land:'#d4a12c',rank:'#d4a12c',skill:'#7b4fa6',goal:'#d4a12c',world:'#6a5a42',raid:'#d0671f'};
function toast(title,text,opts){opts=opts||{};const el=document.createElement('div');el.className='toast';el.style.setProperty('--c',opts.color||'#dcaa47');
  el.innerHTML=`<div class="tx">${title?`<b>${esc(title)}</b>`:''}<span>${esc(text||'')}</span></div>${opts.undo?'<button>Undo</button>':''}<button aria-label="Dismiss">×</button>`;
  const btns=el.querySelectorAll('button');if(opts.undo)btns[0].addEventListener('click',()=>{opts.undo();el.remove()});btns[btns.length-1].addEventListener('click',()=>el.remove());
  const box=$('toasts');box.appendChild(el);while(box.children.length>3)box.firstChild.remove();setTimeout(()=>el.remove(),opts.ms||7000)}
function uiNotify(n,popup){renderBadge();if(popup&&phase==='play')toast(n.title,n.text,{color:KIND_COLOR[n.kind]})}
function uiDefeat(a,r,b){if(phase!=='play')return;showDialog(`<div class="victory stack"><svg class="crest" viewBox="0 0 72 72"><path d="M36 4l26 10v18c0 17-11 29-26 36C21 61 10 49 10 32V14z" fill="#d4a12c" stroke="#3a2b1d" stroke-width="2.5"/><path d="M24 24l24 24M48 24L24 48" stroke="#3a2b1d" stroke-width="4" stroke-linecap="round"/></svg>
  <h2>Enemy was defeated!</h2><p>${esc(r.name)}'s army was routed before ${esc(settName(a.target))}. Your soldiers collected ${b} gold from the field.</p><div class="foot"><button class="btn btn-gold" data-close>Onward</button></div></div>`)}
function showDialog(html){$('dialog-in').classList.remove('dialog-wide');$('dialog-in').innerHTML=html;$('dialog').hidden=false;const b=$('dialog-in').querySelector('button');if(b)b.focus()}
$('dialog').addEventListener('click',e=>{if(e.target.id==='dialog'||e.target.closest('[data-close]'))$('dialog').hidden=true});
function renderBadge(){if(!WD)return;const u=WD.notifs.filter(n=>!n.read).length;$('h-badge').hidden=!u;$('h-badge').textContent=u>99?'99+':u}
function renderNotifs(){const list=WD.notifs.slice(0,120);
  $('nlist').innerHTML=list.length?list.map(n=>`<button class="nitem ${n.read?'':'unread'}" data-n="${n.id}" style="--c:${KIND_COLOR[n.kind]||'#888'}"><i></i><div><b>${esc(n.title)}</b><span>${esc(n.text)}</span><time>${fmtDay(n.t)} · ${new Date(n.t).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</time></div></button>`).join(''):'<p class="empty" style="padding:14px">Nothing has happened yet.</p>';
  $('travel').hidden=!(CFG.debug&&CFG.debug.time_travel);$('t-off').textContent=WD.timeOffset?`World clock is ${Math.round(WD.timeOffset/DAY)} days ahead.`:''}
$('h-bell').addEventListener('click',()=>{const p=$('npanel');p.hidden=!p.hidden;if(!p.hidden)renderNotifs()});
$('n-readall').addEventListener('click',()=>{WD.notifs.forEach(n=>n.read=true);renderNotifs();renderBadge();saveSoon()});
$('nlist').addEventListener('click',e=>{const b=e.target.closest('[data-n]');if(!b)return;const n=WD.notifs.find(x=>x.id===b.dataset.n);if(!n)return;n.read=true;renderBadge();b.classList.remove('unread');
  const r=n.ref||{};if(r.task){const t=WD.tasks.find(x=>x.id===r.task);if(t){$('npanel').hidden=true;openQuestEditor(t,false)}}else if(r.goal){const g=WD.goals.find(x=>x.id===r.goal);if(g){$('npanel').hidden=true;openGoalEditor(g,false)}}
  else if(r.army){const a=WD.armies.find(x=>x.id===r.army);if(a){const st=armyState(a);flyTo(st.pos.x,st.pos.y,Math.max(view.z,fitZ*2.5))}}else if(r.prov!=null){flyTo(pcx[r.prov],pcy[r.prov],Math.max(view.z,fitZ*2.5));pulse(r.prov,'#fff4c8')}saveSoon()});
function skipTime(days){WD.timeOffset=(WD.timeOffset||0)+days*DAY;processTime();renderAll();renderNotifs();toast('Time passes',`The world clock moved ${days} ${days>1?'days':'day'} forward.`)}
$('t-day').addEventListener('click',()=>skipTime(1));$('t-week').addEventListener('click',()=>skipTime(7));

/* ---------------- sidebar ---------------- */
function renderAll(){if(!WD||phase!=='play')return;rebuildRealm();renderBrand();renderRanks();renderCard();renderThreats();renderQuests();renderGoals();renderRealms();renderWorldTab();renderHUD();renderBadge();
  $('ex-note').hidden=!WD.tasks.some(t=>t.example);if(!$('npanel').hidden)renderNotifs();if(!$('kanban').hidden)renderKanban();dirty=true;saveSoon()}
function renderBrand(){$('map-name').textContent=WD.name;$('realm-name').textContent=WD.kingdom;$('realm-seat').textContent='Seat of power: '+settName(WD.home)}
function rankRow(list,v,unit,id){const i=rankIdx(list,v),cur=list[i],nx=list[i+1];$('rk-'+id).textContent=cur.name;
  if(nx){const f=clamp((v-cur.at)/(nx.at-cur.at),0,1);$('rk-'+id+'b').style.width=(f*100)+'%';$('rk-'+id+'v').textContent=`${Math.floor(v)} / ${nx.at} ${unit}`;$('rk-'+id+'v').title=`Next: ${nx.name}`}
  else{$('rk-'+id+'b').style.width='100%';$('rk-'+id+'v').textContent='Highest rank'}}
function renderRanks(){rankRow(CFG.ranks.wealth,WD.gold,'gold','w');rankRow(CFG.ranks.power,playerCount(),'provinces','p')}
function renderHUD(){if(!WD)return;$('hud').hidden=phase!=='play';$('h-gold').textContent=Math.floor(WD.gold);$('h-rate').textContent='+'+goldRate().toFixed(0)+'/day';
  $('h-prov').textContent=playerCount();$('h-open').textContent=WD.tasks.filter(t=>t.status!=='done').length}
function sector(cx,cy,r0,r1,a0,a1){const P2=(r,a)=>(cx+r*Math.cos(a)).toFixed(2)+','+(cy+r*Math.sin(a)).toFixed(2);const lg=a1-a0>Math.PI?1:0;
  return `M${P2(r1,a0)}A${r1},${r1} 0 ${lg} 1 ${P2(r1,a1)}L${P2(r0,a1)}A${r0},${r0} 0 ${lg} 0 ${P2(r0,a0)}Z`}
const KNIGHT=`<g>
 <ellipse cx="0" cy="45" rx="20" ry="3.5" fill="rgba(0,0,0,.2)"/>
 <path d="M-10,12 L-11,40 L-3.5,40 L-2.5,14Z" fill="url(#steel)" stroke="#3a2b1d" stroke-width="1.2"/>
 <path d="M2.5,14 L3.5,40 L11,40 L10,12Z" fill="url(#steel)" stroke="#3a2b1d" stroke-width="1.2"/>
 <path d="M-13,40 h10.5 v4.5 h-11.5z M2.5,40 h10.5 l1,4.5 h-11.5z" fill="#5a4030" stroke="#3a2b1d" stroke-width="1"/>
 <rect x="22" y="-41" width="3" height="46" fill="#e4e7ea" stroke="#3a2b1d" stroke-width="1"/>
 <path d="M22,-41 L23.5,-46 L25,-41Z" fill="#e4e7ea" stroke="#3a2b1d" stroke-width="1"/>
 <rect x="16.5" y="4" width="14" height="3.2" rx="1" fill="#d4a12c" stroke="#3a2b1d" stroke-width="1"/>
 <rect x="22" y="7" width="3" height="7" fill="#6b4426" stroke="#3a2b1d" stroke-width=".8"/><circle cx="23.5" cy="15.5" r="2.2" fill="#d4a12c" stroke="#3a2b1d" stroke-width=".8"/>
 <path d="M-14,-21 Q0,-27 14,-21 L12.5,12 L-12.5,12Z" fill="url(#steel)" stroke="#3a2b1d" stroke-width="1.2"/>
 <path d="M-9.5,-19 L9.5,-19 L10.5,18 L0,22 L-10.5,18Z" fill="#c8932c" stroke="#3a2b1d" stroke-width="1.2"/>
 <path d="M-5,-6 L-5,-11 L-2.5,-8.5 L0,-12 L2.5,-8.5 L5,-11 L5,-6Z" fill="#f4dc8c" stroke="#3a2b1d" stroke-width=".9"/>
 <rect x="-10.5" y="3" width="21" height="3.4" fill="#5a4030" stroke="#3a2b1d" stroke-width=".8"/><rect x="-1.8" y="2.8" width="3.6" height="3.8" fill="#d4a12c" stroke="#3a2b1d" stroke-width=".7"/>
 <path d="M12,-21 Q20,-19 21,-6 L24.5,6 L19.5,8 L15.5,-6Z" fill="url(#steel)" stroke="#3a2b1d" stroke-width="1.2"/>
 <path d="M-31,-17 Q-21,-22 -10,-17 L-11,1 Q-14,14 -20.5,20 Q-28,13 -30,1Z" fill="#8f2a22" stroke="#3a2b1d" stroke-width="1.4"/>
 <path d="M-20.5,-18 L-20.5,18 M-30,-4 L-11,-4" stroke="#d4a12c" stroke-width="2.4"/>
 <ellipse cx="0" cy="-23" rx="9" ry="3" fill="url(#steel)" stroke="#3a2b1d" stroke-width="1"/>
 <path d="M-8.5,-25 L-8.5,-36 Q-8.5,-45 0,-46 Q8.5,-45 8.5,-36 L8.5,-25Z" fill="url(#steel)" stroke="#3a2b1d" stroke-width="1.3"/>
 <rect x="-7" y="-36.5" width="14" height="2.6" rx="1.2" fill="#3a2b1d"/><path d="M0,-46 L0,-25" stroke="#3a2b1d" stroke-width=".8" opacity=".5"/>
 <circle cx="3.5" cy="-30" r=".8" fill="#3a2b1d"/><circle cx="5.5" cy="-30" r=".8" fill="#3a2b1d"/><circle cx="3.5" cy="-27.6" r=".8" fill="#3a2b1d"/><circle cx="5.5" cy="-27.6" r=".8" fill="#3a2b1d"/>
 <path d="M1,-45 C8,-56 21,-53 23,-41 C17,-47 9,-48 4,-43Z" fill="#d4a12c" stroke="#3a2b1d" stroke-width="1"/>
</g>`;
function renderCard(){
  const sk=CH.skills;const n=Math.max(1,sk.length);const cx=170,cy=170,r0=58,rM=118;
  const mx=Math.max(0,...sk.map(s=>s.value|0));const maxV=Math.max(10,Math.ceil(mx*1.25/5)*5);
  let s=`<svg viewBox="0 0 340 340" role="img" aria-label="Character skills"><defs><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eeeae2"/><stop offset=".55" stop-color="#aaa59c"/><stop offset="1" stop-color="#6f6a62"/></linearGradient></defs>`;
  for(let l=1;l<=4;l++){s+=`<circle cx="${cx}" cy="${cy}" r="${(r0+(rM-r0)*l/4).toFixed(1)}" fill="none" stroke="var(--line)" stroke-width="${l===4?1:.7}" ${l===4?'':'stroke-dasharray="2 3"'}/>`}
  const gap=n>1?Math.min(4,180/n/4):0;
  sk.forEach((k,i)=>{const a0=(-90+i*360/n+gap)*Math.PI/180,a1=(-90+(i+1)*360/n-gap)*Math.PI/180,am=(a0+a1)/2,v=k.value|0,col=SKILL_COLORS[i%SKILL_COLORS.length];
    s+=`<g class="sk" data-sk="${i}" tabindex="0" role="button" aria-label="Rename skill ${esc(k.name)}"><title>${esc(k.name)}: ${v}. Click to rename.</title><path d="${sector(cx,cy,r0,rM,a0,a1)}" fill="var(--track)"/>`;
    if(v>0)s+=`<path d="${sector(cx,cy,r0,r0+(rM-r0)*Math.min(1,v/maxV),a0,a1)}" fill="${col}"/>`;
    const lines=wrapLabel(k.name,n>8?11:13);const fs=n>8?10.5:12;
    const lx=cx+(rM+22)*Math.cos(am),ly=cy+(rM+20)*Math.sin(am)-4-(lines.length-1)*fs*.5;
    s+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-family="var(--f-body)" font-size="${fs}" fill="var(--ink)" font-weight="500">${lines.map((l,j)=>`<tspan x="${lx.toFixed(1)}" dy="${j?fs+1:0}">${esc(l)}</tspan>`).join('')}<tspan x="${lx.toFixed(1)}" dy="13" font-size="12" font-weight="700" fill="${col}">${v}</tspan></text></g>`});
  s+=`<circle cx="${cx}" cy="${cy}" r="${r0-4}" fill="var(--panel)" stroke="var(--gold)" stroke-width="2"/><g transform="translate(${cx},${cy-1}) scale(.98)">${KNIGHT}</g></svg>`;
  $('radar').innerHTML=s}
function wrapLabel(t,max){if(t.length<=max)return[t];const w=t.split(' ');let a='',i=0;while(i<w.length&&(a+(a?' ':'')+w[i]).length<=max){a+=(a?' ':'')+w[i];i++}
  if(!a){a=w[0].slice(0,max-1)+'…';return[a]}let b=w.slice(i).join(' ');if(b.length>max)b=b.slice(0,max-1)+'…';return b?[a,b]:[a]}
function renameSkill(i,name){const k=CH.skills[i];if(!k)return 'missing';const v=name.trim().slice(0,30);if(!v)return 'Give the skill a name.';
  if(CH.skills.some((x,j)=>j!==i&&x.name.toLowerCase()===v.toLowerCase()))return 'Another skill already has that name.';
  const low=k.name.toLowerCase();const fix=a=>a.map(s=>s.toLowerCase()===low?v:s);if(WD){for(const t of WD.tasks)t.skills=fix(t.skills);for(const g of WD.goals)g.skills=fix(g.skills)}
  k.name=v;saveCharSoon();return ''}
function openSkillRename(i){const k=CH.skills[i];if(!k)return;showDialog(`<h2>Rename skill</h2><label class="fld"><span>Skill</span><input id="d-skill" value="${esc(k.name)}" maxlength="30"></label><p class="hint">Level ${k.value|0}. Quests and goals that train it keep it under the new name.</p><p class="err" id="d-skill-err" hidden></p><div class="foot"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" id="d-skill-save" data-i="${i}">Rename</button></div>`);
  setTimeout(()=>{const x=$('d-skill');if(x){x.focus();x.select()}},20)}
$('radar').addEventListener('click',e=>{const g=e.target.closest('[data-sk]');if(g)openSkillRename(+g.dataset.sk)});
$('radar').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const g=e.target.closest('[data-sk]');if(g){e.preventDefault();openSkillRename(+g.dataset.sk)}}});
$('dialog').addEventListener('click',e=>{if(e.target.id!=='d-skill-save')return;const err=renameSkill(+e.target.dataset.i,$('d-skill').value);if(err){$('d-skill-err').textContent=err;$('d-skill-err').hidden=false;return}$('dialog').hidden=true;renderAll();renderCard()});
$('dialog').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='d-skill'){e.preventDefault();$('d-skill-save').click()}});
function renderThreats(){const list=WD.armies.map(a=>[a,armyState(a)]).sort((x,y)=>x[1].eta-y[1].eta);const t0=now();
  $('th-count').textContent=list.length?list.length+(list.length>1?' armies':' army'):'';
  $('threats').innerHTML=list.length?list.map(([a,st])=>{const r=armyRival(a),c=armyCause(a);
    return `<li><button class="threat ${st.phase==='siege'?'siege':''}" data-army="${a.id}" style="--c:${r.color}"><i class="bn"></i><span class="tx"><b>${esc(r.name)}</b><small>${st.phase==='siege'?'Besieging':'Marching on'} ${esc(settName(a.target))} · ${esc(c.label)}</small></span><span class="eta">${fmtDur(st.eta-t0)}<small>${st.phase==='siege'?'until looted':'to arrive'}</small></span></button></li>`}).join('')
    :`<li><p class="empty">No armies march on you. Deadlines and neglected goals change that.</p></li>`}
$('threats').addEventListener('click',e=>{const b=e.target.closest('[data-army]');if(!b)return;const a=WD.armies.find(x=>x.id===b.dataset.army);if(!a)return;const st=armyState(a);flyTo(st.pos.x,st.pos.y,Math.max(view.z,fitZ*2.5));
  const c=armyCause(a);if(c.ref.task){const t=WD.tasks.find(x=>x.id===c.ref.task);if(t)openQuestEditor(t,false)}else{const g=WD.goals.find(x=>x.id===c.ref.goal);if(g)openGoalEditor(g,false)}});
function dueChip(t){const st=taskStatus(t);if(st==='done')return '';if(isOverdue(t))return `<span class="due bad">${t.looted?'Looted':'Overdue'}</span>`;if(!t.deadline)return '<span></span>';
  const d=(deadlineEnd(t.deadline)-now())/DAY;return `<span class="due ${d<3?'warn':''}">${d<1?'Today':Math.ceil(d)+'d'}</span>`}
function qItem(t){const st=taskStatus(t),late=isOverdue(t),sd=t.subs.filter(x=>x.d).length;
  return `<li class="q ${st==='done'?'done':''} ${late?'late':''}" data-id="${t.id}"><button class="q-check" data-act="done" aria-label="${st==='done'?'Reopen quest':'Complete quest'}"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6.5l2.6 2.5L10 3.5"/></svg></button>
   <button class="q-main" data-act="open"><span class="q-title">${late?'<i class="late-ico" aria-label="Overdue">!</i>':''}${esc(t.title)}</span><span class="q-meta">${st==='progress'?'<span class="st-prog">In progress</span> · ':''}<i class="dot" style="--c:${realmColor(t.realm)}"></i>${esc(realmName(t.realm))}${t.goal?' · '+esc(goalName(t.goal)):''} · <span class="pips" title="${diffOf(t.diff).name}">${'◆'.repeat(t.diff)}${'◇'.repeat(4-t.diff)}</span>${t.subs.length?` · ${sd}/${t.subs.length}`:''}</span></button>${dueChip(t)}</li>`}
function renderQuests(){const open=WD.tasks.filter(t=>t.status!=='done');
  let chips=`<button class="chip" data-realm="all" aria-pressed="${ui.realm==='all'}">All<span class="n">${open.length}</span></button>`;
  for(const r of WD.realms)chips+=`<button class="chip" data-realm="${r.id}" aria-pressed="${ui.realm===r.id}"><i class="dot" style="--c:${r.rival.color}"></i>${esc(r.name)}<span class="n">${open.filter(t=>t.realm===r.id).length}</span></button>`;
  $('realm-chips').innerHTML=chips;
  const f=WD.tasks.filter(t=>ui.realm==='all'||t.realm===ui.realm);
  const o=f.filter(t=>t.status!=='done').sort((a,b)=>(a.deadline?deadlineEnd(a.deadline):Infinity)-(b.deadline?deadlineEnd(b.deadline):Infinity)||b.created-a.created);
  const d=f.filter(t=>t.status==='done').sort((a,b)=>b.doneAt-a.doneAt);
  $('qlist').innerHTML=o.length?o.map(qItem).join(''):'<li><p class="empty" style="padding:8px 0">No open quests here.</p></li>';
  $('show-done').hidden=!d.length;$('show-done').textContent=(ui.showDone?'Hide':'Show')+` completed (${d.length})`;
  $('qdone').hidden=!ui.showDone||!d.length;$('qdone').innerHTML=ui.showDone?d.map(qItem).join(''):''}
$('realm-chips').addEventListener('click',e=>{const b=e.target.closest('[data-realm]');if(!b)return;ui.realm=b.dataset.realm;renderQuests()});
$('show-done').addEventListener('click',()=>{ui.showDone=!ui.showDone;renderQuests()});
function onQClick(e){const li=e.target.closest('.q');if(!li)return;const t=WD.tasks.find(x=>x.id===li.dataset.id);if(!t)return;const act=e.target.closest('[data-act]');
  if(act&&act.dataset.act==='done'){if(t.status==='done'){reopenTask(t);renderAll()}else doComplete(t);return}
  openQuestEditor(t,false);flyTo(t.x,t.y,Math.max(view.z,fitZ*2.6))}
$('qlist').addEventListener('click',onQClick);$('qdone').addEventListener('click',onQClick);
$('new-quest').addEventListener('click',()=>{const pl=autoPlace();const realm=ui.realm!=='all'?ui.realm:WD.realms[0].id;const t=newTask(Object.assign(pl,{realm}));openQuestEditor(t,true);flyTo(t.x,t.y,Math.max(view.z,fitZ*2.4))});
function goalProgress(g){const ts=WD.tasks.filter(t=>t.goal===g.id);return{n:ts.length,d:ts.filter(t=>t.status==='done').length,late:ts.filter(isOverdue).length}}
function renderGoals(){const t0=now();
  $('goals').innerHTML=WD.goals.length?WD.goals.slice().sort((a,b)=>(a.status==='done')-(b.status==='done')||(a.deadline?deadlineEnd(a.deadline):Infinity)-(b.deadline?deadlineEnd(b.deadline):Infinity)).map(g=>{const pr=goalProgress(g),st=goalStatus(g);
    let time='<span>No deadline</span>',tf=0,late=false;
    if(g.deadline){const end=deadlineEnd(g.deadline);tf=clamp((t0-g.created)/Math.max(DAY,end-g.created),0,1);late=st==='overdue';const left=(end-t0)/DAY;time=st==='done'?'<span>Done</span>':late?'<span class="danger">Overdue</span>':`<span>${left<1?'Due today':Math.ceil(left)+' days left'}</span>`}
    return `<li><button class="goal ${st==='done'?'done':''}" data-goal="${g.id}"><span class="gt"><b title="${esc(g.name)}">${esc(g.name)}</b><span class="hint">${esc(realmName(g.realm))}</span></span>
      <span class="gm"><span>${pr.d}/${pr.n} quests</span>${pr.late?`<span class="late-count"><i class="late-ico">!</i>${pr.late} overdue</span>`:`<span>${st==='done'?'Complete':''}</span>`}</span><span class="bar"><i style="width:${pr.n?pr.d/pr.n*100:0}%"></i></span>
      <span class="gm">${time}<span>${g.deadline?'Due '+fmtDay(deadlineEnd(g.deadline)):''}</span></span>${g.deadline?`<span class="bar time ${late?'late':''}"><i style="width:${tf*100}%"></i></span>`:''}</button></li>`}).join('')
    :'<li><p class="empty">Goals group quests toward something bigger. A goal with a deadline, or one you neglect for a week, sends its rival on a campaign.</p></li>'}
$('goals').addEventListener('click',e=>{const b=e.target.closest('[data-goal]');if(!b)return;const g=WD.goals.find(x=>x.id===b.dataset.goal);if(g)openGoalEditor(g,false)});
$('new-goal').addEventListener('click',()=>openGoalEditor(newGoal({realm:ui.realm!=='all'?ui.realm:WD.realms[0].id}),true));
function renderRealms(){
  $('realms').innerHTML=WD.realms.map((r,i)=>{const cnt=rivalCount(i);const cap=r.rival.capital!=null?settName(r.rival.capital):null;
    if(ui.renaming===r.id)return `<li class="realm" style="--c:${r.rival.color}"><i class="sw"></i><form class="row-add" data-rename="${r.id}"><input id="rn-${r.id}" value="${esc(r.name)}" maxlength="30"><button class="btn">Save</button></form><span></span></li>`;
    return `<li class="realm" style="--c:${r.rival.color}"><i class="sw"></i><span>${esc(r.name)}<small>${esc(r.rival.name)} · ${cnt?cnt+' provinces'+(cap?' · capital '+esc(cap):''):'defeated'}</small></span>
      <span class="row" style="gap:2px"><button class="iconbtn" data-ren="${r.id}" aria-label="Rename ${esc(r.name)}" title="Rename"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 13l1-3 7-7 2 2-7 7z"/></svg></button><button class="iconbtn del" data-delrealm="${r.id}" aria-label="Delete ${esc(r.name)}" title="Delete">×</button></span></li>`}).join('');
  $('skills').innerHTML=CH.skills.map((k,i)=>`<li class="skillrow"><i class="dot" style="--c:${SKILL_COLORS[i%SKILL_COLORS.length]}"></i><span>${esc(k.name)}</span><b>${k.value|0}</b><button class="iconbtn del" data-delskill="${i}" aria-label="Delete skill ${esc(k.name)}">×</button></li>`).join('')}
$('realms').addEventListener('click',e=>{const rn=e.target.closest('[data-ren]');if(rn){ui.renaming=rn.dataset.ren;renderRealms();const i=$('rn-'+ui.renaming);if(i)i.focus();return}
  const d=e.target.closest('[data-delrealm]');if(d){const r=WD.realms.find(x=>x.id===d.dataset.delrealm);if(!r)return;if(WD.realms.length<2){toast('','You need at least one realm.');return}
    if(!deleteRealm(r)){toast('Realm still in use',`Move or delete the quests and goals in ${r.name} first.`);return}notify('world','Realm removed',`${r.name} and its rival are gone. Their land is terra incognita again.`);renderAll()}});
$('realms').addEventListener('submit',e=>{e.preventDefault();const f=e.target.closest('[data-rename]');if(!f)return;const r=WD.realms.find(x=>x.id===f.dataset.rename);const v=f.querySelector('input').value.trim();if(r&&v)renameRealm(r,v);ui.renaming=null;renderAll()});
$('realm-form').addEventListener('submit',e=>{e.preventDefault();const v=$('realm-new').value.trim();if(!v)return;if(WD.realms.some(r=>r.name.toLowerCase()===v.toLowerCase())){toast('','That realm already exists.');return}
  const r=addRealm(v);$('realm-new').value='';if(r){const c=settById(r.rival.capital);if(c)flyTo(c.x,c.y,Math.max(view.z,fitZ*2))}renderAll()});
$('skills').addEventListener('click',e=>{const d=e.target.closest('[data-delskill]');if(!d)return;const k=CH.skills[+d.dataset.delskill];if(!k)return;
  CH.skills.splice(+d.dataset.delskill,1);const low=k.name.toLowerCase();for(const t of WD.tasks)t.skills=t.skills.filter(s=>s.toLowerCase()!==low);for(const g of WD.goals)g.skills=g.skills.filter(s=>s.toLowerCase()!==low);saveCharSoon();renderAll()});
$('skill-form').addEventListener('submit',e=>{e.preventDefault();const vs=$('skill-new').value.split(',').map(v=>v.trim().slice(0,30)).filter(Boolean);if(!vs.length)return;vs.forEach(ensureSkill);$('skill-new').value='';saveCharSoon();renderAll()});
function renderWorldTab(){$('store-info').textContent=Store.mode==='server'?`This world saves itself to maps/${WD.name}/world.md in the app folder. Your skills live in character.md.`:'This preview keeps worlds in your browser. Run the app on your computer (node server.js) to save them as .md files in the maps folder.'}
$('w-save').addEventListener('click',()=>saveNow(true));
$('w-load').addEventListener('click',()=>openWorldList());
/* export / import as text: moves a world between the claude.ai page, other browsers and the local app */
function dlgWide(on){$('dialog-in').classList.toggle('dialog-wide',!!on)}
async function copyText(ta,btn){ta.select();let ok=false;try{await navigator.clipboard.writeText(ta.value);ok=true}catch(e){try{ok=document.execCommand('copy')}catch(e2){}}
  btn.textContent=ok?'Copied':'Press Ctrl+C';setTimeout(()=>btn.textContent='Copy',1800)}
function dlFile(name,text){try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/markdown'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}catch(e){toast('Download blocked','Use Copy instead.')}}
async function openExport(){if(!WD)return;await saveNow(false);const wm=worldToMd(),cm=charToMd();
  showDialog(`<h2>Export as text</h2><p class="hint">To move this world to another copy of the app, copy both texts, then use <b>Import a world</b> there. In the folder version you can also save them as <code>maps/${esc(WD.name)}/world.md</code> and <code>character.md</code>.</p>
  <div class="mdlabel"><b>world.md</b><span class="row"><button class="btn" data-copy="ex-w">Copy</button><button class="btn" data-dl="w">Download</button></span></div><textarea class="mdbox" id="ex-w" readonly></textarea>
  <div class="mdlabel"><b>character.md</b><span class="row"><button class="btn" data-copy="ex-c">Copy</button><button class="btn" data-dl="c">Download</button></span></div><textarea class="mdbox" id="ex-c" readonly style="min-height:90px"></textarea>
  <div class="foot"><button class="btn btn-gold" data-close>Done</button></div>`);dlgWide(true);$('ex-w').value=wm;$('ex-c').value=cm;if(Store.mode!=='server')$('dialog-in').querySelectorAll('[data-dl]').forEach(b=>b.remove());
  $('dialog-in').querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>copyText($(b.dataset.copy),b)));
  $('dialog-in').querySelectorAll('[data-dl]').forEach(b=>b.addEventListener('click',()=>b.dataset.dl==='w'?dlFile('world.md',wm):dlFile('character.md',cm)))}
function openImport(){showDialog(`<h2>Import a world</h2><p class="hint">Paste the texts from <b>Export as text</b>, or pick the files. The character is optional; without it you keep your current skills.</p>
  <div class="mdlabel"><b>world.md</b><label class="btn">Choose file<input type="file" accept=".md,.txt,text/*" data-file="im-w" hidden></label></div><textarea class="mdbox" id="im-w" placeholder="# Task &amp; Conquer world …"></textarea>
  <div class="mdlabel"><b>character.md</b> <span class="hint">optional</span><label class="btn">Choose file<input type="file" accept=".md,.txt,text/*" data-file="im-c" hidden></label></div><textarea class="mdbox" id="im-c" style="min-height:90px"></textarea>
  <p class="err" id="im-err" hidden></p><div class="foot"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" id="im-go">Import</button></div>`);dlgWide(true);
  $('dialog-in').querySelectorAll('[data-file]').forEach(inp=>inp.addEventListener('change',async()=>{const f=inp.files[0];if(f)$(inp.dataset.file).value=await f.text()}));
  $('im-go').addEventListener('click',async()=>{const err=m=>{$('im-err').textContent=m;$('im-err').hidden=false};const wm=$('im-w').value.trim(),cm=$('im-c').value.trim();
    if(!wm)return err('Paste the world.md text first.');let parsed;try{parsed=mdToWorld(wm)}catch(e){return err('That text is not a Task & Conquer world.')}
    if(!parsed.st||!parsed.st.seed)return err('The world text is incomplete: it needs the “## World state” block at the end. Copy the whole text.');
    const name=(parsed.w&&parsed.w.name)||'Imported world';
    if(WD&&phase==='play'&&WD.name!==name)await saveNow(false);
    if(cm){try{const c=mdToChar(cm);if(c&&c.skills&&c.skills.length){CH=c;await Store.saveChar(cm)}}catch(e){return err('The character text could not be read.')}}
    try{await Store.saveMap(name,wm)}catch(e){return err('Could not save the world: '+e.message)}
    $('dialog').hidden=true;dlgWide(false);$('setup').hidden=true;if(await openWorld(wm)){Store.setLastMap(name);toast('World imported',Store.mode==='server'?`Saved to maps/${name}/world.md.`:'Kept in this browser.')}})}
$('w-export').addEventListener('click',openExport);$('w-import').addEventListener('click',openImport);$('su-import').addEventListener('click',openImport);
$('w-new').addEventListener('click',async()=>{await saveNow(false);showSetup()});
$('ex-clear').addEventListener('click',()=>{clearExamples();toast('Examples cleared','Your realm is back to its founding lands.')});
function clearExamples(){const ids=new Set(WD.tasks.filter(t=>t.example).map(t=>t.id));WD.tasks=WD.tasks.filter(t=>!t.example);WD.armies=WD.armies.filter(a=>!(a.kind==='task'&&ids.has(a.ref)));
  if(WD.preExample){applyOwnerCodes(WD.preExample.owner);WD.annex=WD.preExample.annex.slice();WD.gold=WD.preExample.gold;WD.goldAt=now();delete WD.preExample}WD.notifs=WD.notifs.filter(n=>!(n.ref&&n.ref.task&&ids.has(n.ref.task)));WD.rankW=null;WD.rankP=null;checkRanks();renderAll()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;ui.tab=b.dataset.tab;
  for(const x of document.querySelectorAll('.tabs [data-tab]'))x.setAttribute('aria-selected',String(x.dataset.tab===ui.tab));
  for(const id of ['quests','goals','realms','world'])$('tab-'+id).hidden=id!==ui.tab});
$('realm-btn').addEventListener('click',()=>{if(phase!=='play')return;showDialog(`<h2>Rename your kingdom</h2><label class="fld"><span>Kingdom</span><input id="d-kingdom" value="${esc(WD.kingdom)}" maxlength="40"></label><label class="fld"><span>Seat of power</span><input id="d-castle" value="${esc(settName(WD.home))}" maxlength="40"></label><div class="foot"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" id="d-save">Save</button></div>`)});
$('dialog').addEventListener('click',e=>{if(e.target.id==='d-save'){const k=$('d-kingdom').value.trim(),c=$('d-castle').value.trim();if(k)WD.kingdom=k;if(c)WD.names[WD.home]=c;$('dialog').hidden=true;renderAll()}});

/* ---------------- complete with undo ---------------- */
function doComplete(t){const snap=worldToMd(),csnap=JSON.stringify(CH);const got=completeTask(t);got.forEach(p=>pulse(p,GOLD));
  if(edState&&edState.t===t)closeEditor();renderAll();
  toast('Quest won',`+${diffOf(t.diff).gold} gold${got.length?`, ${got.length} new ${got.length>1?'provinces':'province'}`:''}${taskSkills(t).length?`, ${taskSkills(t).join(' & ')} +${diffOf(t.diff).skill_points}`:''}.`,{color:GOLD,undo:async()=>{CH=JSON.parse(csnap);saveCharSoon();await restoreFrom(snap)}})}
async function restoreFrom(md){const {w,st}=mdToWorld(md);loadIntoWD(w,st);applyOwnerCodes(st.owner);extraSett=(st.extra||[]).map(s=>Object.assign({k:cellAt(s.x,s.y),r:.5},s));reconcileTasks(w,st,false);renderAll()}

/* ---------------- editors ---------------- */
let edState=null,delArm=false;
function closeEditor(){$('editor').hidden=true;edState=null;selTask=null;draft=null;dirty=true}
$('ed-close').addEventListener('click',closeEditor);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('dialog').hidden)$('dialog').hidden=true;else if(!$('kanban').hidden)$('kanban').hidden=true;else if(!$('editor').hidden)closeEditor();else{hidePop();hideTip();$('npanel').hidden=true}}});
function realmOptions(sel){return WD.realms.map(r=>`<option value="${r.id}" ${r.id===sel?'selected':''}>${esc(r.name)}</option>`).join('')}
function goalOptions(realm,sel){return '<option value="">None</option>'+WD.goals.filter(g=>g.realm===realm&&(g.status==='open'||g.id===sel)).map(g=>`<option value="${g.id}" ${g.id===sel?'selected':''}>${esc(g.name)}</option>`).join('')}
function skillToggles(sel){return CH.skills.map((k,i)=>`<button type="button" data-skill="${esc(k.name)}" style="--c:${SKILL_COLORS[i%SKILL_COLORS.length]}" aria-pressed="${sel.some(s=>s.toLowerCase()===k.name.toLowerCase())}"><i class="dot"></i>${esc(k.name)}</button>`).join('')}
function whereText(p){if(p<0)return 'Open water';const o=owner[p];return o===PLAYER?'Within '+WD.kingdom:o>=0?'Held by '+WD.realms[o].rival.name:'Terra incognita'}
function openQuestEditor(t,isNew){hidePop();hideTip();closeKanban();
  edState={kind:'quest',t,isNew,w:{skills:t.skills.slice(),diff:t.diff,subs:t.subs.map(s=>({...s})),status:t.status==='progress'?'progress':'open'}};selTask=isNew?null:t.id;draft=isNew?t:null;delArm=false;dirty=true;
  const st=taskStatus(t);$('ed-where').textContent=whereText(t.prov);$('ed-heading').textContent=isNew?'New quest':st==='done'?'Quest won':isOverdue(t)?'Overdue quest':'Quest';
  $('ed-body').innerHTML=`<label class="fld"><span>Quest</span><input id="e-title" maxlength="120" placeholder="What needs doing?" value="${esc(t.title)}"></label>
   <label class="fld"><span>Notes</span><textarea id="e-desc" rows="3" placeholder="Details, links">${esc(t.desc)}</textarea></label>
   <div class="row2"><label class="fld"><span>Realm</span><select id="e-realm">${realmOptions(t.realm)}</select></label><label class="fld"><span>Goal</span><select id="e-goal">${goalOptions(t.realm,t.goal)}</select></label></div>
   <div class="fld"><span>Skills it trains</span><div class="toggles" id="e-skills">${skillToggles(edState.w.skills)}</div><small id="e-skills-hint"></small></div>
   <div class="fld"><span>Difficulty</span><div class="seg" id="e-diff">${diffs().map((d,i)=>`<button type="button" data-diff="${i+1}" aria-pressed="${i+1===t.diff}">${esc(d.name)}<small>+${d.skill_points} · ${d.lands} land</small></button>`).join('')}</div><small id="e-diff-hint"></small></div>
   ${st!=='done'?`<div class="fld"><span>Status</span><div class="seg seg2" id="e-st"><button type="button" data-st="open" aria-pressed="${edState.w.status==='open'}">Planned</button><button type="button" data-st="progress" aria-pressed="${edState.w.status==='progress'}">In progress</button></div></div>`:''}
   <label class="fld"><span>Deadline</span><input type="text" class="datein" id="e-deadline" value="${t.deadline||''}" placeholder="No deadline"><small id="e-dl-hint"></small></label>
   <div class="fld"><span>Subquests</span><ul class="subs" id="e-subs"></ul><div class="row-add"><input id="e-subnew" placeholder="Add a step" maxlength="100"><button class="btn" type="button" id="e-subadd">Add</button></div></div>
   <div class="status" id="e-status"></div><p class="err" id="e-err" hidden></p>`;
  $('ed-foot').innerHTML=(isNew?'':'<button class="btn btn-ghost danger" id="e-del">Delete</button>')+'<span class="sp"></span><button class="btn" id="e-save">Save</button>'+(st==='done'?'<button class="btn btn-gold" id="e-reopen">Reopen</button>':'<button class="btn btn-gold" id="e-done">Complete quest</button>');
  enhanceDates($('ed-body'));syncQuestEditor();$('editor').hidden=false;if(isNew)setTimeout(()=>$('e-title').focus(),30)}
function syncQuestEditor(){const t=edState.t,w=edState.w;
  const goal=$('e-goal').value&&WD.goals.find(g=>g.id===$('e-goal').value);
  $('e-skills-hint').textContent=w.skills.length?'':goal&&goal.skills.length?`None picked, so it trains the goal's skills: ${goal.skills.join(', ')}.`:'Pick the skills this quest improves.';
  const d=diffOf(w.diff);$('e-diff-hint').textContent=`Completing it gives +${d.skill_points} to each skill, ${d.gold} gold and claims ${d.lands} ${d.lands>1?'provinces':'province'}.`;
  const dv=$('e-deadline').value,h=$('e-dl-hint');
  if(!dv){h.textContent='No deadline. No army marches.';h.className=''}
  else{const ri=attackerFor($('e-realm').value);const rn=ri>=0?WD.realms[ri].rival.name:'A rival';const end=deadlineEnd(dv);
    h.className=end<now()?'warn':'';h.textContent=end<now()?`That day has passed. ${rn} would arrive at once.`:`${rn} marches on your nearest settlement and arrives at the end of this day.`}
  $('e-subs').innerHTML=w.subs.map((s,i)=>`<li class="${s.d?'d':''}"><input type="checkbox" id="sub-${i}" data-i="${i}" ${s.d?'checked':''}><span>${esc(s.t)}</span><button class="iconbtn del" type="button" data-rm="${i}" aria-label="Remove step">×</button></li>`).join('');
  const st=taskStatus(t);let sh=`<span class="due">${st==='done'?'Done':STATUS_LABEL[edState.w.status]}</span>`;if(isOverdue(t))sh+='<span class="due bad">! Overdue</span>';
  if(t._raid)sh+=`<span class="danger">Raiding expedition: costs ${t._raid} gold when you save.</span>`;
  const army=WD.armies.find(a=>a.kind==='task'&&a.ref===t.id);if(army){const as=armyState(army);sh+=`<span>${esc(armyRival(army).name)} ${as.phase==='siege'?'is besieging':'marches on'} ${esc(settName(army.target))}.</span>`}
  $('e-status').innerHTML=sh}
function openGoalEditor(g,isNew){hidePop();hideTip();closeKanban();
  edState={kind:'goal',g,isNew,w:{skills:g.skills.slice()}};delArm=false;selTask=null;draft=null;dirty=true;
  const st=goalStatus(g),pr=goalProgress(g);$('ed-where').textContent=realmName(g.realm);$('ed-heading').textContent=isNew?'New goal':st==='done'?'Goal achieved':'Goal';
  const tasks=WD.tasks.filter(t=>t.goal===g.id);
  $('ed-body').innerHTML=`<label class="fld"><span>Goal</span><input id="g-name" maxlength="80" placeholder="e.g. Run a half marathon" value="${esc(g.name)}"></label>
   <div class="row2"><label class="fld"><span>Realm</span><select id="g-realm">${realmOptions(g.realm)}</select></label><label class="fld"><span>Deadline</span><input type="text" class="datein" id="g-deadline" value="${g.deadline||''}" placeholder="No deadline"></label></div>
   <div class="fld"><span>Skills it trains</span><div class="toggles" id="g-skills">${skillToggles(edState.w.skills)}</div><small>Quests in this goal train these skills unless they pick their own.</small></div>
   <p class="hint">A rival launches a campaign ${CFG.armies.goal_deadline_warning_days} days before the deadline, and whenever ${CFG.armies.goal_idle_days} days pass without a finished quest here. Its army marches for ${CFG.armies.campaign_march_days} days.</p>
   ${isNew?'':`<div class="fld"><span>Progress</span><span class="hint">${pr.d} of ${pr.n} quests done</span><span class="bar"><i style="width:${pr.n?pr.d/pr.n*100:0}%"></i></span></div>
   <div class="fld"><span>Quests</span><ul class="qlist" id="g-tasks">${tasks.length?tasks.map(qItem).join(''):'<li><p class="empty">No quests yet. Plant one on the map and choose this goal.</p></li>'}</ul></div>`}
   <p class="err" id="g-err" hidden></p>`;
  $('ed-foot').innerHTML=(isNew?'':'<button class="btn btn-ghost danger" id="g-del">Delete</button>')+'<span class="sp"></span><button class="btn" id="g-save">Save</button>'+(isNew?'':st==='done'?'<button class="btn btn-gold" id="g-reopen">Reopen</button>':'<button class="btn btn-gold" id="g-done">Complete goal</button>');
  enhanceDates($('ed-body'));$('editor').hidden=false;if(isNew)setTimeout(()=>$('g-name').focus(),30)}
$('ed-body').addEventListener('click',e=>{if(!edState)return;
  const sk=e.target.closest('[data-skill]');if(sk){const n=sk.dataset.skill,arr=edState.w.skills,i=arr.findIndex(s=>s.toLowerCase()===n.toLowerCase());if(i>=0)arr.splice(i,1);else arr.push(n);sk.setAttribute('aria-pressed',String(i<0));if(edState.kind==='quest')syncQuestEditor();return}
  const sb=e.target.closest('[data-st]');if(sb){edState.w.status=sb.dataset.st;for(const b of $('e-st').children)b.setAttribute('aria-pressed',String(b===sb));syncQuestEditor();return}
  const df=e.target.closest('[data-diff]');if(df){edState.w.diff=+df.dataset.diff;for(const b of $('e-diff').children)b.setAttribute('aria-pressed',String(b===df));syncQuestEditor();return}
  const rm=e.target.closest('[data-rm]');if(rm){edState.w.subs.splice(+rm.dataset.rm,1);syncQuestEditor();return}
  if(e.target.id==='e-subadd')addSub();
  const gq=e.target.closest('#g-tasks .q');if(gq){const t=WD.tasks.find(x=>x.id===gq.dataset.id);if(t){if(e.target.closest('[data-act="done"]')){if(t.status!=='done'){doComplete(t);openGoalEditor(edState?edState.g:WD.goals.find(x=>x.id===t.goal),false)}}else openQuestEditor(t,false)}}});
$('ed-body').addEventListener('change',e=>{if(!edState)return;
  if(e.target.id==='e-realm'){$('e-goal').innerHTML=goalOptions(e.target.value,null);syncQuestEditor()}
  else if(e.target.id==='e-goal'||e.target.id==='e-deadline')syncQuestEditor();
  else if(e.target.dataset.i!=null){edState.w.subs[+e.target.dataset.i].d=e.target.checked;syncQuestEditor()}});
$('ed-body').addEventListener('keydown',e=>{if(e.target.id==='e-subnew'&&e.key==='Enter'){e.preventDefault();addSub()}});
function addSub(){const v=$('e-subnew').value.trim();if(!v)return;edState.w.subs.push({t:v,d:false});$('e-subnew').value='';syncQuestEditor();$('e-subnew').focus()}
function commitQuest(){const t=edState.t,w=edState.w;const title=$('e-title').value.trim();
  if(!title){$('e-err').textContent='Give the quest a name first.';$('e-err').hidden=false;$('e-title').focus();return false}
  if(edState.isNew&&t._raid){const pc=plantCheck(t.prov);if(!pc.ok){$('e-err').textContent=pc.text||'You cannot reach that province any more.';$('e-err').hidden=false;return false}
    accrue(now());WD.gold-=pc.cost;notify('raid','Raiding expedition sent',`Your raiders set out ${pc.hops} provinces beyond the border for ${pc.cost} gold.`,{prov:t.prov})}
  delete t._raid;
  t.title=title;t.desc=$('e-desc').value.trim();t.realm=$('e-realm').value;t.goal=$('e-goal').value||null;t.skills=w.skills.slice();t.diff=w.diff;t.subs=w.subs;
  if(edState.isNew){t.status=w.status;WD.tasks.push(t);notify('quest','New quest',`“${t.title}” was planted in ${whereText(t.prov).replace('Within ','').replace('Held by ','')}.`,{task:t.id})}
  if(!edState.isNew&&t.status!=='done')setTaskStatus(t,w.status);
  const dv=$('e-deadline').value||null;if(t.status!=='done')setTaskDeadline(t,dv);else t.deadline=dv;
  return true}
$('ed-foot').addEventListener('click',e=>{if(!edState)return;const id=e.target.id;
  if(id==='e-save'){if(commitQuest()){closeEditor();processTime();renderAll()}}
  else if(id==='e-done'){if(commitQuest()){const t=edState.t;closeEditor();doComplete(t)}}
  else if(id==='e-reopen'){const t=edState.t;if(commitQuest()){reopenTask(t);closeEditor();renderAll()}}
  else if(id==='e-del'){if(!delArm){delArm=true;e.target.textContent='Delete for good?';return}deleteTask(edState.t);notify('quest','Quest deleted',`“${edState.t.title}” was removed.`);closeEditor();renderAll()}
  else if(id==='g-save'||id==='g-done'){const g=edState.g,name=$('g-name').value.trim();if(!name){$('g-err').textContent='Give the goal a name first.';$('g-err').hidden=false;return}
    const oldRealm=g.realm;g.name=name;g.realm=$('g-realm').value;g.skills=edState.w.skills.slice();setGoalDeadline(g,$('g-deadline').value||null);
    if(edState.isNew){addGoal(g,true);notify('goal','New goal',`“${g.name}” joins the realm of ${realmName(g.realm)}. ${WD.realms[realmIdx(g.realm)].rival.name} grows stronger.`,{goal:g.id})}
    else if(oldRealm!==g.realm)for(const t of WD.tasks)if(t.goal===g.id)t.realm=g.realm;
    if(id==='g-done')completeGoal(g);closeEditor();processTime();renderAll()}
  else if(id==='g-reopen'){reopenGoal(edState.g);closeEditor();renderAll()}
  else if(id==='g-del'){if(!delArm){delArm=true;e.target.textContent='Delete for good?';return}const g=edState.g;deleteGoal(g);notify('goal','Goal deleted',`“${g.name}” was removed. Its quests stay in the realm.`);closeEditor();renderAll()}});

/* ---------------- kanban ---------------- */
const COLS=[['open','Planned'],['progress','In progress'],['done','Done']];
function openKanban(){$('kanban').hidden=false;renderKanban()}
function closeKanban(){$('kanban').hidden=true}
$('h-kanban').addEventListener('click',openKanban);$('kb-close').addEventListener('click',closeKanban);
$('kanban').addEventListener('click',e=>{if(e.target.id==='kanban')closeKanban()});
function renderKanban(){let chips=`<button class="chip" data-kb="all" aria-pressed="${ui.kbRealm==='all'}">All realms</button>`;for(const r of WD.realms)chips+=`<button class="chip" data-kb="${r.id}" aria-pressed="${ui.kbRealm===r.id}"><i class="dot" style="--c:${r.rival.color}"></i>${esc(r.name)}</button>`;
  $('kb-chips').innerHTML=chips;const ts=WD.tasks.filter(t=>ui.kbRealm==='all'||t.realm===ui.kbRealm);
  $('kb-cols').innerHTML=COLS.map(([k,l])=>{const list=ts.filter(t=>taskStatus(t)===k).sort((a,b)=>k==='done'?b.doneAt-a.doneAt:(a.deadline?deadlineEnd(a.deadline):Infinity)-(b.deadline?deadlineEnd(b.deadline):Infinity));
    return `<section class="kcol" data-col="${k}"><div class="kcol-h"><b>${l}</b><small>${list.length}</small></div><div class="kcol-b">${list.map(t=>`<div class="kcard ${isOverdue(t)?'late':''}" data-id="${t.id}" style="--c:${realmColor(t.realm)}"><b>${isOverdue(t)?'<i class="late-ico" aria-label="Overdue">!</i>':''}${esc(t.title)}</b><span class="q-meta">${esc(realmName(t.realm))}${t.goal?' · '+esc(goalName(t.goal)):''}${t.deadline?(isOverdue(t)&&k!=='done'?' · <span class="danger">overdue since '+fmtDay(deadlineEnd(t.deadline))+'</span>':' · due '+fmtDay(deadlineEnd(t.deadline))):''}</span></div>`).join('')||'<p class="empty" style="padding:6px">Drop quests here.</p>'}</div></section>`}).join('')}
$('kb-chips').addEventListener('click',e=>{const b=e.target.closest('[data-kb]');if(!b)return;ui.kbRealm=b.dataset.kb;renderKanban()});
let kdrag=null;
$('kb-cols').addEventListener('pointerdown',e=>{const card=e.target.closest('.kcard');if(!card||e.button>0)return;kdrag={id:card.dataset.id,card,sx:e.clientX,sy:e.clientY,on:false,ghost:null,col:null};card.setPointerCapture(e.pointerId)});
$('kb-cols').addEventListener('pointermove',e=>{if(!kdrag)return;if(!kdrag.on){if(Math.abs(e.clientX-kdrag.sx)+Math.abs(e.clientY-kdrag.sy)<6)return;kdrag.on=true;
    kdrag.ghost=kdrag.card.cloneNode(true);kdrag.ghost.classList.add('ghost');document.body.appendChild(kdrag.ghost);kdrag.card.classList.add('dragging')}
  kdrag.ghost.style.left=(e.clientX-120)+'px';kdrag.ghost.style.top=(e.clientY-20)+'px';
  const el=document.elementFromPoint(e.clientX,e.clientY);const col=el&&el.closest('.kcol');for(const c of document.querySelectorAll('.kcol'))c.classList.toggle('over',c===col);kdrag.col=col?col.dataset.col:null});
function endK(e){if(!kdrag)return;const d=kdrag;kdrag=null;for(const c of document.querySelectorAll('.kcol'))c.classList.remove('over');if(d.ghost)d.ghost.remove();d.card.classList.remove('dragging');
  const t=WD.tasks.find(x=>x.id===d.id);if(!t)return;if(!d.on){if(e.type==='pointerup')openQuestEditor(t,false);return}if(d.col)moveTask(t,d.col)}
$('kb-cols').addEventListener('pointerup',endK);$('kb-cols').addEventListener('pointercancel',endK);
function moveTask(t,col){const from=taskStatus(t);if(col===from)return;
  if(col==='done'){doComplete(t);renderKanban();return}
  if(from==='done'){reopenTask(t);if(col==='progress'){t.status='progress'}renderAll();return}
  setTaskStatus(t,col);renderAll()}

/* ---------------- map mode, sidebar ---------------- */
$('h-filter').addEventListener('click',()=>{mapMode=MODES[(MODES.indexOf(mapMode)+1)%MODES.length];$('modechip').textContent=MODE_LABEL[mapMode];$('modechip').hidden=false;clearTimeout(modeT);modeT=setTimeout(()=>{$('modechip').hidden=mapMode==='full'},2500);
  $('h-filter').setAttribute('aria-pressed',String(mapMode!=='full'));$('h-filter').title='Map view: '+MODE_LABEL[mapMode];hideTip();dirty=true;scheduleDetail()});let modeT=0;
$('z-in').addEventListener('click',()=>zoomAt(cw/2,ch/2,1.6));$('z-out').addEventListener('click',()=>zoomAt(cw/2,ch/2,1/1.6));
$('z-fit').addEventListener('click',()=>flyTo(W/2,H/2,fitZ));$('z-home').addEventListener('click',()=>flyHome());
function setCollapsed(c){$('app').classList.toggle('collapsed',c);$('side-open').hidden=!c;Store.lsSet('tc-side-collapsed',c?'1':'');setTimeout(resize,30)}
$('side-close').addEventListener('click',()=>setCollapsed(true));$('side-open').addEventListener('click',()=>setCollapsed(false));
{let rs=null;const rz=$('resizer');rz.addEventListener('pointerdown',e=>{rs={x:e.clientX,w:$('side').getBoundingClientRect().width};rz.setPointerCapture(e.pointerId);rz.classList.add('on')});
  rz.addEventListener('pointermove',e=>{if(!rs)return;const w=clamp(rs.w+e.clientX-rs.x,260,620);document.documentElement.style.setProperty('--sw',w+'px');resize()});
  const end=()=>{if(!rs)return;rs=null;rz.classList.remove('on');Store.lsSet('tc-side-w',getComputedStyle(document.documentElement).getPropertyValue('--sw').trim())};rz.addEventListener('pointerup',end);rz.addEventListener('pointercancel',end)}

/* ---------------- save / load ---------------- */
let saveT=0;function saveSoon(){if(phase!=='play')return;clearTimeout(saveT);saveT=setTimeout(()=>saveNow(false),1200)}
async function saveNow(manual){if(!WD||phase!=='play')return;clearTimeout(saveT);try{const path=await Store.saveMap(WD.name,worldToMd());Store.setLastMap(WD.name);await Store.saveChar(charToMd());
  if(manual){$('w-msg').textContent=`Saved to ${path} at ${new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}.`;toast('World saved',Store.mode==='server'?`Written to ${path}.`:'Kept in this browser.')}}catch(e){if(manual)toast('Could not save',e.message)}}
async function openWorldList(){const maps=await Store.listMaps();
  showDialog(`<h2>Load a world</h2>${maps.length?`<ul class="wlist">${maps.map(m=>`<li><button data-world="${esc(m.name)}"><span>${esc(m.name)}</span><small>${m.updated?fmtDay(m.updated):''}</small></button></li>`).join('')}</ul>`:'<p class="hint">No saved worlds yet.</p>'}<div class="foot"><button class="btn" data-close>Cancel</button></div>`)}
$('dialog').addEventListener('click',async e=>{const b=e.target.closest('[data-world]');if(!b)return;$('dialog').hidden=true;if(WD&&phase==='play')await saveNow(false);const md=await Store.loadMap(b.dataset.world);if(md)await openWorld(md);else toast('Could not load','That world file is missing.')});
function loadIntoWD(w,st){
  const ids=new Set();
  WD={name:w.name||'Unnamed world',kingdom:w.kingdom||'My Kingdom',seed:st.seed,provinces:st.provinces,genRealms:st.genRealms,home:st.home,
    gold:st.gold!=null?st.gold:+CFG.gold.start||0,goldAt:st.goldAt||Date.now(),timeOffset:st.timeOffset||0,annex:st.annex||[],names:st.names||{},stypes:st.stypes||{},
    armies:st.armies||[],notifs:st.notifs||[],rankW:st.rankW,rankP:st.rankP,preExample:st.preExample||null,realms:[],goals:[],tasks:[]};
  const used=[];
  for(const r of w.realms){const id=uniqueId(r.id||slug(r.name),ids);r.id=id;const meta=(st.rivals||{})[id]||{};const rv=makeRival(r.name,used);
    if(meta.color)rv.color=meta.color;if(meta.pattern!=null){rv.pattern=meta.pattern;rv.name=rivalNameFor(r.name,meta.pattern)}if(r.rivalName)rv.name=r.rivalName;rv.capital=meta.capital!=null?meta.capital:null;
    WD.realms.push({id,name:r.name,rival:rv})}
  const gids=new Set();
  for(const g of w.goals){const id=uniqueId(g.id||uid('g'),gids);g.id=id;const m=(st.goals||{})[id]||{};
    WD.goals.push({id,name:g.name,realm:g._realm.id,deadline:g.deadline,skills:g.skills,status:g.status,created:m.created||now(),lastActivity:m.lastActivity||m.created||now(),doneAt:m.doneAt||null,deadlineCampaign:!!m.dc,example:!!m.ex});
    g.skills.forEach(ensureSkill)}
}
function reconcileTasks(w,st,applyChanges){const qids=new Set(),toDone=[],toOpen=[];WD.tasks=[];
  for(const mt of w.tasks){const m=(st.quests||{})[mt.id];const id=uniqueId(mt.id||uid('q'),qids);mt.skills.forEach(ensureSkill);
    const t=newTask({id,title:mt.title,desc:mt.desc.join('\n'),realm:mt._realm.id,goal:mt._goal?mt._goal.id:null,skills:mt.skills,diff:mt.diff,deadline:mt.deadline,subs:mt.subs,
      status:mt.checked?(m&&m.status!=='done'?'open':'done'):(m&&m.status==='done'?'done':mt.progress?'progress':'open'),created:m&&m.created||now(),doneAt:m?m.doneAt:(mt.checked?now():null),overdueNotified:!!(m&&m.on),looted:!!(m&&m.looted),example:!!(m&&m.ex)});
    if(m&&m.x!=null){t.x=m.x;t.y=m.y;t.prov=m.prov}else{Object.assign(t,autoPlace());if(t.deadline&&t.status==='open'&&applyChanges)setTimeout(()=>{},0)}
    WD.tasks.push(t);if(m&&applyChanges){if(m.status!=='done'&&mt.checked)toDone.push(t);else if(m.status==='done'&&!mt.checked)toOpen.push(t)}
    if(!m&&applyChanges&&t.deadline&&t.status!=='done')launchTaskArmy(t)}
  for(const t of toDone){t.status='open';completeTask(t)}
  for(const t of toOpen){t.status='done';reopenTask(t);const mt=w.tasks.find(x=>x.id===t.id);if(mt&&mt.progress)t.status='progress'}}
async function openWorld(md){const {w,st}=mdToWorld(md);if(!st.seed){toast('Could not load','This file has no map state. It needs the JSON block under “## World state”.');return false}
  hideAllPanels();phase='loading';$('setup').hidden=true;$('seat').hidden=true;
  loadIntoWD(w,st);
  await buildMap(st.seed,st.provinces||+CFG.map.provinces_default,st.genRealms||WD.realms.length);
  extraSett=(st.extra||[]).map(s=>Object.assign({k:cellAt(s.x,s.y),r:.5},s));
  if(WD.home==null||!settById(WD.home))WD.home=defaultHome();
  if(st.owner)applyOwnerCodes(st.owner);else layoutRivals();
  WD.realms.forEach((r,i)=>{if(r.rival.capital==null&&rivalCount(i)===0&&!st.owner)placeRival(i)});
  reconcileTasks(w,st,true);
  WD.armies=WD.armies.filter(a=>a.kind==='task'?WD.tasks.some(t=>t.id===a.ref&&t.status!=='done'):WD.goals.some(g=>g.id===a.ref&&g.status==='open'));
  phase='play';processTime();renderAll();Store.setLastMap(WD.name);$('hud').hidden=false;flyHome(fitZ*2.2);return true}
function hideAllPanels(){closeEditor();hidePop();hideTip();$('npanel').hidden=true;closeKanban();$('dialog').hidden=true}
function defaultHome(){let lx=0,ly=0,n=0;for(let k=0;k<N;k++)if(EO[k]>0){lx+=k%FW;ly+=Math.floor(k/FW);n++}
  lx=(lx/n+.5)*CS;ly=(ly/n+.5)*CS;let best=-1,bd=Infinity;for(const s of settlements){if(s.type!=='castle')continue;const d=(s.x-lx)**2+(s.y-ly)**2;if(d<bd){bd=d;best=s.id}}return best<0?0:best}

/* ---------------- setup ---------------- */
const GOAL_IDEAS={health:['Run a half marathon',['Conditioning']],money:['Build a long-term index fund portfolio',['Investing']],business:['Launch the new product line',['Digital marketing','Selling & influencing']],relationships:['Give a toast at the family reunion',['Public speaking']],education:['Ship a side project in Python',['Coding']],family:['Plan the summer holiday',['Public speaking']],career:['Get promoted this year',['Selling & influencing','Public speaking']]};
let SU=null;
async function showSetup(){hideAllPanels();phase='setup';$('hud').hidden=true;$('seat').hidden=true;
  const realms=(CFG.defaults.realms||['Health','Money']).slice();
  SU={realms,goals:[],skills:CH.skills.map(s=>s.name)};if(!SU.skills.length)SU.skills=(CFG.defaults.skills||['Might','Lore']).slice();
  for(const r of realms){const idea=GOAL_IDEAS[r.toLowerCase()];if(idea&&SU.goals.length<3)SU.goals.push({name:idea[0],realm:r,deadline:'',skills:idea[1].filter(s=>SU.skills.some(x=>x.toLowerCase()===s.toLowerCase()))})}
  const mp=CFG.map;$('su-prov').min=mp.provinces_min;$('su-prov').max=mp.provinces_max;$('su-prov').value=mp.provinces_default;$('su-prov-n').min=mp.provinces_min;$('su-prov-n').max=mp.provinces_max;$('su-prov-n').value=mp.provinces_default;
  $('su-prov-hint').textContent=`Between ${mp.provinces_min} and ${mp.provinces_max}. More provinces mean smaller lands and a longer conquest.`;
  const maps=await Store.listMaps();$('su-load').hidden=!maps.length;$('su-cancel').hidden=!WD;
  const r=Math.floor(Math.random()*6);if(!$('su-map').value)$('su-map').value=['The Year of Deeds','Ledger of Quests','The Long Campaign','Chronicles of Doing'][r%4]+(maps.length?' '+(maps.length+1):'');
  if(!$('su-kingdom').value)$('su-kingdom').value=['Highmarch','Emberfall','Stormholt','Larkspire','Thornvale','Brightwater'][r];if(!$('su-castle').value)$('su-castle').value=['Dawnkeep','Ravenhold','Greywatch','Oakenspire','Stonehaven','Sunward'][r];
  $('su-err').hidden=true;renderSetup();$('setup').hidden=false}
function renderSetup(){
  $('su-realms').innerHTML=SU.realms.map((r,i)=>`<span class="chip">${esc(r)}<button class="x" data-rmrealm="${i}" aria-label="Remove ${esc(r)}">×</button></span>`).join('')||'<span class="hint">Add at least one realm.</span>';
  $('su-skills').innerHTML=SU.skills.map((s,i)=>`<span class="chip"><i class="dot" style="--c:${SKILL_COLORS[i%SKILL_COLORS.length]}"></i>${esc(s)}<button class="x" data-rmskill="${i}" aria-label="Remove ${esc(s)}">×</button></span>`).join('')||'<span class="hint">Add at least one skill.</span>';
  $('su-goals').innerHTML=SU.goals.map((g,i)=>`<div class="goalrow" data-g="${i}"><input data-f="name" value="${esc(g.name)}" placeholder="Goal name" maxlength="80" aria-label="Goal name"><select data-f="realm" aria-label="Realm">${SU.realms.map(r=>`<option ${r===g.realm?'selected':''}>${esc(r)}</option>`).join('')}</select><input type="text" class="datein" data-f="deadline" value="${g.deadline}" placeholder="No deadline" aria-label="Deadline"><button class="iconbtn del" data-rmgoal="${i}" aria-label="Remove goal">×</button>
    <div class="toggles">${SU.skills.map((s,j)=>`<button type="button" data-gskill="${esc(s)}" style="--c:${SKILL_COLORS[j%SKILL_COLORS.length]}" aria-pressed="${g.skills.includes(s)}">${esc(s)}</button>`).join('')}</div></div>`).join('')||'<p class="hint">No goals yet. You can add them later too.</p>';enhanceDates($('su-goals'))}
$('setup').addEventListener('click',e=>{if(!SU)return;let b;
  if((b=e.target.closest('[data-rmrealm]'))){const r=SU.realms[+b.dataset.rmrealm];SU.realms.splice(+b.dataset.rmrealm,1);SU.goals.forEach(g=>{if(g.realm===r)g.realm=SU.realms[0]||''});renderSetup()}
  else if((b=e.target.closest('[data-rmskill]'))){const s=SU.skills[+b.dataset.rmskill];SU.skills.splice(+b.dataset.rmskill,1);SU.goals.forEach(g=>g.skills=g.skills.filter(x=>x!==s));renderSetup()}
  else if((b=e.target.closest('[data-rmgoal]'))){SU.goals.splice(+b.dataset.rmgoal,1);renderSetup()}
  else if((b=e.target.closest('[data-gskill]'))){const g=SU.goals[+b.closest('[data-g]').dataset.g],s=b.dataset.gskill,i=g.skills.indexOf(s);if(i>=0)g.skills.splice(i,1);else g.skills.push(s);b.setAttribute('aria-pressed',String(i<0))}});
$('setup').addEventListener('input',e=>{const row=e.target.closest('[data-g]');if(row&&e.target.dataset.f){SU.goals[+row.dataset.g][e.target.dataset.f]=e.target.value}
  if(e.target.id==='su-prov')$('su-prov-n').value=e.target.value;if(e.target.id==='su-prov-n')$('su-prov').value=e.target.value});
$('su-goal-add').addEventListener('click',()=>{SU.goals.push({name:'',realm:SU.realms[0]||'',deadline:'',skills:[]});renderSetup();const rows=$('su-goals').querySelectorAll('[data-f="name"]');if(rows.length)rows[rows.length-1].focus()});
function addMany(list,input,max){for(const raw of input.value.split(',')){const v=raw.trim().slice(0,max);if(v&&!list.some(r=>r.toLowerCase()===v.toLowerCase()))list.push(v)}input.value='';renderSetup();input.focus()}
$('su-realm-form').addEventListener('submit',e=>{e.preventDefault();addMany(SU.realms,$('su-realm-new'),30)});
$('su-skill-form').addEventListener('submit',e=>{e.preventDefault();addMany(SU.skills,$('su-skill-new'),30)});
$('su-load').addEventListener('click',openWorldList);
$('su-cancel').addEventListener('click',async()=>{const md=await Store.loadMap(Store.lastMap()||'');if(md)openWorld(md);else{$('setup').hidden=true;phase='play';renderAll()}});
$('su-go').addEventListener('click',async()=>{const err=m=>{$('su-err').textContent=m;$('su-err').hidden=false};
  const name=$('su-map').value.trim(),kingdom=$('su-kingdom').value.trim(),castle=$('su-castle').value.trim();
  if(!name)return err('Give the map a name. It becomes the folder name in maps/.');if(/[\/\\<>:"|?*]/.test(name))return err('Map names cannot contain / \\ < > : " | ? or *.');
  if((await Store.listMaps()).some(m=>m.name.toLowerCase()===name.toLowerCase()))return err('A world with that name already exists. Pick another name or load it.');
  if(!SU.realms.length)return err('Add at least one realm.');if(!SU.skills.length)return err('Add at least one skill.');
  const prov=clamp(+$('su-prov-n').value||+CFG.map.provinces_default,+CFG.map.provinces_min,+CFG.map.provinces_max);
  for(const s of SU.skills)ensureSkill(s);CH.skills=CH.skills.filter(k=>SU.skills.some(s=>s.toLowerCase()===k.name.toLowerCase()));saveCharSoon();
  const t0=Date.now();WD={name,kingdom:kingdom||'Highmarch',seed:Math.floor(Math.random()*1e9),provinces:prov,genRealms:SU.realms.length,home:-1,gold:+CFG.gold.start||0,goldAt:t0,timeOffset:0,annex:[],names:{},stypes:{},armies:[],notifs:[],rankW:null,rankP:null,realms:[],goals:[],tasks:[],_castle:castle||'Dawnkeep',_examples:$('su-ex').checked};
  const used=[],ids=new Set();for(const r of SU.realms)WD.realms.push({id:uniqueId(slug(r),ids),name:r,rival:makeRival(r,used)});
  for(const g of SU.goals){if(!g.name.trim())continue;const r=WD.realms.find(x=>x.name===g.realm)||WD.realms[0];WD.goals.push(newGoal({name:g.name.trim(),realm:r.id,deadline:g.deadline||null,skills:g.skills.slice()}))}
  $('setup').hidden=true;phase='seat';await buildMap(WD.seed,prov,WD.genRealms);WD.home=defaultHome();setSeat(WD.home,true);$('seat').hidden=false});
function castleList(){return settlements.filter(s=>s.type==='castle')}
function setSeat(id,first){if(WD._castle){if(WD.home>=0)delete WD.names[WD.home];WD.names[id]=WD._castle}WD.home=id;WD.stypes={};layoutRivals();rebuildRealm();
  const cl=castleList();$('seat-count').textContent=`Castle ${cl.findIndex(s=>s.id===id)+1} of ${cl.length}`;$('seat-p').textContent=`${settName(id)} has gold roofs and a crown. Rivals hold the coloured lands; the rest is terra incognita. You can also click any castle.`;
  const s=settById(id);flyTo(s.x,s.y,first?fitZ*1.6:Math.max(view.z,fitZ*1.6))}
$('seat-next').addEventListener('click',()=>{const cl=castleList();const i=cl.findIndex(s=>s.id===WD.home);setSeat(cl[(i+1)%cl.length].id)});
$('seat-reroll').addEventListener('click',async()=>{$('seat').hidden=true;WD.seed=Math.floor(Math.random()*1e9);WD.home=-1;await buildMap(WD.seed,WD.provinces,WD.genRealms);setSeat(defaultHome(),true);$('seat').hidden=false});
$('seat-back').addEventListener('click',()=>{$('seat').hidden=true;phase='setup';$('setup').hidden=false;renderSetup()});
$('seat-go').addEventListener('click',async()=>{$('seat').hidden=true;const t0=Date.now();WD.goldAt=t0;WD.gold=+CFG.gold.start||0;for(const g of WD.goals){g.created=t0;g.lastActivity=t0}
  const ex=WD._examples;delete WD._castle;delete WD._examples;
  notify('world',`${WD.kingdom} is founded`,`Your seat is ${settName(WD.home)}. Plant quests on the lands around it to grow your realm.`);
  if(ex){WD.preExample={owner:Array.from(owner,o=>o===PLAYER?'P':o>=0?WD.realms[o].id:''),annex:WD.annex.slice(),gold:WD.gold};seedExamples();WD.notifs=WD.notifs.filter(n=>n.kind==='world')}
  WD.rankW=null;WD.rankP=null;checkRanks();WD.notifs.forEach(n=>n.read=true);
  phase='play';processTime();renderAll();await saveNow(false);$('hud').hidden=false;flyHome(fitZ*2.4);
  toast('The conquest begins',Store.mode==='server'?`Saved to maps/${WD.name}/world.md.`:'Hover the map to inspect lands; click land beside your border to plant a quest.')});

/* ---------------- boot ---------------- */
const DEFAULT_CFG_OBJ=()=>parseYAML(DEFAULT_CONFIG);
function deepMerge(a,b){if(Array.isArray(b))return b;if(b&&typeof b==='object'){const o=Object.assign({},a&&typeof a==='object'&&!Array.isArray(a)?a:{});for(const k in b)o[k]=deepMerge(o[k],b[k]);return o}return b===undefined||b===null?a:b}
async function boot(){
  try{const w=Store.lsGet('tc-side-w');if(w)document.documentElement.style.setProperty('--sw',w)}catch(e){}
  if(Store.lsGet('tc-side-collapsed'))setCollapsed(true);
  new ResizeObserver(resize).observe(wrap);resize();requestAnimationFrame(loop);
  await Store.init();
  let parsed={};try{parsed=parseYAML(await Store.configText())}catch(e){toast('config.yaml has an error','Using the built-in defaults instead.')}
  CFG=deepMerge(DEFAULT_CFG_OBJ(),parsed);
  const cm=await Store.loadChar();if(cm)CH=mdToChar(cm);const OLD_DEF='might,lore,craft,coin,charisma,vitality,artistry';if(CH.skills.map(s=>s.name.toLowerCase()).join(',')===OLD_DEF&&CH.skills.every(s=>!s.value))CH.skills=[];if(!CH.skills.length)CH.skills=(CFG.defaults.skills||[]).map(n=>({name:n,value:0}));
  setInterval(()=>{if(phase!=='play'||!WD)return;const n0=WD.notifs.length;processTime();if(WD.notifs.length!==n0)renderAll();else{renderHUD();renderThreats();renderRanks()}},15000);
  const last=Store.lastMap();if(last){try{const md=await Store.loadMap(last);if(md&&await openWorld(md))return}catch(e){console.error(e);toast('Could not open your last world',String(e.message||e))}}
  if(!last){try{const maps=await Store.listMaps();if(maps.length){const md=await Store.loadMap(maps[0].name);if(md&&await openWorld(md)){Store.setLastMap(maps[0].name);return}}}catch(e){console.error(e)}}
  showSetup()}
if(!(typeof window!=='undefined'&&window.__TC_TEST__))boot();
if(typeof window!=="undefined")window.__TC={api:{newTask,newGoal,addGoal,completeGoal,completeTask,setTaskStatus,setTaskDeadline,autoPlace,plantCheck,charToMd,isCapitalProv,nbr:()=>nbr,panchor:()=>panchor,PLAYER},get WD(){return WD},get CH(){return CH},get CFG(){return CFG},get owner(){return owner},Store,boot,generate,worldToMd,mdToWorld,openWorld,processTime,completeTask,plantCheck,addRealm,skipTime,moveTask,showSetup,draw,hitAt,showTip,renderAll,
  get phase(){return phase},settlements:()=>settlements,decor:()=>decor,regions:()=>regions,startDetail,view,fit:()=>fitZ,armyState,P:()=>P,ptype:()=>ptype,setCfg:c=>{CFG=c}};
