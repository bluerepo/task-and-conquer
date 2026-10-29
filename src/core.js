'use strict';
/* =====================================================================
   CORE: config parsing, utilities, noise, world generation, rendering
   ===================================================================== */

/* ---------------- YAML subset parser (maps, lists, flow values) ---------------- */
function parseYAML(text){
  const lines=[];
  for(const raw of text.split(/\r?\n/)){const s=stripYamlComment(raw);if(!s.trim())continue;lines.push({ind:s.match(/^ */)[0].length,t:s.trim()})}
  let i=0;
  const isDash=t=>t==='-'||t.startsWith('- ');
  function block(){if(i>=lines.length)return null;return isDash(lines[i].t)?list(lines[i].ind):map(lines[i].ind)}
  function map(ind){const o={};
    while(i<lines.length&&lines[i].ind===ind&&!isDash(lines[i].t)){const t=lines[i].t,c=findColon(t);
      if(c<0){i++;continue}
      const key=unquote(t.slice(0,c).trim()),rest=t.slice(c+1).trim();i++;
      if(rest==='')o[key]=(i<lines.length&&lines[i].ind>ind)?block():null;else o[key]=yScalar(rest)}
    return o}
  function list(ind){const a=[];
    while(i<lines.length&&lines[i].ind===ind&&isDash(lines[i].t)){const rest=lines[i].t.slice(1).trim();
      if(rest===''){i++;a.push(i<lines.length&&lines[i].ind>ind?block():null);continue}
      const c=findColon(rest);
      if(c>0&&!/^["'[{]/.test(rest)){lines[i]={ind:ind+2,t:rest};a.push(map(ind+2))}
      else{a.push(yScalar(rest));i++}}
    return a}
  return block()||{};
}
function stripYamlComment(s){let q=null;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c===q)q=null}else if(c==='"'||c==="'")q=c;else if(c==='#'&&(i===0||/\s/.test(s[i-1])))return s.slice(0,i).replace(/\s+$/,'')}return s.replace(/\s+$/,'')}
function findColon(t){let q=null,d=0;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c===q)q=null;continue}if(c==='"'||c==="'"){q=c;continue}if(c==='['||c==='{')d++;else if(c===']'||c==='}')d--;else if(c===':'&&d===0&&(i===t.length-1||t[i+1]===' '))return i}return -1}
function unquote(s){if((s[0]==='"'&&s.endsWith('"'))||(s[0]==="'"&&s.endsWith("'")))return s.slice(1,-1);return s}
function yScalar(s){
  if(s[0]==='['||s[0]==='{'){let p=0;const v=flow();return v;
    function ws(){while(p<s.length&&s[p]===' ')p++}
    function flow(){ws();const c=s[p];
      if(c==='['){p++;const a=[];ws();if(s[p]===']'){p++;return a}for(;;){a.push(flow());ws();if(s[p]===','){p++;continue}if(s[p]===']'){p++;break}break}return a}
      if(c==='{'){p++;const o={};ws();if(s[p]==='}'){p++;return o}for(;;){ws();let k='';if(s[p]==='"'||s[p]==="'"){const q=s[p++];while(p<s.length&&s[p]!==q)k+=s[p++];p++}else{while(p<s.length&&s[p]!==':')k+=s[p++]}p++;o[k.trim()]=flow();ws();if(s[p]===','){p++;continue}if(s[p]==='}'){p++;break}break}return o}
      if(c==='"'||c==="'"){const q=s[p++];let v='';while(p<s.length&&s[p]!==q)v+=s[p++];p++;return v}
      let v='';while(p<s.length&&!',]}'.includes(s[p]))v+=s[p++];return yAtom(v.trim())}}
  if((s[0]==='"'&&s.endsWith('"'))||(s[0]==="'"&&s.endsWith("'")))return s.slice(1,-1);
  return yAtom(s)}
function yAtom(v){if(v==='true')return true;if(v==='false')return false;if(v==='null'||v==='~')return null;if(/^-?\d+(\.\d+)?$/.test(v))return Number(v);return v}

/* ---------------- utilities ---------------- */
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const hash01=k=>(((Math.imul(k,2654435761)^Math.imul(k>>>7,40503))>>>0)%100000)/100000;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>(p||'')+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-3);
const hexRgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const yieldT=()=>new Promise(r=>setTimeout(r,0));
const DAY=86400000;
function dateStr(ms){const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function deadlineEnd(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,23,59,59).getTime()}
function fmtDay(ms){return new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function fmtWhen(ms,now){const d=(ms-now)/DAY;if(Math.abs(d)<1/24)return 'now';if(d>0){if(d<1)return 'in '+Math.ceil(d*24)+'h';return 'in '+Math.ceil(d)+(Math.ceil(d)===1?' day':' days')}
  const a=-d;if(a<1)return Math.ceil(a*24)+'h ago';return Math.floor(a)+(Math.floor(a)===1?' day ago':' days ago')}
function fmtDur(ms){const d=ms/DAY;if(d<1)return Math.max(0,Math.ceil(d*24))+'h';return Math.ceil(d)+'d'}

/* ---------------- noise ---------------- */
const GX=new Float32Array([1,-1,0,0,0.7071,-0.7071,0.7071,-0.7071]),GY=new Float32Array([0,0,1,-1,0.7071,0.7071,-0.7071,-0.7071]);
function makePerlin(rand){
  const p=new Uint8Array(512),a=new Uint8Array(256);for(let i=0;i<256;i++)a[i]=i;
  for(let i=255;i>0;i--){const j=Math.floor(rand()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}
  for(let i=0;i<512;i++)p[i]=a[i&255];
  return function(x,y){
    const x0=Math.floor(x),y0=Math.floor(y),xf=x-x0,yf=y-y0,X=x0&255,Y=y0&255;
    const u=xf*xf*xf*(xf*(xf*6-15)+10),v=yf*yf*yf*(yf*(yf*6-15)+10);
    const aa=p[p[X]+Y]&7,ab=p[p[X]+Y+1]&7,ba=p[p[X+1]+Y]&7,bb=p[p[X+1]+Y+1]&7;
    const n00=GX[aa]*xf+GY[aa]*yf,n10=GX[ba]*(xf-1)+GY[ba]*yf,n01=GX[ab]*xf+GY[ab]*(yf-1),n11=GX[bb]*(xf-1)+GY[bb]*(yf-1);
    const x1=n00+(n10-n00)*u,x2=n01+(n11-n01)*u;return x1+(x2-x1)*v;
  };
}
function fbm(n,x,y,o){let s=0,a=1,f=1,m=0;for(let i=0;i<o;i++){s+=a*n(x*f+i*17.13,y*f+i*31.7);m+=a;a*=0.5;f*=2.02}return s/m}

class Heap{
  constructor(c){this.k=new Float64Array(c||1024);this.v=new Int32Array(c||1024);this.n=0}
  push(key,val){
    if(this.n>=this.k.length){const k=new Float64Array(this.k.length*2);k.set(this.k);this.k=k;const v=new Int32Array(this.v.length*2);v.set(this.v);this.v=v}
    const K=this.k,V=this.v;let i=this.n++;
    while(i>0){const p=(i-1)>>1;if(K[p]<=key)break;K[i]=K[p];V[i]=V[p];i=p}K[i]=key;V[i]=val;
  }
  pop(){
    const K=this.k,V=this.v,top=V[0];this.topKey=K[0];const n=--this.n;
    if(n>0){const key=K[n],val=V[n];let i=0;for(;;){let c=2*i+1;if(c>=n)break;if(c+1<n&&K[c+1]<K[c])c++;if(K[c]>=key)break;K[i]=K[c];V[i]=V[c];i=c}K[i]=key;V[i]=val}
    return top;
  }
}
const DX=[1,-1,0,0,1,1,-1,-1],DY=[0,0,1,-1,1,-1,1,-1],DL8=[1,1,1,1,1.4142,1.4142,1.4142,1.4142];
function chaikin(p,w,it){
  for(let r=0;r<it;r++){
    const n=w.length;if(n<3)break;const np=[p[0],p[1]],nw=[w[0]];
    for(let i=0;i<n-1;i++){const x0=p[2*i],y0=p[2*i+1],x1=p[2*i+2],y1=p[2*i+3];
      np.push(x0*.75+x1*.25,y0*.75+y1*.25,x0*.25+x1*.75,y0*.25+y1*.75);nw.push(w[i]*.75+w[i+1]*.25,w[i]*.25+w[i+1]*.75)}
    np.push(p[2*n-2],p[2*n-1]);nw.push(w[n-1]);p=np;w=nw;
  }
  return [p,w];
}

/* ---------------- world constants & data ---------------- */
const W=2000,H=1300,CS=4,FW=500,FH=325,N=FW*FH;
const RW=250,RH=163,RCS=8,RN=RW*RH;
const INK='#3a2b1d',GOLD='#d4a12c';
const BIOME_NAMES=['Open sea','Lake','Snowy peaks','Mountains','Tundra','Taiga','Cold steppe','Grassland','Dry plains','Forest','Marshland','Desert','Savanna','Jungle'];
const BCOL=[[0,0,0],[0,0,0],[236,238,236],[178,163,138],[206,208,190],[112,140,104],[178,182,140],[158,194,100],[204,198,126],[124,164,82],[130,144,98],[236,208,144],[210,192,116],[86,144,72]];
const PTYPES=['farmland','forest','hills','highlands','mountains','marsh','desert','tundra'];
const PTYPE_LABEL={ashlands:'Ashlands',wastes:'Crater wastes',farmland:'Farmland',forest:'Forest',hills:'Hills',highlands:'Highlands',mountains:'Mountains',marsh:'Marshland',desert:'Desert',tundra:'Tundra'};
const STYPE_LABEL={village:'Village',town:'Town',fort:'Fortress',castle:'Castle'};

let EO,E,GR,DLand,DWater,TT,MM,BI,LKf,R_,G_,B_,ACC,ISRIV,TX,BXv,BXk,regions=[];
let rivers=[],settlements=[],roads=[],glyphs=[],decor=[];
let provId,P=0,pcx,pcy,pbb,nbr,panchor,ptype,pcoast,pcells,psett;
let rcost,rriv,rroad;
const cellAt=(x,y)=>clamp(Math.floor(y/CS),0,FH-1)*FW+clamp(Math.floor(x/CS),0,FW-1);

function chamfer(src){
  const d=new Float32Array(N),a=CS,b=CS*1.4142;
  for(let k=0;k<N;k++)d[k]=src[k]?0:1e9;
  for(let j=0;j<FH;j++)for(let i=0;i<FW;i++){const k=j*FW+i;let v=d[k];
    if(i>0)v=Math.min(v,d[k-1]+a);
    if(j>0){v=Math.min(v,d[k-FW]+a);if(i>0)v=Math.min(v,d[k-FW-1]+b);if(i<FW-1)v=Math.min(v,d[k-FW+1]+b)}d[k]=v}
  for(let j=FH-1;j>=0;j--)for(let i=FW-1;i>=0;i--){const k=j*FW+i;let v=d[k];
    if(i<FW-1)v=Math.min(v,d[k+1]+a);
    if(j<FH-1){v=Math.min(v,d[k+FW]+a);if(i<FW-1)v=Math.min(v,d[k+FW+1]+b);if(i>0)v=Math.min(v,d[k+FW-1]+b)}d[k]=v}
  return d;
}

const NAME_PRE=['Ash','Bel','Cor','Dun','El','Fen','Gal','Har','Iron','Kel','Lor','Mar','Nor','Oak','Pen','Quill','Raven','Stone','Thorn','Ul','Vel','Wyn','Yar','Zor','Bright','Cold','Gold','Mist','Red','Silver','Storm','Wolf','Amber','Briar','Crow','Dusk','Elder','Frost','Glen','Hollow','Ivy','Lark','Moon','North','Pine','Rose','Salt','Swan','Tall','Vale','Whit','Wild'];
const NAME_SUF={village:['by','ford','stead','wick','ham','thorpe','well','brook','dale','field','leigh','combe'],town:['ton','bury','port','gate','bridge','market','haven','mere','borough','minster'],fort:['hold','watch','guard','wall','rock','spire','bastion','tor'],castle:['keep','castle','crown','throne','helm','fast','reach','hall']};
function makeName(rand,type,used){for(let tries=0;tries<40;tries++){const a=NAME_PRE[Math.floor(rand()*NAME_PRE.length)],sfx=NAME_SUF[type][Math.floor(rand()*NAME_SUF[type].length)];
  let n=a+sfx;if(/[aeiou]$/i.test(a)&&/^[aeiou]/.test(sfx))n=a+sfx.slice(1);n=n[0].toUpperCase()+n.slice(1).toLowerCase();if(!used.has(n)){used.add(n);return n}}
  const n='New '+NAME_PRE[Math.floor(rand()*NAME_PRE.length)]+NAME_SUF[type][0];used.add(n);return n}

/* ---------------- generation ---------------- */
async function generate(seed,target,cfg,prog){
  const rand=mulberry32(seed);
  const nz=[];for(let i=0;i<10;i++)nz.push(makePerlin(rand));
  TX=new Float32Array(65536);{const t=new Float32Array(65536);for(let i=0;i<65536;i++)t[i]=rand();
    let mn=9,mx=-9;for(let y=0;y<256;y++)for(let x=0;x<256;x++){let s=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=t[((y+dy)&255)*256+((x+dx)&255)];s/=9;TX[y*256+x]=s;if(s<mn)mn=s;if(s>mx)mx=s}
    for(let i=0;i<65536;i++)TX[i]=(TX[i]-mn)/(mx-mn)}
  const landShare=clamp(+cfg.map.land_share||.52,.25,.8);

  await prog(.04,'Raising the continent');
  const raw=new Float32Array(N);
  for(let j=0;j<FH;j++){const t=(j+.5)*CS/1000;for(let i=0;i<FW;i++){const s=(i+.5)*CS/1000,k=j*FW+i;
    const qx=fbm(nz[0],s*1.4,t*1.4,4),qy=fbm(nz[1],s*1.4+5.2,t*1.4+1.3,4);
    const h=fbm(nz[2],(s+.55*qx)*1.5,(t+.55*qy)*1.5,6);
    const dx=s-1,dy=(t-.65)/.62,d2=dx*dx+dy*dy;
    const fall=.42-.85*d2;
    const mask=smooth(0,.22,fbm(nz[3],s*1.2+3.1,t*1.2+9.7,3));
    let ridge=1-Math.abs(fbm(nz[4],(s+.3*qx)*3.2,(t+.3*qy)*3.2,5))*3;ridge=ridge<0?0:ridge*ridge*ridge;
    const edge=Math.min(s,2-s,t,1.3-t),pen=edge<.09?(.09-edge)/.09*1.4:0;
    raw[k]=h*1.55+fall+ridge*mask*.5-pen}}
  const sorted=Float32Array.from(raw).sort();
  const L0=Math.floor(N*(1-landShare)),q=sorted[L0],mn=sorted[0],mx=sorted[N-1];
  const LN=N-L0,lq=f=>sorted[L0+Math.floor(LN*f)];
  const qa=lq(.70)-q,qb=lq(.89)-q,qc=lq(.965)-q,qd=mx-q;
  EO=new Float32Array(N);
  for(let k=0;k<N;k++){const v=raw[k];
    if(v<=q){EO[k]=Math.min(-1e-4,(v-q)/(q-mn))}
    else{const x=v-q;EO[k]=x<qa?x/qa*.35:x<qb?.35+(x-qa)/(qb-qa)*.2:x<qc?.55+(x-qb)/(qc-qb)*.25:.8+(x-qc)/(qd-qc)*.2}}

  await prog(.1,'Turning the seasons');
  {const src=new Uint8Array(N);for(let k=0;k<N;k++)src[k]=EO[k]<=0?1:0;DWater=chamfer(src)}
  TT=new Float32Array(N);MM=new Float32Array(N);
  for(let j=0;j<FH;j++){const t=(j+.5)*CS/1000;for(let i=0;i<FW;i++){const s=(i+.5)*CS/1000,k=j*FW+i;
    TT[k]=clamp(.2+.82*(t/1.3)+fbm(nz[5],s*2,t*2,3)*.35-Math.max(0,EO[k])*.5,0,1);
    MM[k]=clamp(.42+fbm(nz[6],s*1.7+4,t*1.7,4)*1.2+.3*Math.exp(-DWater[k]/55),0,1)}}

  await prog(.16,'Carving rivers and lakes');
  const filled=Float32Array.from(EO),down=new Int32Array(N).fill(-1),order=new Int32Array(N),closed=new Uint8Array(N);let oc=0;
  {const hp=new Heap(N);
   for(let k=0;k<N;k++){const i=k%FW,j=(k-i)/FW;if(EO[k]<=0||i===0||j===0||i===FW-1||j===FH-1){closed[k]=1;hp.push(EO[k],k)}}
   while(hp.n){const k=hp.pop();order[oc++]=k;const i=k%FW,j=(k-i)/FW;
     for(let d=0;d<8;d++){const ni=i+DX[d],nj=j+DY[d];if(ni<0||nj<0||ni>=FW||nj>=FH)continue;const nk=nj*FW+ni;if(closed[nk])continue;closed[nk]=1;
       const f=Math.max(EO[nk],filled[k]+1e-6);filled[nk]=f;down[nk]=k;hp.push(f,nk)}}}
  LKf=new Float32Array(N);E=Float32Array.from(EO);
  for(let k=0;k<N;k++){if(EO[k]>0&&filled[k]-EO[k]>.009){LKf[k]=1;E[k]=Math.max(-.3,-.02-(filled[k]-EO[k])*1.5)}}
  ACC=new Float32Array(N);
  for(let k=0;k<N;k++)ACC[k]=EO[k]>0?.35+MM[k]:0;
  for(let x=oc-1;x>=0;x--){const k=order[x],d=down[k];if(d>=0)ACC[d]+=ACC[k]}
  {const src=new Uint8Array(N);for(let k=0;k<N;k++)src[k]=E[k]>=0?1:0;DLand=chamfer(src)}
  GR=new Float32Array(N);
  for(let j=0;j<FH;j++)for(let i=0;i<FW;i++){const k=j*FW+i;
    const gx=(E[j*FW+Math.min(FW-1,i+1)]-E[j*FW+Math.max(0,i-1)])/(2*CS),gy=(E[Math.min(FH-1,j+1)*FW+i]-E[Math.max(0,j-1)*FW+i])/(2*CS);
    GR[k]=Math.sqrt(gx*gx+gy*gy)+1e-6}

  // special lands: volcanic ashlands and meteor-scarred crater wastes (separate RNG keeps older maps unchanged)
  BXv=new Float32Array(N);BXk=new Uint8Array(N);regions=[];
  {const r2=mulberry32((seed^0x5bd1e995)>>>0),nb=makePerlin(r2);const nEach=target>=200?2:1;const msrc=new Uint8Array(N);for(let k=0;k<N;k++)msrc[k]=EO[k]>.55?1:0;const DM=chamfer(msrc);
   const specs=[[1,k=>EO[k]>.15&&EO[k]<.55&&DM[k]>8&&DM[k]<45&&DWater[k]>40&&!LKf[k]],[2,k=>EO[k]>.04&&EO[k]<.32&&MM[k]<.6&&DWater[k]>40&&!LKf[k]]];
   for(const [kind,pred] of specs)for(let n=0;n<nEach;n++){let k0=-1;
     for(let t=0;t<6000;t++){const k=Math.floor(r2()*N);if(!pred(k))continue;const x=(k%FW+.5)*CS,y=(Math.floor(k/FW)+.5)*CS;if(regions.every(g=>Math.hypot(g.x-x,g.y-y)>380)){k0=k;break}}
     if(k0<0)continue;const cx=(k0%FW+.5)*CS,cy=(Math.floor(k0/FW)+.5)*CS,R=95+r2()*50;regions.push({kind,x:cx,y:cy,R});
     const ri=Math.ceil(R*1.5/CS),ci=k0%FW,cj=Math.floor(k0/FW);
     for(let j=Math.max(0,cj-ri);j<=Math.min(FH-1,cj+ri);j++)for(let i=Math.max(0,ci-ri);i<=Math.min(FW-1,ci+ri);i++){const k=j*FW+i;if(EO[k]<=0||LKf[k])continue;
       const x=(i+.5)*CS,y=(j+.5)*CS,d=Math.hypot(x-cx,y-cy),v=1-d/(R*(.85+fbm(nb,x/60,y/60,3)*.9));if(v>BXv[k]){BXv[k]=v;BXk[k]=kind}}}}
  BI=new Uint8Array(N);R_=new Float32Array(N);G_=new Float32Array(N);B_=new Float32Array(N);
  for(let j=0;j<FH;j++)for(let i=0;i<FW;i++){const k=j*FW+i,e=EO[k],T=TT[k],M=MM[k];let bi;
    if(e<=0)bi=0;else if(LKf[k])bi=1;else if(e>.8||(e>.6&&T<.28))bi=2;else if(e>.55)bi=3;else if(T<.2)bi=4;else if(T<.36)bi=M>.42?5:6;
    else if(e<.14&&M>.66)bi=10;else if(T>.72)bi=M<.32?11:M<.5?12:13;else bi=M<.3?8:M<.52?7:9;
    BI[k]=bi;if(bi<2)continue;
    let c=BCOL[bi].slice();
    if(bi>=4&&e>.36){const f=Math.min(1,(e-.36)/.19)*.32;c=[c[0]+(186-c[0])*f,c[1]+(172-c[1])*f,c[2]+(122-c[2])*f]}
    if(bi===2&&e<.8){const f=.35;c=[c[0]+(178-c[0])*f,c[1]+(166-c[1])*f,c[2]+(146-c[2])*f]}
    if(BXk[k]){const f=smooth(0,.28,BXv[k]),tg=BXk[k]===1?[92,80,74]:[216,184,128];c=[c[0]+(tg[0]-c[0])*f,c[1]+(tg[1]-c[1])*f,c[2]+(tg[2]-c[2])*f]}
    const im=Math.max(0,i-1),ip=Math.min(FW-1,i+1),jm=Math.max(0,j-1),jp=Math.min(FH-1,j+1);
    const lit=(Math.max(0,EO[j*FW+ip])-Math.max(0,EO[j*FW+im]))+(Math.max(0,EO[jp*FW+i])-Math.max(0,EO[jm*FW+i]));
    let sh=1+Math.sign(lit)*Math.sqrt(Math.abs(lit))*.9;sh=clamp(sh,.7,1.25);
    const patch=1+fbm(nz[7],i*.024,j*.024,3)*.16;
    R_[k]=c[0]*sh*patch;G_[k]=c[1]*sh*patch;B_[k]=c[2]*sh*patch}

  await prog(.24,'Tracing the rivers');
  const TR=230;ISRIV=new Uint8Array(N);
  for(let k=0;k<N;k++)if(EO[k]>0&&!LKf[k]&&ACC[k]>TR)ISRIV[k]=1;
  const upc=new Uint8Array(N);for(let k=0;k<N;k++)if(ISRIV[k]&&down[k]>=0&&ISRIV[down[k]])upc[down[k]]++;
  const vis=new Uint8Array(N);rivers=[];
  const rw=a=>Math.min(3.4,.55+.32*Math.sqrt(a/TR));
  const cpt=k=>{const i=k%FW,j=(k-i)/FW;return[(i+.5)*CS+(hash01(k)-.5)*CS*.75,(j+.5)*CS+(hash01(k+7919)-.5)*CS*.75]};
  for(let k0=0;k0<N;k0++){if(!ISRIV[k0]||upc[k0])continue;
    const pts=[],ws=[];
    {const i=k0%FW,j=(k0-i)/FW;for(let d=0;d<8;d++){const ni=i+DX[d],nj=j+DY[d];if(ni<0||nj<0||ni>=FW||nj>=FH)continue;const nk=nj*FW+ni;if(LKf[nk]&&down[nk]===k0){const p=cpt(nk);pts.push(p[0],p[1]);ws.push(rw(ACC[k0]));break}}}
    let cur=k0;
    for(let guard=0;guard<4000;guard++){
      const p=cpt(cur);pts.push(p[0],p[1]);ws.push(rw(ACC[cur]));
      if(vis[cur])break;vis[cur]=1;
      const d=down[cur];if(d<0)break;
      if(E[d]<0){const q2=cpt(d);pts.push(q2[0],q2[1]);ws.push(rw(ACC[cur]));break}
      if(!ISRIV[d])break;cur=d}
    if(ws.length<3)continue;
    const [sp,sw]=chaikin(pts,ws,2);
    rivers.push({p:sp,w:sw,bb:bbOf(sp)})}
  const nearRiv=new Uint8Array(N);
  for(let j=0;j<FH;j++)for(let i=0;i<FW;i++){if(!ISRIV[j*FW+i])continue;for(let dj=-2;dj<=2;dj++)for(let di=-2;di<=2;di++){const ni=i+di,nj=j+dj;if(ni>=0&&nj>=0&&ni<FW&&nj<FH)nearRiv[nj*FW+ni]=1}}

  /* ---- provinces with a target count ---- */
  await prog(.32,'Drawing the territories');
  provId=new Int16Array(N).fill(-1);
  const land=[];for(let k=0;k<N;k++)if(EO[k]>0&&!LKf[k])land.push(k);
  for(let i=land.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));const t=land[i];land[i]=land[j];land[j]=t}
  const landArea=land.length*CS*CS;
  const poisson=sp=>{const HG=Math.ceil(W/sp),HH=Math.ceil(H/sp),grid=new Map(),seeds=[];
    for(const k of land){const i=k%FW,j=(k-i)/FW,x=(i+.5)*CS,y=(j+.5)*CS,gx=Math.floor(x/sp),gy=Math.floor(y/sp);let ok=true;
      for(let a=-1;a<=1&&ok;a++)for(let b=-1;b<=1&&ok;b++){const xx=gx+a,yy=gy+b;if(xx<0||yy<0||xx>=HG||yy>=HH)continue;const cell=grid.get(yy*HG+xx);if(!cell)continue;
        for(const s of cell){const si=s%FW,sj=(s-si)/FW;if(((si-i)*CS)**2+((sj-j)*CS)**2<sp*sp){ok=false;break}}}
      if(ok){const key=gy*HG+gx;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(k);seeds.push(k)}}
    return seeds};
  let sp=Math.sqrt(landArea/target/0.78),seeds=poisson(sp);
  for(let it=0;it<6&&Math.abs(seeds.length-target)>Math.max(2,target*.02);it++){sp*=Math.sqrt(seeds.length/target);seeds=poisson(sp)}
  const pd=new Float32Array(N).fill(Infinity);
  const grow=list=>{const hp=new Heap(4096);for(const [k,p] of list){provId[k]=p;pd[k]=0;hp.push(0,k)}
    while(hp.n){const k=hp.pop(),p=provId[k],i=k%FW,j=(k-i)/FW,dk=pd[k];
      for(let d=0;d<8;d++){const ni=i+DX[d],nj=j+DY[d];if(ni<0||nj<0||ni>=FW||nj>=FH)continue;const nk=nj*FW+ni;if(EO[nk]<=0||LKf[nk])continue;
        const c=dk+DL8[d]*(1+(EO[nk]>.55?3:0))+(ISRIV[nk]!==ISRIV[k]?5:0);if(c<pd[nk]){pd[nk]=c;provId[nk]=p;hp.push(c,nk)}}}};
  P=0;grow(seeds.map(k=>[k,P++]));
  for(const k of land){if(provId[k]<0){grow([[k,P++]])}}
  // merge crumbs (tiny pieces) into a neighbour when possible
  {const cnt0=new Int32Array(P);for(let k=0;k<N;k++)if(provId[k]>=0)cnt0[provId[k]]++;
   const minCells=Math.max(10,Math.floor(landArea/target/CS/CS*.18));const remap=new Int32Array(P);for(let p=0;p<P;p++)remap[p]=p;
   for(let k=0;k<N;k++){const p=provId[k];if(p<0||cnt0[p]>=minCells)continue;const i=k%FW,j=(k-i)/FW;
     for(let d=0;d<4;d++){const ni=i+DX[d],nj=j+DY[d];if(ni<0||nj<0||ni>=FW||nj>=FH)continue;const q2=provId[nj*FW+ni];if(q2>=0&&q2!==p&&cnt0[q2]>=minCells){remap[p]=q2;break}}}
   const newId=new Int32Array(P).fill(-1);let np=0;for(let p=0;p<P;p++)if(remap[p]===p)newId[p]=np++;
   for(let k=0;k<N;k++){const p=provId[k];if(p<0)continue;const r=remap[p];provId[k]=newId[r]>=0?newId[r]:newId[remap[r]]>=0?newId[remap[r]]:-1}
   for(let k=0;k<N;k++){if(provId[k]===-1&&EO[k]>0&&!LKf[k]){provId[k]=np++}}
   P=np}
  const cnt=new Int32Array(P);pcx=new Float32Array(P);pcy=new Float32Array(P);pbb=new Int32Array(P*4);
  for(let p=0;p<P;p++){pbb[p*4]=FW;pbb[p*4+1]=FH;pbb[p*4+2]=-1;pbb[p*4+3]=-1}
  const nset=Array.from({length:P},()=>new Set());
  const tcount=Array.from({length:P},()=>new Float32Array(10));
  pcoast=new Uint8Array(P);
  for(let j=0;j<FH;j++)for(let i=0;i<FW;i++){const k=j*FW+i,p=provId[k];if(p<0)continue;cnt[p]++;pcx[p]+=(i+.5)*CS;pcy[p]+=(j+.5)*CS;
    const o=p*4;if(i<pbb[o])pbb[o]=i;if(j<pbb[o+1])pbb[o+1]=j;if(i>pbb[o+2])pbb[o+2]=i;if(j>pbb[o+3])pbb[o+3]=j;
    if(i<FW-1){const q2=provId[k+1];if(q2>=0&&q2!==p){nset[p].add(q2);nset[q2].add(p)}}
    if(j<FH-1){const q2=provId[k+FW];if(q2>=0&&q2!==p){nset[p].add(q2);nset[q2].add(p)}}
    if(DWater[k]<=CS*1.5&&!LKf[k])pcoast[p]=1;
    const e=EO[k],b=BI[k];let ti;
    if(e>.55)ti=4;else if(b===2)ti=4;else if(e>.36)ti=2;else if(b===9||b===13||b===5)ti=1;else if(b===10)ti=5;else if(b===11)ti=6;else if(b===4)ti=7;else ti=0;
    tcount[p][ti]++;if(BXv[k]>.2)tcount[p][7+BXk[k]]++}
  for(let p=0;p<P;p++){if(cnt[p]){pcx[p]/=cnt[p];pcy[p]/=cnt[p]}}
  nbr=nset.map(s=>[...s]);pcells=cnt;
  ptype=new Array(P);const mshare=new Float32Array(P);
  for(let p=0;p<P;p++){const tc=tcount[p],tot=cnt[p]||1;mshare[p]=tc[4]/tot;
    if(mshare[p]>.45){ptype[p]='mountains';continue}
    if(tc[8]/tot>.4){ptype[p]='ashlands';continue}  // kept only next to mountains (checked below)
    if(tc[9]/tot>.4){ptype[p]='wastes';continue}
    if(tc[2]/tot>.5){ptype[p]='hills';continue}
    let best=0,bv=-1;for(const ti of [0,1,5,6,7]){if(tc[ti]>bv){bv=tc[ti];best=ti}}ptype[p]=PTYPES[best]}
  for(let p=0;p<P;p++)if(ptype[p]==='ashlands'&&!nbr[p].some(q=>ptype[q]==='mountains')){const tc=tcount[p];let best=0,bv=-1;for(const ti of [0,1,5,6,7]){if(tc[ti]>bv){bv=tc[ti];best=ti}}ptype[p]=tc[2]/(cnt[p]||1)>.5?'hills':PTYPES[best]}
  panchor=new Float32Array(P*2);{const best=new Float32Array(P).fill(Infinity);
    for(let k=0;k<N;k++){const p=provId[k];if(p<0)continue;const i=k%FW,j=(k-i)/FW,x=(i+.5)*CS,y=(j+.5)*CS,d=(x-pcx[p])**2+(y-pcy[p])**2+(EO[k]>.55?4000:0)+(ISRIV[k]?900:0);if(d<best[p]){best[p]=d;panchor[p*2]=x;panchor[p*2+1]=y}}}

  /* ---- settlements: one per chosen province ---- */
  await prog(.42,'Founding towns and castles');
  const FERT=[0,0,0,0,.1,.4,.5,1,.6,.7,.2,.15,.6,.4];
  const bestCell=new Int32Array(P).fill(-1),bestScore=new Float32Array(P).fill(-Infinity);
  for(let k=0;k<N;k++){const p=provId[k];if(p<0)continue;const e=EO[k];if(e>=.55||ISRIV[k])continue;const i=k%FW,j=(k-i)/FW,x=(i+.5)*CS,y=(j+.5)*CS;
    if(x<40||x>W-40||y<46||y>H-36)continue;
    const dc=Math.hypot(x-pcx[p],y-pcy[p]);
    const s=FERT[BI[k]]+nearRiv[k]*.6+(DWater[k]<10?.4:0)-dc/120+hash01(k)*.25;
    if(s>bestScore[p]){bestScore[p]=s;bestCell[p]=k}}
  const share=clamp(+cfg.settlements.min_share||.4,.3,1);
  const cand=[];for(let p=0;p<P;p++)if(bestCell[p]>=0&&pcells[p]>=12)cand.push(p);
  cand.sort((a,b)=>(bestScore[b]+rand()*.5)-(bestScore[a]+rand()*.5));
  const want=Math.min(cand.length,Math.ceil(P*share));
  // keep spacing by preferring provinces not adjacent to an already chosen one, then fill
  const chosen=[],taken=new Uint8Array(P),adjTaken=new Uint8Array(P);
  for(const p of cand){if(chosen.length>=want)break;if(adjTaken[p])continue;chosen.push(p);taken[p]=1;for(const q2 of nbr[p])adjTaken[q2]=1}
  for(const p of cand){if(chosen.length>=want)break;if(!taken[p]){chosen.push(p);taken[p]=1}}
  const mix=cfg.settlements.mix||{castle:.12,fort:.16,town:.3,village:.42};
  const nCastle=Math.max(Math.round(chosen.length*(+mix.castle||.12)),(cfg._realmCount||5)+3);
  const nFort=Math.round(chosen.length*(+mix.fort||.16)),nTown=Math.round(chosen.length*(+mix.town||.3));
  psett=new Int32Array(P).fill(-1);settlements=[];
  const typeOf=new Map();
  // castles spread out by farthest-point sampling over chosen provinces
  {const pool=chosen.slice();let first=pool.reduce((a,b)=>bestScore[a]>bestScore[b]?a:b);const cs=[first];
    const md=new Float32Array(P).fill(Infinity);
    while(cs.length<Math.min(nCastle,pool.length)){const last=cs[cs.length-1];let bp=-1,bd=-1;
      for(const p of pool){if(cs.includes(p))continue;const d=Math.hypot(pcx[p]-pcx[last],pcy[p]-pcy[last]);if(d<md[p])md[p]=d;const sc=md[p]*(.8+bestScore[p]*.15);if(sc>bd){bd=sc;bp=p}}
      if(bp<0)break;cs.push(bp)}
    for(const p of cs)typeOf.set(p,'castle')}
  const rest=chosen.filter(p=>!typeOf.has(p));
  rest.sort((a,b)=>((ptype[b]==='hills'||ptype[b]==='highlands'||ptype[b]==='mountains'?1:0)+nbr[b].length*.05)-((ptype[a]==='hills'||ptype[a]==='highlands'||ptype[a]==='mountains'?1:0)+nbr[a].length*.05));
  for(const p of rest.slice(0,nFort))typeOf.set(p,'fort');
  const rest2=rest.filter(p=>!typeOf.has(p)).sort((a,b)=>bestScore[b]-bestScore[a]);
  rest2.forEach((p,i)=>typeOf.set(p,i<nTown?'town':'village'));
  const used=new Set();
  for(const p of chosen){const k=bestCell[p],i=k%FW,j=(k-i)/FW,type=typeOf.get(p);
    const s={id:settlements.length,type,x:(i+.5)*CS,y:(j+.5)*CS,k,prov:p,r:hash01(k+33),name:makeName(rand,type,used)};psett[p]=s.id;settlements.push(s)}

  /* ---- roads ---- */
  await prog(.5,'Laying the roads');
  rcost=new Float32Array(RN);rriv=new Uint8Array(RN);rroad=new Uint8Array(RN);
  for(let cj=0;cj<RH;cj++)for(let ci=0;ci<RW;ci++){const c=cj*RW+ci;let water=0,es=0,riv=0,n=0;
    for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++){const i=Math.min(FW-1,ci*2+di),j=Math.min(FH-1,cj*2+dj),k=j*FW+i;n++;if(E[k]<0)water++;es+=Math.max(0,EO[k]);if(ISRIV[k])riv=1}
    if(water>=2){rcost[c]=Infinity;continue}
    const e=es/n,k=Math.min(FH-1,cj*2)*FW+Math.min(FW-1,ci*2),b=BI[k];
    let cost=1;if(e>.8)cost=30;else if(e>.55)cost=9;else if(e>.36)cost=2.2;
    if(b===9||b===13||b===5)cost*=1.5;else if(b===10)cost*=3;else if(b===11)cost*=1.3;
    rcost[c]=cost;rriv[c]=riv}
  const gEdges=new Map();const T=settlements;
  for(let a=0;a<T.length;a++){const A=T[a];const K=A.type==='castle'?4:A.type==='village'?2:3;const mdist=A.type==='castle'?420:A.type==='village'?190:300;
    const ds=[];for(let b=0;b<T.length;b++){if(b===a)continue;const d=Math.hypot(T[b].x-A.x,T[b].y-A.y);if(d<mdist)ds.push([d,b])}
    ds.sort((x,y)=>x[0]-y[0]);for(let i=0;i<Math.min(K,ds.length);i++){const b=ds[i][1],key=a<b?a+'-'+b:b+'-'+a;if(!gEdges.has(key))gEdges.set(key,[ds[i][0],Math.min(a,b),Math.max(a,b)])}}
  const edges=[...gEdges.values()].sort((x,y)=>x[0]-y[0]);
  roads=[];
  for(let ei=0;ei<edges.length;ei++){const [,a,b]=edges[ei];const A=T[a],B=T[b];
    const path=astar(rcellOf(A.x,A.y),rcellOf(B.x,B.y),.3,1,40000);if(!path)continue;
    for(const c of path)rroad[c]=1;
    const pts=[A.x,A.y],ws=[1];for(let i=1;i<path.length-1;i++){const c=path[i];pts.push((c%RW+.5)*RCS,(Math.floor(c/RW)+.5)*RCS);ws.push(1)}pts.push(B.x,B.y);ws.push(1);
    const [sp2]=chaikin(pts,ws,2);
    roads.push({p:sp2,major:A.type!=='village'&&B.type!=='village',bb:bbOf(sp2)});
    if(ei%25===0)await prog(.5+.1*ei/edges.length,'Laying the roads')}

  /* ---- glyphs ---- */
  await prog(.62,'Planting forests, raising peaks');
  const EX=new Uint8Array(N);
  for(let k=0;k<N;k++){if(E[k]<0)EX[k]=1}
  for(let j=0;j<FH;j++)for(let i=0;i<FW;i++){if(!ISRIV[j*FW+i])continue;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const ni=i+di,nj=j+dj;if(ni>=0&&nj>=0&&ni<FW&&nj<FH)EX[nj*FW+ni]=1}}
  for(let c=0;c<RN;c++){if(!rroad[c])continue;const ci=c%RW,cj=(c-ci)/RW;for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++){const i=Math.min(FW-1,ci*2+di),j=Math.min(FH-1,cj*2+dj),k=j*FW+i;if(!EX[k])EX[k]=2}}
  for(const t of settlements){const rad=t.type==='castle'?24:t.type==='town'?13:t.type==='fort'?11:8;const r2=Math.ceil(rad/CS);const ti=Math.floor(t.x/CS),tj=Math.floor(t.y/CS);
    for(let dj=-r2;dj<=r2+1;dj++)for(let di=-r2;di<=r2;di++){const ni=ti+di,nj=tj+dj;if(ni>=0&&nj>=0&&ni<FW&&nj<FH&&di*di+dj*dj<=r2*r2+1)EX[nj*FW+ni]=1}}
  glyphs=[];
  const scan=(spc,fn)=>{for(let y=spc/2;y<H;y+=spc)for(let x=spc/2;x<W;x+=spc){const px=x+(rand()-.5)*spc*.9,py=y+(rand()-.5)*spc*.9;if(px<2||py<2||px>W-2||py>H-2)continue;fn(px,py,cellAt(px,py),rand())}};
  scan(16,(x,y,k,r)=>{const e=EO[k];if(e<=.55||EX[k]===1||rand()>.62+(e-.55)*1.6)return;const Tk=TT[k];const snow=e>.74||(e>.62&&Tk<.3);
    const desert=Tk>.66&&MM[k]<.45,cold=Tk<.32,ash=BXk[k]===1&&BXv[k]>.1;
    glyphs.push({t:0,x,y,s:10+(e-.55)*40+r*6,r,snow:snow&&!ash,lt:ash?'#857770':desert?'#e3c08a':cold?'#d9d6cc':'#dccdae',dk:ash?'#4a403c':desert?'#b48a57':cold?'#9c9890':'#a08a6b'})});
  scan(11,(x,y,k,r)=>{const e=EO[k];if(e<=.36||e>.55||EX[k]||r>.72||BXv[k]>.15)return;
    glyphs.push({t:1,x,y,s:5.5+r*3,r,lt:`rgb(${Math.min(255,R_[k]*1.08)|0},${Math.min(255,G_[k]*1.08)|0},${Math.min(255,B_[k]*1.06)|0})`})});
  const TREE={9:[['#5f8f40','#6b9c47','#527f37'],'#3c6528'],13:[['#3f7d3a','#357235','#4b8a40'],'#245226'],5:[['#3f6a4a','#456f4c','#385f43'],'#2a4834']};
  scan(4.6,(x,y,k,r)=>{if(EX[k]||BXv[k]>.12)return;const b=BI[k];const dens=smooth(-.12,.12,fbm(nz[8],x/110,y/110,3))*.85+.15;
    if(b===9||b===13){if(rand()>.88*dens)return;const tc=TREE[b];glyphs.push({t:2,x,y,s:(b===13?4.6:3.9)+r*1.1,r,col:tc[0][(r*3)|0],dk:tc[1]})}
    else if(b===5){if(rand()>.86*dens)return;const tc=TREE[5];glyphs.push({t:3,x,y,s:4.2+r*1.4,r,col:tc[0][(r*3)|0],dk:tc[1]})}
    else if(b===4){if(rand()>.04)return;glyphs.push({t:3,x,y,s:3.6+r,r,col:'#5c7b66',dk:'#3f5a4a'})}
    else if(b===7||b===8){if(rand()>.025)return;glyphs.push({t:2,x,y,s:3.6+r,r,col:'#6b9c47',dk:'#3c6528'})}
    else if(b===12){if(rand()>.05)return;glyphs.push({t:4,x,y,s:4+r*1.4,r})}});
  scan(7,(x,y,k,r)=>{if(EX[k]||BI[k]!==10||r>.6)return;glyphs.push({t:5,x,y,s:2.6+r*1.2,r})});
  scan(20,(x,y,k,r)=>{if(EX[k]||BI[k]!==11||r>.65)return;glyphs.push({t:6,x,y,s:5+r*4,r})});
  scan(15,(x,y,k,r)=>{const b=BI[k];if(BXv[k]>.12||EX[k]||!(b===7||b===8||b===6)||r>.2)return;glyphs.push({t:7,x,y,s:1.6+r*2,r})});
  // ashlands and crater wastes
  for(const g of regions){const k=cellAt(g.x,g.y);if(EX[k]===1)continue;if(g.kind===1)glyphs.push({t:8,x:g.x,y:g.y+12,s:30+g.R*.1,r:.5});else glyphs.push({t:12,x:g.x,y:g.y,s:26+g.R*.08,r:.5,big:true})}
  const inR=(k,kind,v)=>BXk[k]===kind&&BXv[k]>v&&!EX[k];
  const nearMain=(x,y)=>regions.some(g=>Math.hypot(g.x-x,g.y-y)<g.R*.38);
  scan(26,(x,y,k,r)=>{if(!inR(k,1,.35)||nearMain(x,y)||r>.35)return;glyphs.push({t:8,x,y,s:12+r*14,r})});
  scan(11,(x,y,k,r)=>{if(!inR(k,1,.1)||r>.4)return;glyphs.push({t:9,x,y,s:3+r*4,r})});
  scan(24,(x,y,k,r)=>{if(!inR(k,1,.2)||nearMain(x,y)||r>.4)return;glyphs.push({t:10,x,y,s:4+r*3,r})});
  scan(9,(x,y,k,r)=>{if(!inR(k,1,.05)||r>.18)return;glyphs.push({t:11,x,y,s:3+r*1.5,r})});
  scan(24,(x,y,k,r)=>{if(!inR(k,2,.25)||nearMain(x,y)||r>.4)return;glyphs.push({t:12,x,y,s:6+r*8,r})});
  scan(17,(x,y,k,r)=>{if(!inR(k,2,.08)||r>.6)return;glyphs.push({t:6,x,y,s:5+r*4,r})});
  scan(12,(x,y,k,r)=>{if(!inR(k,2,.1)||r>.22)return;glyphs.push({t:13,x,y,s:1.4+r*1.6,r})});
  glyphs.sort((a,b)=>a.y-b.y);
  // decorations: a wind rose and sea creatures in open water
  decor=[];{const open=[];for(let j=0;j<FH;j+=3)for(let i=0;i<FW;i+=3){const k=j*FW+i,x=(i+.5)*CS,y=(j+.5)*CS;if(E[k]<0&&!LKf[k]&&DLand[k]>46&&x>80&&x<W-80&&y>80&&y<H-80)open.push([x,y,DLand[k]])}
    const far=(x,y,d)=>decor.every(o=>Math.hypot(o.x-x,o.y-y)>d);
    const corners=[[150,150],[W-150,150],[150,H-150],[W-150,H-150]];
    for(const [cx,cy] of corners){let best=null,bd=1e9;for(const o of open){if(o[2]<70)continue;const d=Math.hypot(o[0]-cx,o[1]-cy);if(d<bd){bd=d;best=o}}if(best&&bd<420){decor.push({t:'rose',x:best[0],y:best[1],s:Math.min(78,best[2]*.85)});break}}
    for(let i=open.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));const t=open[i];open[i]=open[j];open[j]=t}
    let n=0;for(const o of open){if(n>=6)break;if(o[0]<140||o[0]>W-140||o[1]<130||o[1]>H-130||!far(o[0],o[1],280))continue;decor.push({t:n%3===1?'serpent':'whale',x:o[0],y:o[1],s:Math.min(40,22+o[2]*.15),flip:rand()<.5});n++}
    // whirlpools in deep water
    let wp=0;for(const o of open){if(wp>=3)break;if(o[2]<55||o[0]<120||o[0]>W-120||o[1]<110||o[1]>H-110||!far(o[0],o[1],200))continue;decor.push({t:'whirl',x:o[0],y:o[1],s:9+rand()*5,r:rand()});wp++}
    // waves scattered over open sea
    for(let y=40;y<H-40;y+=58)for(let x=40;x<W-40;x+=72){const px=x+(rand()-.5)*50,py=y+(rand()-.5)*40,k=cellAt(px,py);if(rand()>.55||E[k]>=0||LKf[k]||DLand[k]<20)continue;
      if(!decor.every(o=>o.t==='wave'||o.t==='reef'||Math.hypot(o.x-px,o.y-py)>(o.t==='rose'?o.s+40:55)))continue;decor.push({t:'wave',x:px,y:py,s:5+rand()*3.5,flip:rand()<.5})}
    // reefs in shallow coastal water
    const shallow=[];for(let j=2;j<FH-2;j+=2)for(let i=2;i<FW-2;i+=2){const k=j*FW+i;if(E[k]<0&&!LKf[k]&&DLand[k]>7&&DLand[k]<18)shallow.push(k)}
    for(let i=shallow.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));const t=shallow[i];shallow[i]=shallow[j];shallow[j]=t}
    let rf=0;for(const k of shallow){if(rf>=16)break;const x=(k%FW+.5)*CS,y=(Math.floor(k/FW)+.5)*CS;if(!decor.every(o=>o.t==='wave'||Math.hypot(o.x-x,o.y-y)>90))continue;decor.push({t:'reef',x,y,s:5+rand()*3,r:rand()});rf++}
    decor.sort((a,b)=>(a.t==='wave'?0:a.t==='reef'?1:2)-(b.t==='wave'?0:b.t==='reef'?1:2))}
  await prog(.7,'Inking the map');
}
function bbOf(p){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1])}return[x0,y0,x1,y1]}

/* ---------------- pathfinding ---------------- */
const aG=new Float32Array(RN),aGen=new Int32Array(RN),aClosed=new Int32Array(RN),aCame=new Int32Array(RN);let aRun=0;const aHeap=new Heap(1<<15);
function rcellOf(x,y){let ci=clamp(Math.floor(x/RCS),0,RW-1),cj=clamp(Math.floor(y/RCS),0,RH-1),c=cj*RW+ci;
  if(isFinite(rcost[c]))return c;
  for(let r=1;r<5;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){const a=ci+di,b=cj+dj;if(a<0||b<0||a>=RW||b>=RH)continue;const cc=b*RW+a;if(isFinite(rcost[cc]))return cc}
  return c}
function astar(s,g,roadMul,hMul,limit){
  aRun++;const run=aRun;aHeap.n=0;const gi=g%RW,gj=(g-gi)/RW;
  aG[s]=0;aGen[s]=run;aCame[s]=-1;aHeap.push(0,s);let exp=0;
  while(aHeap.n){const c=aHeap.pop();if(c===g)break;if(aClosed[c]===run)continue;aClosed[c]=run;if(++exp>limit)return null;
    const ci=c%RW,cj=(c-ci)/RW;
    for(let d=0;d<8;d++){const ni=ci+DX[d],nj=cj+DY[d];if(ni<0||nj<0||ni>=RW||nj>=RH)continue;const n=nj*RW+ni;const cost=rcost[n];if(!isFinite(cost))continue;
      let st=cost*DL8[d];if(rroad[n])st*=roadMul;if(rriv[n]&&!rriv[c])st+=4;
      const ng=aG[c]+st;if(aGen[n]!==run||ng<aG[n]){aGen[n]=run;aG[n]=ng;aCame[n]=c;aHeap.push(ng+Math.hypot(ni-gi,nj-gj)*hMul,n)}}}
  if(aGen[g]!==run)return null;
  const path=[];let c=g;while(c!==-1){path.push(c);if(c===s)break;c=aCame[c]}
  return path.reverse();
}

/* ---------------- terrain shading ---------------- */
const OD=[34,78,114],OS=[70,138,170],OC=[132,192,200],LS=[118,182,196],LD=[72,140,172],RIP=[34,86,120],INKC=[54,40,28],SAND=[228,210,160];
const PARCH=[233,220,190],PARCH_SEA=[196,212,208];
function tex(x,y){const xi=x|0,yi=y|0,fx=x-xi,fy=y-yi,a=xi&255,b=(xi+1)&255,c=(yi&255)<<8,d=((yi+1)&255)<<8;
  const t0=TX[c+a]+(TX[c+b]-TX[c+a])*fx,t1=TX[d+a]+(TX[d+b]-TX[d+a])*fx;return t0+(t1-t0)*fy}
function shadeRows(D,pw,x0,y0,scale,r0,r1,flat){
  const inv=1/scale,inkW=.55+Math.min(scale,12)*.09,lw=.25+.7*inv;
  for(let py=r0;py<r1;py++){
    const wy=y0+(py+.5)*inv;let fy=wy/CS-.5;if(fy<0)fy=0;else if(fy>FH-1.0001)fy=FH-1.0001;
    const j0=fy|0,ty=fy-j0;let o=py*pw*4;
    for(let px=0;px<pw;px++,o+=4){
      const wx=x0+(px+.5)*inv;let fx=wx/CS-.5;if(fx<0)fx=0;else if(fx>FW-1.0001)fx=FW-1.0001;
      const i0=fx|0,tx=fx-i0,k=j0*FW+i0,k1=k+1,k2=k+FW,k3=k2+1;
      const w0=(1-tx)*(1-ty),w1=tx*(1-ty),w2=(1-tx)*ty,w3=tx*ty;
      const g1=tex(wx*.55,wy*.55),g2=tex(wx*.085+31.7,wy*.085+17.3);
      const gr=GR[k]*w0+GR[k1]*w1+GR[k2]*w2+GR[k3]*w3;
      const e=E[k]*w0+E[k1]*w1+E[k2]*w2+E[k3]*w3+((g2-.5)*7+(g1-.5)*1.8)*gr;
      let r,g,b;
      if(flat){
        if(e<0){r=PARCH_SEA[0];g=PARCH_SEA[1];b=PARCH_SEA[2];const Dl=DLand[k]*w0+DLand[k1]*w1+DLand[k2]*w2+DLand[k3]*w3;
          if(Dl<14){const dd=Math.abs(Dl-6);if(dd<lw){const a=.35*(1-dd/lw);r+=(120-r)*a;g+=(150-g)*a;b+=(160-b)*a}}}
        else{r=PARCH[0];g=PARCH[1];b=PARCH[2]}
        const gf=.95+g1*.06+(g2-.5)*.06;r*=gf;g*=gf;b*=gf;
      }else if(e<0){
        const lk=LKf[k]*w0+LKf[k1]*w1+LKf[k2]*w2+LKf[k3]*w3,dep=-e,Dl=DLand[k]*w0+DLand[k1]*w1+DLand[k2]*w2+DLand[k3]*w3;
        if(lk>.5){const f=Math.min(1,dep/.12);r=LS[0]+(LD[0]-LS[0])*f;g=LS[1]+(LD[1]-LS[1])*f;b=LS[2]+(LD[2]-LS[2])*f}
        else{const f=smooth(0,.4,dep);r=OS[0]+(OD[0]-OS[0])*f;g=OS[1]+(OD[1]-OS[1])*f;b=OS[2]+(OD[2]-OS[2])*f;
          if(Dl<16){const cf=(1-Dl/16)*.6;r+=(OC[0]-r)*cf;g+=(OC[1]-g)*cf;b+=(OC[2]-b)*cf}}
        if(Dl<22){let a=0,dd=Math.abs(Dl-5);if(dd<lw)a=.5*(1-dd/lw);dd=Math.abs(Dl-10.5);if(dd<lw)a=Math.max(a,.34*(1-dd/lw));dd=Math.abs(Dl-17.5);if(dd<lw)a=Math.max(a,.2*(1-dd/lw));
          if(a>0){r+=(RIP[0]-r)*a;g+=(RIP[1]-g)*a;b+=(RIP[2]-b)*a}}
        const gf=.95+g1*.07+(g2-.5)*.05;r*=gf;g*=gf;b*=gf;
      }else{
        r=R_[k]*w0+R_[k1]*w1+R_[k2]*w2+R_[k3]*w3;g=G_[k]*w0+G_[k1]*w1+G_[k2]*w2+G_[k3]*w3;b=B_[k]*w0+B_[k1]*w1+B_[k2]*w2+B_[k3]*w3;
        const dist=e/gr;if(dist<2.4){const sf=(1-dist/2.4)*.5;r+=(SAND[0]-r)*sf;g+=(SAND[1]-g)*sf;b+=(SAND[2]-b)*sf}
        const gf=.9+g1*.13+(g2-.5)*.1;r*=gf;g*=gf;b*=gf;
      }
      const dpx=Math.abs(e)/gr*scale;
      if(dpx<inkW+1){const a=(dpx<inkW?.9:.9*(inkW+1-dpx))*(flat?.8:1);r+=(INKC[0]-r)*a;g+=(INKC[1]-g)*a;b+=(INKC[2]-b)*a}
      const ed=Math.min(wx,W-wx,wy,H-wy);if(ed<60){const vf=(flat?.75:.55)+(flat?.25:.45)*ed/60;r*=vf;g*=vf;b*=vf}
      D[o]=r;D[o+1]=g;D[o+2]=b;D[o+3]=255;
    }
  }
}

/* ---------------- glyphs & settlements ---------------- */
function gMountain(c,g){
  const x=g.x,y=g.y,s=g.s,r=g.r,hw=s*.62,ph=s*.92,px=x+(r-.5)*s*.22,py=y-ph;
  const sx=x-hw*.48,sy=y-ph*(.5+r*.12),rx=x+hw*.52,ry=y-ph*(.42+(1-r)*.1),mx=x+(r-.5)*s*.1;
  c.beginPath();c.moveTo(x-hw,y);c.lineTo(sx,sy);c.lineTo(px-s*.06,py+s*.1);c.lineTo(px,py);c.lineTo(mx,y);c.closePath();c.fillStyle=g.lt;c.fill();
  c.beginPath();c.moveTo(px,py);c.lineTo(rx,ry);c.lineTo(x+hw,y);c.lineTo(mx,y);c.closePath();c.fillStyle=g.dk;c.fill();
  if(g.snow){c.beginPath();c.moveTo(px,py);c.lineTo(px-s*.06,py+s*.1);c.lineTo(px-s*.16,py+s*.25);c.lineTo(px-s*.04,py+s*.2);c.lineTo(px+s*.04,py+s*.31);c.lineTo(px+s*.14,py+s*.21);c.closePath();c.fillStyle='#f8f9f6';c.fill()}
  const lw=Math.max(.3,s*.05);c.lineWidth=lw;c.strokeStyle=INK;
  c.beginPath();c.moveTo(x-hw,y);c.lineTo(sx,sy);c.lineTo(px-s*.06,py+s*.1);c.lineTo(px,py);c.lineTo(rx,ry);c.lineTo(x+hw,y);c.stroke();
  c.lineWidth=lw*.7;c.beginPath();c.moveTo(px,py);c.lineTo((px+mx)/2+s*.03,(py+y)/2);c.lineTo(mx,y);
  for(let h=0;h<3;h++){const f=.3+h*.2,ax=px+(rx-px)*f,ay=py+(ry-py)*f;c.moveTo(ax,ay+s*.02);c.lineTo(ax-s*.07,ay+s*.17)}c.stroke();
}
function gHill(c,g){const x=g.x,y=g.y,s=g.s;
  c.beginPath();c.moveTo(x-s,y);c.quadraticCurveTo(x-s*.15,y-s*1.2,x+s,y);c.closePath();c.fillStyle=g.lt;c.fill();
  c.lineWidth=Math.max(.25,s*.07);c.strokeStyle=INK;c.beginPath();c.moveTo(x-s,y);c.quadraticCurveTo(x-s*.15,y-s*1.2,x+s,y);
  c.moveTo(x+s*.2,y-s*.42);c.quadraticCurveTo(x+s*.55,y-s*.3,x+s*.62,y-s*.08);c.stroke()}
function gTree(c,g){const x=g.x,y=g.y,s=g.s,cy=y-s*.78,rr=s*.5;
  c.fillStyle=INK;c.fillRect(x-s*.07,y-s*.4,s*.14,s*.4);
  c.beginPath();c.arc(x,cy,rr,0,6.2832);c.fillStyle=g.col;c.fill();c.lineWidth=Math.max(.2,s*.07);c.strokeStyle=INK;c.stroke();
  c.beginPath();c.arc(x,cy,rr,-.4,2.4);c.arc(x-rr*.28,cy-rr*.22,rr*.82,2.4,-.4,true);c.fillStyle=g.dk;c.fill()}
function gPine(c,g){const x=g.x,y=g.y,s=g.s,top=y-s*1.45,bw=s*.42,by=y-s*.22;
  c.lineWidth=Math.max(.2,s*.07);c.strokeStyle=INK;c.beginPath();c.moveTo(x,by);c.lineTo(x,y);c.stroke();
  c.beginPath();c.moveTo(x,top);c.lineTo(x-bw,by);c.lineTo(x+bw,by);c.closePath();c.fillStyle=g.col;c.fill();c.stroke();
  c.beginPath();c.moveTo(x,top);c.lineTo(x+bw,by);c.lineTo(x,by);c.closePath();c.fillStyle=g.dk;c.fill()}
function gAcacia(c,g){const x=g.x,y=g.y,s=g.s;c.lineWidth=Math.max(.2,s*.08);c.strokeStyle=INK;
  c.beginPath();c.moveTo(x,y);c.lineTo(x,y-s*.7);c.lineTo(x-s*.3,y-s*.95);c.moveTo(x,y-s*.7);c.lineTo(x+s*.25,y-s*.95);c.stroke();
  c.beginPath();c.ellipse(x,y-s*1.02,s*.62,s*.2,0,0,6.2832);c.fillStyle='#6d8a3c';c.fill();c.stroke()}
function gReed(c,g){const x=g.x,y=g.y,s=g.s;c.lineWidth=.3;c.strokeStyle='#4b5a30';c.beginPath();
  for(let i=-1;i<=1;i++){c.moveTo(x+i*.6,y);c.quadraticCurveTo(x+i*.8,y-s*.5,x+i*1.3,y-s)}c.stroke();
  c.strokeStyle='rgba(70,120,140,.8)';c.beginPath();c.moveTo(x-1.8,y+.7);c.lineTo(x+1.6,y+.7);c.stroke()}
function gDune(c,g){const x=g.x,y=g.y,s=g.s;c.lineWidth=.45;c.strokeStyle='#b0874f';c.beginPath();c.moveTo(x-s,y);c.quadraticCurveTo(x-s*.1,y-s*.45,x+s,y);
  c.moveTo(x-s*.1,y-s*.22);c.quadraticCurveTo(x+s*.3,y-s*.12,x+s*.55,y+s*.02);c.stroke()}
function gTuft(c,g){const x=g.x,y=g.y,s=g.s;c.lineWidth=.28;c.strokeStyle='#5d7a35';c.beginPath();
  c.moveTo(x-s*.5,y-s*.6);c.lineTo(x-s*.2,y);c.moveTo(x,y-s);c.lineTo(x,y);c.moveTo(x+s*.5,y-s*.6);c.lineTo(x+s*.2,y);c.stroke()}
function gVolcano(c,g){const x=g.x,y=g.y,s=g.s;c.lineJoin='round';c.lineCap='round';
  c.beginPath();c.moveTo(x-s,y);c.lineTo(x-s*.24,y-s*.86);c.lineTo(x,y-s*.82);c.lineTo(x,y);c.closePath();c.fillStyle='#75655e';c.fill();
  c.beginPath();c.moveTo(x,y-s*.82);c.lineTo(x+s*.24,y-s*.86);c.lineTo(x+s,y);c.lineTo(x,y);c.closePath();c.fillStyle='#43372f';c.fill();
  c.lineWidth=s*.07;c.strokeStyle='#f07a2a';c.beginPath();c.moveTo(x-s*.05,y-s*.84);c.bezierCurveTo(x-s*.18,y-s*.55,x-s*.05,y-s*.35,x-s*.28,y-s*.08);c.moveTo(x+s*.1,y-s*.84);c.bezierCurveTo(x+s*.18,y-s*.6,x+s*.32,y-s*.42,x+s*.36,y-s*.18);c.stroke();
  c.lineWidth=s*.03;c.strokeStyle='#ffd27a';c.beginPath();c.moveTo(x-s*.05,y-s*.84);c.bezierCurveTo(x-s*.18,y-s*.55,x-s*.05,y-s*.35,x-s*.28,y-s*.08);c.stroke();
  c.beginPath();c.ellipse(x,y-s*.85,s*.25,s*.07,0,0,6.2832);c.fillStyle='#e0541f';c.fill();c.lineWidth=Math.max(.3,s*.04);c.strokeStyle=INK;c.stroke();
  c.beginPath();c.moveTo(x-s,y);c.lineTo(x-s*.24,y-s*.86);c.moveTo(x+s*.24,y-s*.86);c.lineTo(x+s,y);c.stroke();
  c.fillStyle='rgba(85,78,76,.55)';for(let i=0;i<4;i++){c.beginPath();c.arc(x+s*(.05+i*.12),y-s*(1.05+i*.22),s*(.13+i*.05),0,6.2832);c.fill()}}
function gCrack(c,g){const x=g.x,y=g.y,s=g.s,r=g.r;c.lineCap='round';c.lineJoin='round';const pts=[[x-s,y],[x-s*.4,y-s*.3*(r-.5)*4],[x+s*.1,y+s*.25],[x+s*.6,y-s*.2],[x+s,y+s*.1]];
  for(const [w,col] of [[.55,'#241a17'],[.25,'#ff8a2a']]){c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(const p of pts.slice(1))c.lineTo(p[0],p[1]);c.lineWidth=w;c.strokeStyle=col;c.stroke()}}
function gTar(c,g){const x=g.x,y=g.y,s=g.s;c.beginPath();c.ellipse(x,y,s*1.4,s*.7,0,0,6.2832);c.fillStyle='#1d1816';c.fill();c.lineWidth=.35;c.strokeStyle=INK;c.stroke();
  c.strokeStyle='rgba(150,140,135,.8)';c.lineWidth=.25;c.beginPath();c.arc(x-s*.4,y-s*.1,s*.18,0,6.2832);c.moveTo(x+s*.55,y+s*.1);c.arc(x+s*.45,y+s*.1,s*.1,0,6.2832);c.stroke();
  c.beginPath();c.ellipse(x+s*.3,y-s*.3,s*.5,s*.12,0,3.4,5.6);c.strokeStyle='rgba(255,255,255,.35)';c.stroke()}
function gDeadTree(c,g){const x=g.x,y=g.y,s=g.s;c.strokeStyle='#2e2420';c.lineCap='round';c.lineWidth=Math.max(.2,s*.09);c.beginPath();c.moveTo(x,y);c.lineTo(x,y-s);c.moveTo(x,y-s*.55);c.lineTo(x-s*.35,y-s*.85);c.moveTo(x,y-s*.7);c.lineTo(x+s*.3,y-s*.95);c.stroke()}
function gCrater(c,g){const x=g.x,y=g.y,s=g.s;c.lineJoin='round';
  if(g.big){c.strokeStyle='rgba(120,88,50,.45)';c.lineWidth=s*.04;c.beginPath();for(let i=0;i<14;i++){const a=i/14*6.2832+.2,r0=s*1.25,r1=s*(1.6+(i%3)*.15);c.moveTo(x+Math.cos(a)*r0,y+Math.sin(a)*r0*.55);c.lineTo(x+Math.cos(a)*r1,y+Math.sin(a)*r1*.55)}c.stroke()}
  c.beginPath();c.ellipse(x,y,s,s*.55,0,0,6.2832);c.fillStyle='#d8b882';c.fill();c.lineWidth=Math.max(.3,s*.04);c.strokeStyle=INK;c.stroke();
  c.beginPath();c.ellipse(x+s*.04,y+s*.04,s*.74,s*.38,0,0,6.2832);c.fillStyle='#9b7547';c.fill();
  c.beginPath();c.ellipse(x+s*.12,y+s*.08,s*.6,s*.28,0,0,6.2832);c.fillStyle='#b8925c';c.fill();
  c.beginPath();c.ellipse(x+s*.04,y+s*.04,s*.74,s*.38,0,0,6.2832);c.lineWidth=Math.max(.25,s*.03);c.stroke()}
function gRock(c,g){const x=g.x,y=g.y,s=g.s;c.beginPath();c.moveTo(x-s,y);c.lineTo(x-s*.5,y-s*.8);c.lineTo(x+s*.4,y-s*.9);c.lineTo(x+s,y-s*.1);c.closePath();c.fillStyle='#a08766';c.fill();c.lineWidth=.25;c.strokeStyle=INK;c.stroke()}
const GLYPH=[gMountain,gHill,gTree,gPine,gAcacia,gReed,gDune,gTuft,gVolcano,gCrack,gTar,gDeadTree,gCrater,gRock];

function house(c,x,y,w,h,roof){c.beginPath();c.rect(x-w/2,y-h,w,h);c.fillStyle='#efe2c4';c.fill();c.stroke();
  c.beginPath();c.moveTo(x-w/2-w*.12,y-h);c.lineTo(x,y-h-w*.6);c.lineTo(x+w/2+w*.12,y-h);c.closePath();c.fillStyle=roof;c.fill();c.stroke()}
const ROOFS=['#b14f37','#9c4430','#b9653d','#7d4a36'];
// draws a settlement with its base at (0,0); flag colour marks the owner
function drawSettlement(c,t,flag,main){c.strokeStyle=INK;c.lineJoin='round';
  if(t.type==='castle'){drawCastle(c,0,0,flag||'#8a7a66',main);return}
  c.fillStyle='rgba(40,28,16,.22)';c.beginPath();c.ellipse(0,.4,t.type==='town'?9:t.type==='fort'?7.5:4.5,t.type==='village'?1.4:2.2,0,0,6.2832);c.fill();
  if(t.type==='village'){c.lineWidth=.22;const o=[[-1.8,-.5,0],[1.7,-1.2,1],[.1,.9,2]];for(const [dx,dy,i] of o)house(c,dx,dy,2.1,1.5,ROOFS[(i+((t.r*4)|0))%4])}
  else if(t.type==='town'){c.lineWidth=.38;c.beginPath();c.ellipse(0,-1.6,8,5.2,0,0,6.2832);c.fillStyle='rgba(234,220,188,.75)';c.fill();c.stroke();
    c.lineWidth=.25;const hs=[[-4.2,-2.6],[-1.6,-3.6],[2.4,-3.2],[4.6,-1.6],[-4.8,.4],[-2,.9],[1.4,.6],[4.2,1.4],[-.6,2.6]];
    hs.forEach(([dx,dy],i)=>{if(dx>-.9&&dx<1.2&&dy<-1)return;house(c,dx,dy,2.2,1.6,ROOFS[(i+((t.r*4)|0))%4])});
    c.lineWidth=.3;c.beginPath();c.rect(-1,-9.2,2,7.4);c.fillStyle='#dccfb3';c.fill();c.stroke();c.beginPath();c.moveTo(-1.3,-9.2);c.lineTo(0,-12.4);c.lineTo(1.3,-9.2);c.closePath();c.fillStyle='#55657d';c.fill();c.stroke();
    for(let a=0;a<6;a++){const an=a/6*6.2832+.4;c.beginPath();c.arc(Math.cos(an)*8,-1.6+Math.sin(an)*5.2,.8,0,6.2832);c.fillStyle='#dccfb3';c.fill();c.stroke()}}
  else if(t.type==='fort'){c.lineWidth=.4;const s=5.2;c.beginPath();c.moveTo(0,-2-s*.8);c.lineTo(s*1.25,-2);c.lineTo(0,-2+s*.55);c.lineTo(-s*1.25,-2);c.closePath();c.fillStyle='#b9ab90';c.fill();c.stroke();
    for(const [dx,dy] of [[0,-s*.8],[s*1.25,0],[0,s*.55],[-s*1.25,0]]){c.beginPath();c.arc(dx,-2+dy,1.15,0,6.2832);c.fillStyle='#d6c9ad';c.fill();c.stroke()}
    c.beginPath();c.rect(-1.6,-6.6,3.2,4.2);c.fillStyle='#cfc1a5';c.fill();c.stroke()}
  if(flag){const top=t.type==='town'?-12.4:t.type==='fort'?-6.6:-3.4,h=t.type==='village'?4.2:4.8;c.lineWidth=.35;c.beginPath();c.moveTo(0,top);c.lineTo(0,top-h);c.stroke();
    c.beginPath();c.moveTo(0,top-h);c.lineTo(3.2,top-h+.8);c.lineTo(0,top-h+1.8);c.closePath();c.fillStyle=flag;c.fill();c.stroke()}
}
function drawCastle(c,x,y,roof,main){c.lineJoin='round';c.lineWidth=.45;c.strokeStyle=INK;const st='#e0d4ba',sd='#b9a98b';
  c.fillStyle='rgba(40,28,16,.3)';c.beginPath();c.ellipse(x,y+.6,12.5,2.8,0,0,6.2832);c.fill();
  c.beginPath();c.rect(x-3.3,y-14,6.6,9.5);c.fillStyle=st;c.fill();c.fillStyle=sd;c.fillRect(x+.8,y-13.8,2.3,9.2);c.stroke();
  c.fillStyle=INK;c.fillRect(x-1.7,y-11.6,.8,1.6);c.fillRect(x+.9,y-11.6,.8,1.6);
  c.beginPath();c.moveTo(x-4.3,y-14);c.lineTo(x,y-20.6);c.lineTo(x+4.3,y-14);c.closePath();c.fillStyle=roof;c.fill();c.stroke();
  c.beginPath();c.moveTo(x,y-20.6);c.lineTo(x,y-25.6);c.stroke();c.beginPath();c.moveTo(x,y-25.6);c.lineTo(x+4.8,y-24.4);c.lineTo(x,y-23.2);c.closePath();c.fillStyle=roof;c.fill();c.stroke();
  c.beginPath();c.rect(x-8,y-6,16,6);c.fillStyle=st;c.fill();c.stroke();
  for(let i=0;i<7;i++){c.beginPath();c.rect(x-7.6+i*2.3,y-7.1,1.2,1.1);c.fillStyle=st;c.fill();c.stroke()}
  for(const tx of [-8.6,8.6]){c.beginPath();c.rect(x+tx-2.1,y-11,4.2,11);c.fillStyle=st;c.fill();c.stroke();
    c.beginPath();c.moveTo(x+tx-2.8,y-11);c.lineTo(x+tx,y-16.4);c.lineTo(x+tx+2.8,y-11);c.closePath();c.fillStyle=roof;c.fill();c.stroke();
    c.fillStyle=INK;c.fillRect(x+tx-.4,y-8.6,.8,1.6)}
  c.fillStyle=INK;c.beginPath();c.moveTo(x-1.7,y);c.lineTo(x-1.7,y-2.6);c.arc(x,y-2.6,1.7,Math.PI,0);c.lineTo(x+1.7,y);c.closePath();c.fill();
  if(main){c.fillStyle=GOLD;c.strokeStyle=INK;c.lineWidth=.4;c.beginPath();c.moveTo(x-3,y-27.2);c.lineTo(x-3,y-29.8);c.lineTo(x-1.5,y-28.4);c.lineTo(x,y-30.4);c.lineTo(x+1.5,y-28.4);c.lineTo(x+3,y-29.8);c.lineTo(x+3,y-27.2);c.closePath();c.fill();c.stroke()}
}
function strokeRun(c,p,w,extra,color){const n=w.length;c.strokeStyle=color;let cur=-1;
  for(let i=0;i<n-1;i++){const ww=Math.round(((w[i]+w[i+1])*.5+extra)*4)/4;
    if(ww!==cur){if(cur>0)c.stroke();c.beginPath();c.lineWidth=ww;c.moveTo(p[2*i],p[2*i+1]);cur=ww}c.lineTo(p[2*i+2],p[2*i+3])}
  if(cur>0)c.stroke()}
function drawVectors(c,x0,y0,x1,y1){
  c.lineCap='round';c.lineJoin='round';
  const vis=bb=>!(bb[2]<x0-10||bb[0]>x1+10||bb[3]<y0-10||bb[1]>y1+10);
  for(const rv of rivers)if(vis(rv.bb))strokeRun(c,rv.p,rv.w,.75,'#2c536b');
  for(const rv of rivers)if(vis(rv.bb))strokeRun(c,rv.p,rv.w,0,'#5d9ec2');
  for(const g of glyphs){if(g.x<x0-30||g.x>x1+30||g.y<y0-8||g.y>y1+40)continue;GLYPH[g.t](c,g)}
  drawDecor(c,x0,y0,x1,y1,false);
  for(const rd of roads){if(!vis(rd.bb))continue;c.beginPath();const p=rd.p;c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);c.strokeStyle='rgba(246,234,204,.6)';c.lineWidth=rd.major?2.3:1.6;c.stroke()}
  for(const rd of roads){if(!vis(rd.bb))continue;c.beginPath();const p=rd.p;c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);c.strokeStyle='#6a4a2c';c.lineWidth=rd.major?1:.6;
    if(!rd.major)c.setLineDash([2.2,1.4]);c.stroke();c.setLineDash([])}
}
function drawRose(c,d){const x=d.x,y=d.y,r=d.s;c.save();c.translate(x,y);c.lineJoin='round';
  c.beginPath();c.arc(0,0,r,0,6.2832);c.fillStyle='rgba(244,232,204,.55)';c.fill();c.lineWidth=r*.025;c.strokeStyle=INK;c.stroke();
  c.beginPath();c.arc(0,0,r*.86,0,6.2832);c.lineWidth=r*.012;c.stroke();
  for(let i=0;i<32;i++){const a=i/32*6.2832,l=i%4===0?.1:.05;c.beginPath();c.moveTo(Math.cos(a)*r*.86,Math.sin(a)*r*.86);c.lineTo(Math.cos(a)*r*(.86+l*.6),Math.sin(a)*r*(.86+l*.6));c.stroke()}
  const point=(a,len,w,lt,dk)=>{const ex=Math.cos(a)*len,ey=Math.sin(a)*len,lx=Math.cos(a-Math.PI/2)*w,ly=Math.sin(a-Math.PI/2)*w;
    c.beginPath();c.moveTo(0,0);c.lineTo(ex,ey);c.lineTo(lx,ly);c.closePath();c.fillStyle=lt;c.fill();
    c.beginPath();c.moveTo(0,0);c.lineTo(ex,ey);c.lineTo(-lx,-ly);c.closePath();c.fillStyle=dk;c.fill();
    c.beginPath();c.moveTo(lx,ly);c.lineTo(ex,ey);c.lineTo(-lx,-ly);c.lineWidth=r*.018;c.strokeStyle=INK;c.stroke()};
  for(let i=0;i<4;i++)point(Math.PI/4+i*Math.PI/2,r*.55,r*.09,'#efe2c4','#9c8667');
  for(let i=0;i<4;i++){const a=-Math.PI/2+i*Math.PI/2;point(a,r*.95,r*.13,i===0?'#e9c25a':'#f4ead2',i===0?'#a8781f':'#5b4a36')}
  c.beginPath();c.arc(0,0,r*.07,0,6.2832);c.fillStyle=GOLD;c.fill();c.lineWidth=r*.018;c.stroke();
  c.beginPath();c.moveTo(0,-r*1.02);c.lineTo(-r*.06,-r*1.14);c.lineTo(0,-r*1.26);c.lineTo(r*.06,-r*1.14);c.closePath();c.fillStyle='#e9c25a';c.fill();c.stroke();c.restore()}
function waves(c,x,y,w){c.beginPath();for(let i=0;i<3;i++){const ox=x-w+i*w*.75,oy=y+(i%2)*1.2;c.moveTo(ox,oy);c.quadraticCurveTo(ox+w*.18,oy-1.4,ox+w*.36,oy);c.quadraticCurveTo(ox+w*.54,oy+1.4,ox+w*.72,oy)}c.lineWidth=.55;c.strokeStyle='rgba(30,60,85,.75)';c.stroke()}
function drawWhale(c,d){const s=d.s;c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);c.lineJoin='round';c.lineCap='round';c.strokeStyle=INK;c.lineWidth=s*.035;
  c.beginPath();c.moveTo(-s,0);c.bezierCurveTo(-s*.95,-s*.55,s*.2,-s*.62,s*.62,-s*.12);c.quadraticCurveTo(s*.75,0,s*.95,-s*.32);c.lineTo(s*1.12,-s*.48);c.quadraticCurveTo(s*1.05,-s*.18,s*1.2,-s*.05);c.quadraticCurveTo(s*.95,-s*.05,s*.82,.02);c.quadraticCurveTo(s*.2,s*.18,-s,0);c.closePath();
  c.fillStyle='#5d7f97';c.fill();c.stroke();
  c.beginPath();c.moveTo(-s*.98,s*.02);c.quadraticCurveTo(-s*.4,s*.12,s*.3,s*.05);c.quadraticCurveTo(-s*.3,-s*.12,-s*.98,s*.02);c.fillStyle='#d9d2bf';c.fill();
  for(let i=0;i<3;i++){c.beginPath();c.moveTo(-s*.8+i*s*.15,s*.06);c.lineTo(-s*.75+i*s*.15,-s*.02);c.lineWidth=s*.02;c.stroke()}
  c.beginPath();c.arc(-s*.68,-s*.12,s*.05,0,6.2832);c.fillStyle=INK;c.fill();
  c.lineWidth=s*.03;c.strokeStyle='rgba(235,245,250,.95)';c.beginPath();c.moveTo(-s*.45,-s*.48);c.quadraticCurveTo(-s*.5,-s*.85,-s*.75,-s*.95);c.moveTo(-s*.45,-s*.48);c.quadraticCurveTo(-s*.38,-s*.88,-s*.15,-s*.98);c.moveTo(-s*.45,-s*.48);c.lineTo(-s*.44,-s*.98);c.stroke();
  waves(c,0,s*.18,s*.9);c.restore()}
function drawSerpent(c,d){const s=d.s;c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);c.lineJoin='round';c.lineCap='round';
  const hump=(x0,w,h)=>{c.beginPath();c.moveTo(x0,0);c.bezierCurveTo(x0+w*.1,-h,x0+w*.9,-h,x0+w,0);c.lineTo(x0+w*.78,0);c.bezierCurveTo(x0+w*.7,-h*.62,x0+w*.3,-h*.62,x0+w*.22,0);c.closePath();c.fillStyle='#4f8a6e';c.fill();c.lineWidth=s*.035;c.strokeStyle=INK;c.stroke();
    for(let i=1;i<4;i++){const t=i/4,px=x0+w*t,py=-h*(1-Math.pow(2*t-1,2))*.95;c.beginPath();c.moveTo(px,py);c.lineTo(px+s*.04,py-s*.12);c.lineTo(px+s*.08,py);c.fillStyle='#c0503a';c.fill()}};
  hump(-s*1.1,s*.55,s*.55);hump(-s*.4,s*.6,s*.62);
  c.beginPath();c.moveTo(s*.35,0);c.bezierCurveTo(s*.35,-s*.7,s*.55,-s*.95,s*.85,-s*.82);c.quadraticCurveTo(s*1.1,-s*.75,s*1.12,-s*.6);c.quadraticCurveTo(s*.9,-s*.58,s*.72,-s*.62);c.bezierCurveTo(s*.6,-s*.45,s*.58,-s*.2,s*.58,0);c.closePath();
  c.fillStyle='#4f8a6e';c.fill();c.lineWidth=s*.035;c.strokeStyle=INK;c.stroke();
  c.beginPath();c.moveTo(s*.64,-s*.84);c.lineTo(s*.56,-s*1.03);c.lineTo(s*.78,-s*.88);c.fillStyle='#c0503a';c.fill();c.stroke();
  c.beginPath();c.arc(s*.88,-s*.74,s*.045,0,6.2832);c.fillStyle='#f3d36a';c.fill();
  waves(c,-s*.2,s*.08,s*1.1);c.restore()}
function drawWave(c,d){const s=d.s;c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);c.lineCap='round';c.lineJoin='round';
  const path=()=>{c.beginPath();c.moveTo(-s*1.6,s*.25);c.quadraticCurveTo(-s*.7,-s*.05,-s*.15,-s*.55);c.quadraticCurveTo(s*.2,-s*.95,s*.55,-s*.7);c.quadraticCurveTo(s*.75,-s*.45,s*.45,-s*.3);c.quadraticCurveTo(s*.2,-s*.25,s*.25,-s*.05);c.quadraticCurveTo(s*.6,s*.25,s*1.5,s*.2)};
  path();c.lineWidth=s*.34;c.strokeStyle='rgba(28,62,88,.55)';c.stroke();path();c.lineWidth=s*.16;c.strokeStyle='rgba(232,244,246,.85)';c.stroke();
  c.beginPath();c.moveTo(-s*1.1,s*.62);c.quadraticCurveTo(-s*.3,s*.45,s*.4,s*.6);c.lineWidth=s*.1;c.strokeStyle='rgba(28,62,88,.45)';c.stroke();c.restore()}
function drawWhirl(c,d){const s=d.s;c.save();c.translate(d.x,d.y);c.rotate(d.r*6.28);c.lineCap='round';
  const sp=()=>{c.beginPath();for(let t=0;t<=4.5*Math.PI;t+=.15){const r=s*(1-t/(4.8*Math.PI)),x=Math.cos(t)*r,y=Math.sin(t)*r*.62;if(t===0)c.moveTo(x,y);else c.lineTo(x,y)}};
  sp();c.lineWidth=s*.22;c.strokeStyle='rgba(20,48,72,.6)';c.stroke();sp();c.lineWidth=s*.09;c.strokeStyle='rgba(225,240,244,.9)';c.stroke();
  c.beginPath();c.ellipse(0,0,s*.16,s*.1,0,0,6.2832);c.fillStyle='rgba(15,35,55,.85)';c.fill();c.restore()}
function drawReef(c,d){const s=d.s;c.save();c.translate(d.x,d.y);c.lineJoin='round';
  const pts=[[0,0,1],[-1.3,.5,.7],[1.2,.4,.75],[.3,-.9,.6],[-.6,1.1,.5],[1.6,-.6,.45]];
  {const g=c.createRadialGradient(0,0,s*.3,0,0,s*2.4);g.addColorStop(0,'rgba(200,232,230,.75)');g.addColorStop(1,'rgba(200,232,230,0)');c.fillStyle=g;c.beginPath();c.ellipse(0,.2,s*2.6,s*1.7,0,0,6.2832);c.fill();
  c.fillStyle='rgba(245,252,250,.9)';for(let i=0;i<7;i++){const a=i*.9+d.r*6,rr=s*(1.5+(i%3)*.25);c.beginPath();c.arc(Math.cos(a)*rr,Math.sin(a)*rr*.6+.2,s*.09,0,6.2832);c.fill()}}
  pts.forEach(([dx,dy,k],i)=>{const x=dx*s,y=dy*s,r=s*.55*k;c.beginPath();c.moveTo(x-r,y);c.lineTo(x-r*.5,y-r*.85);c.lineTo(x+r*.4,y-r*.95);c.lineTo(x+r,y-r*.1);c.lineTo(x+r*.5,y+r*.6);c.lineTo(x-r*.6,y+r*.55);c.closePath();
    c.fillStyle=i%3===2?'#c87a6a':'#8f8678';c.fill();c.lineWidth=Math.max(.25,s*.06);c.strokeStyle=INK;c.stroke()});
  c.restore()}
function drawDecor(c,x0,y0,x1,y1,flat){for(const d of decor){if(d.x<x0-120||d.x>x1+120||d.y<y0-120||d.y>y1+120)continue;
  if(d.t==='rose')drawRose(c,d);else if(!flat){if(d.t==='whale')drawWhale(c,d);else if(d.t==='serpent')drawSerpent(c,d);else if(d.t==='wave')drawWave(c,d);else if(d.t==='whirl')drawWhirl(c,d);else if(d.t==='reef')drawReef(c,d)}}}
function drawFlatVectors(c,x0,y0,x1,y1){
  c.lineCap='round';c.lineJoin='round';const vis=bb=>!(bb[2]<x0-10||bb[0]>x1+10||bb[3]<y0-10||bb[1]>y1+10);
  for(const rv of rivers)if(vis(rv.bb))strokeRun(c,rv.p,rv.w.map(v=>v*.6),0,'rgba(90,130,150,.55)');
  drawDecor(c,x0,y0,x1,y1,true);
}
async function renderRegion(cnv,x0,y0,rw,rh,scale,job,progress,flat){
  const pw=Math.max(1,Math.round(rw*scale)),ph=Math.max(1,Math.round(rh*scale));
  cnv.width=pw;cnv.height=ph;const c=cnv.getContext('2d');const img=c.createImageData(pw,ph);
  const step=Math.max(4,Math.floor(220000/pw));
  for(let r=0;r<ph;r+=step){shadeRows(img.data,pw,x0,y0,scale,r,Math.min(ph,r+step),flat);
    if(job){await yieldT();if(job.cancel)return null}else if(progress)await progress(r/ph)}
  c.putImageData(img,0,0);c.setTransform(scale,0,0,scale,-x0*scale,-y0*scale);
  if(flat)drawFlatVectors(c,x0,y0,x0+pw/scale,y0+ph/scale);else drawVectors(c,x0,y0,x0+pw/scale,y0+ph/scale);
  return {pw,ph};
}

/* ---------------- contours ---------------- */
function contourPath(pred,bx0,by0,bx1,by1,path){
  bx0=Math.max(0,bx0-2);by0=Math.max(0,by0-2);bx1=Math.min(FW-1,bx1+2);by1=Math.min(FH-1,by1+2);
  const w=bx1-bx0+1,h=by1-by0+1,m=new Float32Array(w*h),t=new Float32Array(w*h),b=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)m[j*w+i]=pred((by0+j)*FW+bx0+i)?1:0;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const o=j*w+i;t[o]=(m[o-(i>0?1:0)]+m[o]+m[o+(i<w-1?1:0)])/3}
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const o=j*w+i;b[o]=(t[o-(j>0?w:0)]+t[o]+t[o+(j<h-1?w:0)])/3}
  path=path||new Path2D();
  const X=i=>(bx0+i+.5)*CS,Y=j=>(by0+j+.5)*CS;
  for(let j=0;j<h-1;j++)for(let i=0;i<w-1;i++){
    const a=b[j*w+i],bb=b[j*w+i+1],c=b[(j+1)*w+i+1],d=b[(j+1)*w+i];
    const idx=(a>.5?8:0)|(bb>.5?4:0)|(c>.5?2:0)|(d>.5?1:0);if(idx===0||idx===15)continue;
    const T_=()=>[X(i)+CS*(.5-a)/(bb-a),Y(j)],R=()=>[X(i+1),Y(j)+CS*(.5-bb)/(c-bb)],B=()=>[X(i)+CS*(.5-d)/(c-d),Y(j+1)],Lf=()=>[X(i),Y(j)+CS*(.5-a)/(d-a)];
    const seg=(p,q)=>{path.moveTo(p[0],p[1]);path.lineTo(q[0],q[1])};const ctr=(a+bb+c+d)/4>.5;
    switch(idx){case 1:case 14:seg(Lf(),B());break;case 2:case 13:seg(B(),R());break;case 3:case 12:seg(Lf(),R());break;
      case 4:case 11:seg(T_(),R());break;case 6:case 9:seg(T_(),B());break;case 7:case 8:seg(T_(),Lf());break;
      case 5:if(ctr){seg(T_(),Lf());seg(B(),R())}else{seg(T_(),R());seg(Lf(),B())}break;
      case 10:if(ctr){seg(T_(),R());seg(Lf(),B())}else{seg(T_(),Lf());seg(B(),R())}break}
  }
  return path;
}
