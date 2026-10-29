/* =====================================================================
   GAME: world document, storage (.md), economy, quests, goals, armies
   ===================================================================== */
const PLAYER=999;
let CFG=null;               // parsed config.yaml
let WD=null;                // current world document
let CH={skills:[]};         // character (shared across maps)
let owner=null;             // Int16Array(P): -1 terra incognita, PLAYER, or realm index
let extraSett=[];           // settlements founded after generation

const now=()=>Date.now()+(WD?WD.timeOffset||0:0);
const diffs=()=>CFG.quests.difficulties;
const diffOf=i=>diffs()[clamp(i,1,diffs().length)-1];

/* ---------------- storage ---------------- */
const Store={mode:'local',
  async init(){try{const r=await fetch('api/ping',{cache:'no-store'});if(r.ok){const j=await r.json();if(j&&j.ok)this.mode='server'}}catch(e){}},
  async configText(){if(this.mode==='server'){try{const r=await fetch('api/config',{cache:'no-store'});if(r.ok)return await r.text()}catch(e){}}return DEFAULT_CONFIG},
  lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}},lsSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}},
  async listMaps(){if(this.mode==='server'){const r=await fetch('api/maps',{cache:'no-store'});return r.ok?await r.json():[]}
    const o=JSON.parse(this.lsGet('tc-maps')||'{}');return Object.keys(o).map(n=>({name:n,updated:o[n].t})).sort((a,b)=>b.updated-a.updated)},
  async loadMap(name){if(this.mode==='server'){const r=await fetch('api/maps/'+encodeURIComponent(name),{cache:'no-store'});return r.ok?await r.text():null}
    const o=JSON.parse(this.lsGet('tc-maps')||'{}');return o[name]?o[name].md:null},
  async saveMap(name,md){if(this.mode==='server'){const r=await fetch('api/maps/'+encodeURIComponent(name),{method:'PUT',body:md});if(!r.ok)throw new Error('save failed');return (await r.json()).path}
    const o=JSON.parse(this.lsGet('tc-maps')||'{}');o[name]={md,t:Date.now()};if(!this.lsSet('tc-maps',JSON.stringify(o)))throw new Error('browser storage is full or blocked');return 'browser storage'},
  async loadChar(){if(this.mode==='server'){try{const r=await fetch('api/character',{cache:'no-store'});return r.ok?await r.text():null}catch(e){return null}}return this.lsGet('tc-character')},
  async saveChar(md){if(this.mode==='server'){await fetch('api/character',{method:'PUT',body:md});return}this.lsSet('tc-character',md)},
  lastMap(){return this.lsGet('tc-last-map')},setLastMap(n){this.lsSet('tc-last-map',n)}};

/* ---------------- character ---------------- */
function charToMd(){return ['This file follows the Task & Conquer character format v1: each "- Name: number" line under "## Skills" is one skill and its level, and every map shares these skills.','','# Character','','## Skills',...CH.skills.map(s=>`- ${s.name}: ${s.value|0}`),''].join('\n')}
function mdToChar(md){const skills=[];let inS=false;for(const l of md.split(/\r?\n/)){if(/^##\s+Skills/i.test(l)){inS=true;continue}if(/^#/.test(l))inS=false;
  const m=inS&&l.match(/^-\s+(.+?):\s*(-?\d+)\s*$/);if(m&&!skills.some(s=>s.name.toLowerCase()===m[1].trim().toLowerCase()))skills.push({name:m[1].trim(),value:+m[2]})}return{skills}}
function skillIdx(name){return CH.skills.findIndex(s=>s.name.toLowerCase()===String(name).toLowerCase())}
function ensureSkill(name){const n=String(name).trim();if(!n)return;if(skillIdx(n)<0)CH.skills.push({name:n,value:0})}
let charSaveTimer=0;function saveCharSoon(){clearTimeout(charSaveTimer);charSaveTimer=setTimeout(()=>Store.saveChar(charToMd()).catch(()=>{}),800)}

/* ---------------- world <-> markdown ---------------- */
const MD_HEAD='This file follows the Task & Conquer world format v1: "## Realm:" headings are realms and the line under each names its rival, "### Goal:" headings are goals inside the realm above, checklist lines ("- [ ]" open, "- [x]" done) are quests with optional " | key: value" attributes (due, difficulty, skills, status: in progress, done, id), indented "- [ ]" lines are subquests, indented "> " lines are quest notes, and the JSON block under "## World state" is managed by the app.';
const ATTR_KEYS=new Set(['due','difficulty','skills','done','id','status']);
function splitAttrs(s){const parts=s.split(' | ');const title=[],a={};for(const p of parts){const m=p.match(/^([a-z]+):\s*(.*)$/i);if(m&&ATTR_KEYS.has(m[1].toLowerCase())&&title.length)a[m[1].toLowerCase()]=m[2].trim();else title.push(p)}return{title:title.join(' | ').trim(),a}}
function taskLines(t){const L=[];let s=`- [${t.status==='done'?'x':' '}] ${t.title}`;
  if(t.deadline)s+=` | due: ${t.deadline}`;s+=` | difficulty: ${diffOf(t.diff).name}`;if(t.skills.length)s+=` | skills: ${t.skills.join(', ')}`;
  if(t.status==='progress')s+=' | status: in progress';if(t.status==='done'&&t.doneAt)s+=` | done: ${dateStr(t.doneAt)}`;s+=` | id: ${t.id}`;L.push(s);
  for(const line of (t.desc||'').split('\n'))if(line.trim())L.push('  > '+line);
  for(const sb of t.subs)L.push(`  - [${sb.d?'x':' '}] ${sb.t}`);return L}
function worldToMd(){
  const L=[MD_HEAD,'',`# ${WD.name}`,'',`Kingdom: ${WD.kingdom}`,`Seat: ${settName(WD.home)}`];
  for(const r of WD.realms){L.push('',`## Realm: ${r.name} | id: ${r.id}`,`Rival: ${r.rival.name}`,'');
    for(const t of WD.tasks.filter(t=>t.realm===r.id&&!t.goal))L.push(...taskLines(t));
    for(const g of WD.goals.filter(g=>g.realm===r.id)){let h=`### Goal: ${g.name}`;if(g.deadline)h+=` | due: ${g.deadline}`;if(g.skills.length)h+=` | skills: ${g.skills.join(', ')}`;h+=` | status: ${g.status}`;h+=` | id: ${g.id}`;
      L.push('',h);for(const t of WD.tasks.filter(t=>t.goal===g.id))L.push(...taskLines(t))}}
  const st={v:1,seed:WD.seed,provinces:WD.provinces,genRealms:WD.genRealms,home:WD.home,preExample:WD.preExample||null,gold:Math.round(WD.gold*100)/100,goldAt:WD.goldAt,timeOffset:WD.timeOffset||0,
    owner:Array.from(owner,o=>o===PLAYER?'P':o>=0?WD.realms[o].id:''),annex:WD.annex,names:WD.names,stypes:WD.stypes,extra:extraSett.map(s=>({id:s.id,type:s.type,x:s.x,y:s.y,prov:s.prov,name:s.name})),
    armies:WD.armies,notifs:WD.notifs.slice(0,200),rankW:WD.rankW,rankP:WD.rankP,
    rivals:Object.fromEntries(WD.realms.map(r=>[r.id,{color:r.rival.color,capital:r.rival.capital,pattern:r.rival.pattern}])),
    quests:Object.fromEntries(WD.tasks.map(t=>[t.id,{x:+t.x.toFixed(1),y:+t.y.toFixed(1),prov:t.prov,created:t.created,doneAt:t.doneAt,status:t.status,on:t.overdueNotified?1:0,looted:t.looted?1:0,ex:t.example?1:0}])),
    goals:Object.fromEntries(WD.goals.map(g=>[g.id,{created:g.created,lastActivity:g.lastActivity,doneAt:g.doneAt,dc:g.deadlineCampaign?1:0,ex:g.example?1:0}]))};
  L.push('','## World state','','```json',JSON.stringify(st),'```','');return L.join('\n');
}
function mdToWorld(md){
  const lines=md.split(/\r?\n/);let st={};
  const si=lines.findIndex(l=>/^##\s+World state/i.test(l));
  if(si>=0){const txt=lines.slice(si).join('\n');const m=txt.match(/```json\s*([\s\S]*?)```/);if(m){try{st=JSON.parse(m[1])}catch(e){st={}}}}
  const w={name:'',kingdom:'',realms:[],goals:[],tasks:[]};let realm=null,goal=null,task=null;
  const realmFor=()=>{if(!realm){realm={id:'r-general',name:'General',rivalName:''};w.realms.push(realm)}return realm};
  const end=si>=0?si:lines.length;
  for(let i=0;i<end;i++){const l=lines[i];let m;
    if((m=l.match(/^#\s+(.+)/))&&!l.startsWith('##')){w.name=m[1].trim();continue}
    if((m=l.match(/^Kingdom:\s*(.+)/))){w.kingdom=m[1].trim();continue}
    if((m=l.match(/^##\s+Realm:\s*(.+)/i))){const {title,a}=splitAttrs(m[1]);realm={id:a.id||'',name:title,rivalName:''};w.realms.push(realm);goal=null;task=null;continue}
    if((m=l.match(/^Rival:\s*(.+)/))&&realm){realm.rivalName=m[1].trim();continue}
    if((m=l.match(/^###\s+Goal:\s*(.+)/i))){const {title,a}=splitAttrs(m[1]);goal={id:a.id||'',name:title,realm:realmFor().id,_realm:realmFor(),deadline:/^\d{4}-\d\d-\d\d$/.test(a.due||'')?a.due:null,skills:a.skills?a.skills.split(',').map(s=>s.trim()).filter(Boolean):[],status:a.status==='done'?'done':'open'};w.goals.push(goal);task=null;continue}
    if((m=l.match(/^- \[( |x|X)\]\s+(.*)/))){const {title,a}=splitAttrs(m[2]);const di=diffs().findIndex(d=>d.name.toLowerCase()===(a.difficulty||'').toLowerCase());
      task={id:a.id||'',title,_realm:realmFor(),_goal:goal,deadline:/^\d{4}-\d\d-\d\d$/.test(a.due||'')?a.due:null,diff:di>=0?di+1:2,skills:a.skills?a.skills.split(',').map(s=>s.trim()).filter(Boolean):[],checked:m[1]!==' ',progress:/^in.?prog/i.test(a.status||''),doneDate:a.done||null,desc:[],subs:[]};w.tasks.push(task);continue}
    if((m=l.match(/^\s{2,}- \[( |x|X)\]\s+(.*)/))&&task){task.subs.push({t:m[2].trim(),d:m[1]!==' '});continue}
    if((m=l.match(/^\s{2,}>\s?(.*)/))&&task){task.desc.push(m[1]);continue}
  }
  return {w,st};
}
const slug=s=>String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24)||'x';
function uniqueId(base,set){let id=base,i=2;while(set.has(id))id=base+'-'+(i++);set.add(id);return id}

/* ---------------- settlements & owners ---------------- */
function allSett(){return extraSett.length?settlements.concat(extraSett):settlements}
function settById(id){return id<settlements.length?settlements[id]:extraSett.find(s=>s.id===id)}
function settType(s){return (WD&&WD.stypes&&WD.stypes[s.id])||s.type}
function settName(id){const s=settById(id);if(!s)return '';return (WD&&WD.names&&WD.names[id])||s.name}
function settOwner(s){return owner?owner[s.prov]:-1}
function settInProv(p){if(psett[p]>=0)return psett[p];const e=extraSett.find(s=>s.prov===p);return e?e.id:-1}
function homeProv(){return settById(WD.home).prov}
function isCapitalProv(p){const sid=settInProv(p);if(sid<0)return -1;return WD.realms.findIndex(r=>r.rival.capital===sid)}
function rivalCount(ri){let n=0;for(let p=0;p<P;p++)if(owner[p]===ri)n++;return n}
function playerCount(){let n=0;for(let p=0;p<P;p++)if(owner[p]===PLAYER)n++;return n}
function colorOf(o){return o===PLAYER?GOLD:o>=0&&WD.realms[o]?WD.realms[o].rival.color:'#888'}
function ownerName(o){return o===PLAYER?WD.kingdom:o>=0&&WD.realms[o]?WD.realms[o].rival.name:'Terra incognita'}
function realmIdx(id){return WD.realms.findIndex(r=>r.id===id)}

function rivalNameFor(realmName,pattern){const pats=CFG.rivals.name_patterns;return pats[pattern%pats.length].replace('{realm}',realmName)}
function makeRival(realmName,usedColors){const pats=CFG.rivals.name_patterns,cols=CFG.rivals.colors;const pattern=Math.floor(Math.random()*pats.length);
  const color=cols.find(c=>!usedColors.includes(c))||cols[Math.floor(Math.random()*cols.length)];usedColors.push(color);
  return{name:rivalNameFor(realmName,pattern),pattern,color,capital:null}}

/* starting layout: player land, rival capitals and territories, terra incognita */
function layoutRivals(){
  owner=new Int16Array(P).fill(-1);
  const hp=homeProv();owner[hp]=PLAYER;let ring=[hp];
  for(let r=0;r<(CFG.map.starting_ring|0);r++){const nx=[];for(const p of ring)for(const q of nbr[p])if(owner[q]!==PLAYER){owner[q]=PLAYER;nx.push(q)}ring=nx}
  WD.annex=[];for(let p=0;p<P;p++)if(owner[p]===PLAYER)WD.annex.push(p);
  const home=settById(WD.home),R=WD.realms.length;
  // province hops from the player's land
  const hop=new Int16Array(P).fill(-1),bq=[];for(let p=0;p<P;p++)if(owner[p]===PLAYER){hop[p]=0;bq.push(p)}
  for(let i=0;i<bq.length;i++){const p=bq[i];for(const q of nbr[p])if(hop[q]<0){hop[q]=hop[p]+1;bq.push(q)}}
  // capitals: a few provinces out, spread around your realm in different directions
  const pool=(lo,hi)=>allSett().filter(s=>s.id!==WD.home&&owner[s.prov]!==PLAYER&&hop[s.prov]>=lo&&hop[s.prov]<=hi&&nbr[s.prov].length>=2);
  let cand=pool(2,5);if(cand.length<R)cand=pool(2,9);if(cand.length<R)cand=pool(1,99);
  const ang=s=>Math.atan2(s.y-home.y,s.x-home.x);const capitals=[];
  for(const r of WD.realms){let best=null,bs=-Infinity;
    for(const s of cand){if(capitals.includes(s))continue;let gap=Math.PI;for(const c of capitals){let d=Math.abs(ang(s)-ang(c));if(d>Math.PI)d=2*Math.PI-d;gap=Math.min(gap,d)}
      const sc=gap+(settType(s)==='castle'?.45:0)-Math.abs(hop[s.prov]-3)*.12;if(sc>bs){bs=sc;best=s}}
    if(best){capitals.push(best);r.rival.capital=best.id;if(settType(best)!=='castle')WD.stypes[best.id]='castle';owner[best.prov]=WD.realms.indexOf(r)}else r.rival.capital=null}
  // quotas proportional to 1 + goals
  const total=Math.max(0,Math.min(Math.floor(P*(+CFG.rivals.start_share||.45)),P-WD.annex.length-Math.ceil(P*(+CFG.rivals.terra_incognita_min||.3))));
  const wts=WD.realms.map(r=>(+CFG.rivals.base_weight||1)+WD.goals.filter(g=>g.realm===r.id).length);const ws=wts.reduce((a,b)=>a+b,0)||1;
  const quota=wts.map(w=>Math.max(1,Math.floor(total*w/ws)));const have=WD.realms.map(r=>r.rival.capital!=null?1:0);
  // every rival gets a corridor of land reaching your border, farthest capitals first
  WD.realms.map((r,ri)=>ri).filter(ri=>WD.realms[ri].rival.capital!=null).sort((a,b)=>hop[settById(WD.realms[b].rival.capital).prov]-hop[settById(WD.realms[a].rival.capital).prov]).forEach(ri=>{
    const start=settById(WD.realms[ri].rival.capital).prov;const prev=new Int32Array(P).fill(-2);prev[start]=-1;const q2=[start];let end=-1;
    for(let i=0;i<q2.length&&end<0;i++){const p=q2[i];if(hop[p]===1){end=p;break}for(const n of nbr[p])if(prev[n]===-2&&owner[n]===-1&&hop[n]>0&&hop[n]<hop[p]){prev[n]=p;q2.push(n)}}
    for(let p=end;p>=0;p=prev[p])if(owner[p]===-1){owner[p]=ri;have[ri]++}});
  // grow toward your border first, so rivals are your neighbours and terra incognita lies beyond them
  const hpq=new Heap(256);const enc=(ri,p)=>ri*100000+p;
  const key=(ri,q)=>{const c=settById(WD.realms[ri].rival.capital);return hop[q]*10000+Math.hypot(pcx[q]-c.x,pcy[q]-c.y)};
  WD.realms.forEach((r,ri)=>{if(r.rival.capital==null)return;hpq.push(0,enc(ri,settById(r.rival.capital).prov))});
  while(hpq.n){const v=hpq.pop(),ri=Math.floor(v/100000),p=v%100000;
    if(owner[p]!==ri&&owner[p]!==-1)continue;if(owner[p]===-1){if(have[ri]>=quota[ri])continue;owner[p]=ri;have[ri]++}
    for(const q of nbr[p])if(owner[q]===-1&&hop[q]>0)hpq.push(key(ri,q),enc(ri,q))}
  // no terra incognita directly on your border: give leftover border provinces to a neighbouring rival
  for(let pass=0;pass<6;pass++){let left=0;
    for(let p=0;p<P;p++){if(owner[p]!==-1||hop[p]!==1)continue;const rn=nbr[p].map(q=>owner[q]).filter(o=>o>=0&&o!==PLAYER);if(rn.length)owner[p]=rn[0];else left++}
    if(!left)break;
    for(let p=0;p<P;p++){if(owner[p]!==-1||hop[p]!==2)continue;if(!nbr[p].some(q=>owner[q]===-1&&hop[q]===1))continue;const rn=nbr[p].map(q=>owner[q]).filter(o=>o>=0&&o!==PLAYER);if(rn.length)owner[p]=rn[0]}}
  for(let p=0;p<P;p++){if(owner[p]!==-1||hop[p]!==1)continue;let best=-1,bd=Infinity;WD.realms.forEach((r,ri)=>{if(r.rival.capital==null)return;const c=settById(r.rival.capital);const d=Math.hypot(pcx[p]-c.x,pcy[p]-c.y);if(d<bd){bd=d;best=ri}});if(best>=0)owner[p]=best}
}
function applyOwnerCodes(codes){owner=new Int16Array(P).fill(-1);for(let p=0;p<P&&p<codes.length;p++){const c=codes[p];if(c==='P')owner[p]=PLAYER;else if(c){const ri=realmIdx(c);if(ri>=0)owner[p]=ri}}}

/* ---------------- notifications ---------------- */
function notify(kind,title,text,ref,popup){const n={id:uid('n'),t:now(),kind,title,text,ref:ref||null,read:false};WD.notifs.unshift(n);if(WD.notifs.length>300)WD.notifs.length=300;
  if(typeof uiNotify==='function')uiNotify(n,popup);return n}

/* ---------------- economy & ranks ---------------- */
function provRate(p){const g=CFG.gold;let r=+(g.province_per_day[ptype[p]]||0);if(pcoast[p])r+=+g.coastal_bonus_per_day||0;
  const sid=settInProv(p);if(sid>=0){const s=settById(sid);const key=sid===WD.home?'main_castle':settType(s);r+=+(g.settlement_per_day[key]||0)}return r}
function goldRate(){let r=0;for(let p=0;p<P;p++)if(owner[p]===PLAYER)r+=provRate(p);return r}
function accrue(to){if(to<=WD.goldAt)return;WD.gold+=goldRate()*(to-WD.goldAt)/DAY;WD.goldAt=to}
function rankIdx(list,v){let i=0;list.forEach((r,j)=>{if(v>=+r.at)i=j});return i}
function checkRanks(){const w=rankIdx(CFG.ranks.wealth,WD.gold),p=rankIdx(CFG.ranks.power,playerCount());
  if(WD.rankW==null)WD.rankW=w;if(WD.rankP==null)WD.rankP=p;
  if(w>WD.rankW)notify('rank','New wealth rank!',`${WD.kingdom} is now a ${CFG.ranks.wealth[w].name}.`,null,true);
  else if(w<WD.rankW)notify('rank','The treasury shrank',`${WD.kingdom} fell back to ${CFG.ranks.wealth[w].name}.`);
  if(p>WD.rankP)notify('rank','New power rank!',`${WD.kingdom} is now a ${CFG.ranks.power[p].name}.`,null,true);
  else if(p<WD.rankP)notify('rank','Your power waned',`${WD.kingdom} fell back to ${CFG.ranks.power[p].name}.`);
  WD.rankW=w;WD.rankP=p}

/* ---------------- quests ---------------- */
const STATUS_LABEL={open:'Planned',progress:'In progress',done:'Done'};
function taskStatus(t){return t.status==='done'?'done':t.status==='progress'?'progress':'open'}
function isOverdue(t){return t.status!=='done'&&!!t.deadline&&now()>deadlineEnd(t.deadline)}
function setTaskStatus(t,s){if(t.status===s||t.status==='done'||s==='done')return;t.status=s;notify('quest',s==='progress'?'Quest started':'Quest planned',`“${t.title}” is now ${STATUS_LABEL[s].toLowerCase()}.`,{task:t.id})}
function goalStatus(g){if(g.status==='done')return'done';if(g.deadline&&now()>deadlineEnd(g.deadline))return'overdue';return'open'}
function taskSkills(t){if(t.skills.length)return t.skills;const g=t.goal&&WD.goals.find(x=>x.id===t.goal);return g?g.skills:[]}
function hopsFromRealm(target){const d=new Int16Array(P).fill(-1);const q=[];for(let p=0;p<P;p++)if(owner[p]===PLAYER){d[p]=0;q.push(p)}
  for(let i=0;i<q.length;i++){const p=q[i];if(p===target)return d[p];for(const n of nbr[p])if(d[n]<0){d[n]=d[p]+1;q.push(n)}}return -1}
function raidCost(h){const r=CFG.raid;return Math.round((+r.base_cost||0)+(+r.cost_per_hop||0)*Math.pow(Math.max(1,h-1),+r.hop_exponent||1))}
// can a quest be planted in province p?
function plantCheck(p){
  if(p<0)return{ok:false,reason:'water',text:'Quests need solid ground.'};
  if(owner[p]===PLAYER)return{ok:true,cost:0,kind:'own'};
  const cap=isCapitalProv(p);if(cap>=0&&owner[p]===cap&&rivalCount(cap)>1)return{ok:false,reason:'capital',text:`This is the capital of ${WD.realms[cap].rival.name}. It can only be attacked once it is their last province.`};
  if(nbr[p].some(q=>owner[q]===PLAYER))return{ok:true,cost:0,kind:'border'};
  const h=hopsFromRealm(p);if(h<0)return{ok:false,reason:'unreachable',text:'No road leads there. Even a raiding party cannot reach it.'};
  if(h>(CFG.raid.max_hops|0||14))return{ok:false,reason:'far',text:'Too far for a raiding expedition.'};
  const cost=raidCost(h);return{ok:WD.gold>=cost,cost,kind:'raid',hops:h,reason:WD.gold>=cost?'':'gold',text:`Send a raiding expedition ${h} provinces past your border for ${cost} gold.`};
}
function autoPlace(){const hp=homeProv();let best=-1,bd=Infinity;
  for(let p=0;p<P;p++){if(owner[p]!==PLAYER)continue;for(const q of nbr[p]){if(owner[q]===PLAYER)continue;const c=plantCheck(q);if(!c.ok||c.cost)continue;const d=Math.hypot(pcx[q]-pcx[hp],pcy[q]-pcy[hp]);if(d<bd){bd=d;best=q}}}
  if(best<0)best=hp;return{x:panchor[best*2]+(Math.random()-.5)*6,y:panchor[best*2+1]+(Math.random()-.5)*6,prov:best}}
function newTask(f){return Object.assign({id:uid('q'),title:'',desc:'',realm:WD.realms[0]?WD.realms[0].id:'',goal:null,skills:[],diff:2,deadline:null,status:'open',created:now(),doneAt:null,x:0,y:0,prov:-1,subs:[],overdueNotified:false,looted:false,example:false},f)}

function conquer(p,silentTitle){const prev=owner[p];owner[p]=PLAYER;if(!WD.annex.includes(p))WD.annex.push(p);
  if(prev>=0&&prev!==PLAYER){const r=WD.realms[prev];if(rivalCount(prev)===0){notify('war',`${r.rival.name} has fallen!`,`You took their last province. Their capital is yours.`,null,true);r.rival.capital=null}}}
function annexFor(t){let n=diffOf(t.diff).lands|0;const got=[];
  if(t.prov>=0&&owner[t.prov]!==PLAYER){conquer(t.prov);got.push(t.prov);n--}
  while(n>0){let best=-1,bd=Infinity;
    for(let p=0;p<P;p++){if(owner[p]!==PLAYER)continue;for(const q of nbr[p]){if(owner[q]===PLAYER)continue;const cap=isCapitalProv(q);if(cap>=0&&owner[q]===cap&&rivalCount(cap)>1)continue;
      const d=(pcx[q]-t.x)**2+(pcy[q]-t.y)**2;if(d<bd){bd=d;best=q}}}
    if(best<0)break;conquer(best);got.push(best);n--}
  return got}
function addSkillPoints(names,pts,why){const ups=[];for(const n of names){const i=skillIdx(n);if(i<0)continue;CH.skills[i].value=(CH.skills[i].value|0)+pts;ups.push(`${CH.skills[i].name} ${CH.skills[i].value}`)}
  if(ups.length){saveCharSoon();notify('skill','Skills improved',`${ups.join(', ')}${why?' · '+why:''}`)}}
function completeTask(t,opt){opt=opt||{};const at=opt.at||now();accrue(at);
  t.status='done';t.doneAt=at;const d=diffOf(t.diff);
  if(!opt.quiet)notify('quest','Quest won',`“${t.title}” is done. +${d.gold} gold.`,{task:t.id});
  WD.gold+=+d.gold||0;
  if(!opt.noSkills)addSkillPoints(taskSkills(t),+d.skill_points||1,t.title);
  const got=annexFor(t);
  if(got.length&&!opt.quiet)notify('land',got.length>1?`${got.length} provinces won`:'Province won',`${WD.kingdom} now holds ${playerCount()} provinces.`,{prov:got[0]});
  const g=t.goal&&WD.goals.find(x=>x.id===t.goal);if(g)g.lastActivity=Math.max(g.lastActivity||0,at);
  for(const a of WD.armies.slice()){if((a.kind==='task'&&a.ref===t.id)||(g&&a.kind==='goal'&&a.ref===g.id&&a.reason==='goal-idle'))defeatArmy(a,opt.quiet)}
  checkRanks();return got}
function reopenTask(t){if(t.status!=='done')return;const d=diffOf(t.diff);t.status='open';t.doneAt=null;WD.gold=Math.max(0,WD.gold-(+d.gold||0));
  for(const n of taskSkills(t)){const i=skillIdx(n);if(i>=0)CH.skills[i].value=Math.max(0,(CH.skills[i].value|0)-(+d.skill_points||1))}saveCharSoon();
  notify('quest','Quest reopened',`“${t.title}” is open again. Its skill points and gold were returned; won lands stay yours.`,{task:t.id});
  if(t.deadline&&!WD.armies.some(a=>a.kind==='task'&&a.ref===t.id)&&now()<deadlineEnd(t.deadline))launchTaskArmy(t);checkRanks()}
function setTaskDeadline(t,dv){if(dv===t.deadline)return;t.deadline=dv;t.overdueNotified=false;t.looted=false;
  WD.armies=WD.armies.filter(a=>!(a.kind==='task'&&a.ref===t.id));if(dv&&t.status!=='done')launchTaskArmy(t)}
function deleteTask(t){WD.tasks=WD.tasks.filter(x=>x!==t);WD.armies=WD.armies.filter(a=>!(a.kind==='task'&&a.ref===t.id))}

/* ---------------- goals ---------------- */
function newGoal(f){return Object.assign({id:uid('g'),name:'',realm:WD.realms[0]?WD.realms[0].id:'',deadline:null,skills:[],status:'open',created:now(),lastActivity:now(),doneAt:null,deadlineCampaign:false,example:false},f)}
function addGoal(g,grow){WD.goals.push(g);if(grow){const ri=realmIdx(g.realm);if(ri>=0)expandRival(ri,CFG.rivals.new_goal_provinces|0)}}
function completeGoal(g){const at=now();accrue(at);g.status='done';g.doneAt=at;const gold=+CFG.quests.goal_complete_gold||0;WD.gold+=gold;
  notify('goal','Goal achieved!',`“${g.name}” is complete. +${gold} gold.`,{goal:g.id},true);
  addSkillPoints(g.skills,+CFG.quests.goal_complete_skill_points||0,g.name);
  for(const a of WD.armies.slice())if(a.kind==='goal'&&a.ref===g.id)defeatArmy(a);checkRanks()}
function reopenGoal(g){g.status='open';g.doneAt=null;g.lastActivity=now();g.deadlineCampaign=false}
function deleteGoal(g){WD.goals=WD.goals.filter(x=>x!==g);for(const t of WD.tasks)if(t.goal===g.id)t.goal=null;WD.armies=WD.armies.filter(a=>!(a.kind==='goal'&&a.ref===g.id))}
function setGoalDeadline(g,dv){if(dv===g.deadline)return;g.deadline=dv;g.deadlineCampaign=false;WD.armies=WD.armies.filter(a=>!(a.kind==='goal'&&a.ref===g.id&&a.reason==='goal-deadline'))}

/* ---------------- realms & rivals mid-game ---------------- */
function foundSettlement(p,type){const used=new Set(allSett().map(s=>settName(s.id)));const s={id:settlements.length+1000+extraSett.length,type,x:panchor[p*2],y:panchor[p*2+1],prov:p,r:Math.random(),name:makeName(Math.random,type,used),k:cellAt(panchor[p*2],panchor[p*2+1])};extraSett.push(s);return s}
function addRealm(name){
  const used=WD.realms.map(r=>r.rival.color);const ids=new Set(WD.realms.map(r=>r.id));
  const r={id:uniqueId(slug(name),ids),name,rival:makeRival(name,used)};WD.realms.push(r);const ri=WD.realms.length-1;
  if(!placeRival(ri)){WD.realms.pop();notify('world','No more provinces available to conquer, my sire!','Every province already has a master. Start a new map to found more realms.',null,true);return null}
  notify('war',`${r.rival.name} has risen`,`A new rival claims land in the realm of ${name}.`,null,true);return r}
function placeRival(ri){
  const home=settById(WD.home);let capProv=-1;
  const terra=[];for(let p=0;p<P;p++)if(owner[p]===-1)terra.push(p);
  if(terra.length){const withS=terra.filter(p=>settInProv(p)>=0);const pool=withS.length?withS:terra.filter(p=>pcells[p]>=12);
    pool.sort((a,b)=>Math.hypot(pcx[b]-home.x,pcy[b]-home.y)-Math.hypot(pcx[a]-home.x,pcy[a]-home.y));capProv=pool.length?pool[0]:-1}
  if(capProv>=0){let sid=settInProv(capProv);if(sid<0)sid=foundSettlement(capProv,'castle').id;else WD.stypes[sid]='castle';
    WD.realms[ri].rival.capital=sid;owner[capProv]=ri;expandRival(ri,(CFG.rivals.new_realm_provinces|0)-1,true);return true}
  // terra incognita exhausted: steal provinces from the largest rival
  const k=CFG.rivals.steal_provinces|0||3;let best=-1,bc=0;WD.realms.forEach((r,j)=>{if(j===ri)return;const c=rivalCount(j);if(c>k&&c>bc){bc=c;best=j}});
  if(best<0)return false;
  const cap=settById(WD.realms[best].rival.capital);let start=-1,sd=-1;
  for(let p=0;p<P;p++){if(owner[p]!==best||(cap&&p===cap.prov))continue;const d=cap?Math.hypot(pcx[p]-cap.x,pcy[p]-cap.y):0;const sc=d+(settInProv(p)>=0?200:0);if(sc>sd){sd=sc;start=p}}
  if(start<0)return false;
  const taken=[start];owner[start]=ri;
  for(let i=0;i<taken.length&&taken.length<k;i++)for(const q of nbr[taken[i]]){if(taken.length>=k)break;if(owner[q]===best&&(!cap||q!==cap.prov)){owner[q]=ri;taken.push(q)}}
  const sp=taken.find(p=>settInProv(p)>=0);let sid=sp!=null?settInProv(sp):foundSettlement(start,'castle').id;WD.stypes[sid]='castle';WD.realms[ri].rival.capital=sid;
  notify('war','Borders redrawn',`${WD.realms[ri].rival.name} seized ${taken.length} provinces from ${WD.realms[best].rival.name}.`);return true}
function expandRival(ri,n,quiet){if(n<=0)return 0;let got=0;
  for(;got<n;){let best=-1,bd=Infinity;const cap=settById(WD.realms[ri].rival.capital);if(!cap)break;
    for(let p=0;p<P;p++){if(owner[p]!==ri)continue;for(const q of nbr[p]){if(owner[q]!==-1)continue;const d=Math.hypot(pcx[q]-cap.x,pcy[q]-cap.y);if(d<bd){bd=d;best=q}}}
    if(best<0){for(let p=0;p<P;p++){if(owner[p]!==ri)continue;for(const q of nbr[p]){const o=owner[q];if(o<0||o===PLAYER||o===ri)continue;if(isCapitalProv(q)===o)continue;if(rivalCount(o)<=2)continue;const d=Math.hypot(pcx[q]-cap.x,pcy[q]-cap.y);if(d<bd){bd=d;best=q}}}}
    if(best<0)break;owner[best]=ri;got++}
  if(got<n&&!quiet)notify('world','No more provinces available to conquer, my sire!','The rivals have nowhere left to grow. Consider starting a new map.',null,true);
  return got}
function renameRealm(r,name){r.name=name;r.rival.name=rivalNameFor(name,r.rival.pattern||0)}
function deleteRealm(r){const ri=WD.realms.indexOf(r);if(WD.tasks.some(t=>t.realm===r.id)||WD.goals.some(g=>g.realm===r.id))return false;
  for(let p=0;p<P;p++){if(owner[p]===ri)owner[p]=-1;else if(owner[p]>ri&&owner[p]!==PLAYER)owner[p]--}
  WD.armies=WD.armies.filter(a=>a.realm!==r.id);WD.realms.splice(ri,1);return true}

/* ---------------- armies ---------------- */
const pathCache=new Map();
function armyPath(fromSid,toSid){const key=fromSid+'>'+toSid;if(pathCache.has(key))return pathCache.get(key);
  const A=settById(fromSid),B=settById(toSid);let pts;
  const path=(A&&B)?astar(rcellOf(A.x,A.y),rcellOf(B.x,B.y),.18,.2,120000):null;
  if(path){pts=[A.x,A.y];for(let i=1;i<path.length-1;i++){const c=path[i];pts.push((c%RW+.5)*RCS,(Math.floor(c/RW)+.5)*RCS)}pts.push(B.x,B.y);pts=chaikin(pts,new Array(pts.length/2).fill(1),2)[0]}
  else pts=A&&B?[A.x,A.y,B.x,B.y]:[0,0,0,0];
  const cum=[0];for(let i=2;i<pts.length;i+=2)cum.push(cum[cum.length-1]+Math.hypot(pts[i]-pts[i-2],pts[i+1]-pts[i-1]));
  const mset=new Set();for(let i=0;i<pts.length;i+=2){const p=provId[cellAt(pts[i],pts[i+1])];if(p>=0&&(ptype[p]==='mountains'||ptype[p]==='ashlands'||ptype[p]==='wastes'))mset.add(p)}
  const r={p:pts,cum,len:cum[cum.length-1],mtn:mset.size};pathCache.set(key,r);return r}
function pathAt(pa,f){const L=f*pa.len;let i=0;while(i<pa.cum.length-2&&pa.cum[i+1]<L)i++;
  const seg=pa.cum[i+1]-pa.cum[i]||1,t=clamp((L-pa.cum[i])/seg,0,1);return{x:pa.p[2*i]+(pa.p[2*i+2]-pa.p[2*i])*t,y:pa.p[2*i+1]+(pa.p[2*i+3]-pa.p[2*i+1])*t,i}}
function attackerFor(realmId){let ri=realmIdx(realmId);if(ri>=0&&WD.realms[ri].rival.capital!=null&&rivalCount(ri)>0)return ri;
  let best=-1,bd=Infinity;const h=settById(WD.home);WD.realms.forEach((r,j)=>{if(r.rival.capital==null||rivalCount(j)===0)return;const c=settById(r.rival.capital);const d=Math.hypot(c.x-h.x,c.y-h.y);if(d<bd){bd=d;best=j}});return best}
function nearestPlayerSett(x,y){let best=WD.home,bd=Infinity;for(const s of allSett()){if(owner[s.prov]!==PLAYER)continue;const d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;best=s.id}}return best}
function siegeDays(a){const s=settById(a.target);const key=a.target===WD.home?'main_castle':settType(s);return +CFG.siege_days[key]||1}
function launchArmy(kind,ref,reason,realmId,launch,arriveBase){
  const ri=attackerFor(realmId);if(ri<0)return null;const cap=settById(WD.realms[ri].rival.capital);
  const target=nearestPlayerSett(cap.x,cap.y);const pa=armyPath(cap.id,target);
  const arrive=Math.max(launch,arriveBase)+pa.mtn*(+CFG.armies.mountain_delay_days||0)*DAY;
  const a={id:uid('a'),kind,ref,reason,realm:WD.realms[ri].id,from:cap.id,target,launch,arrive,mtn:pa.mtn,sieged:false};WD.armies.push(a);return a}
function launchTaskArmy(t){const a=launchArmy('task',t.id,'task-deadline',t.realm,now(),deadlineEnd(t.deadline));
  if(a)notify('war','An army marches!',`${armyRival(a).name} marches on ${settName(a.target)} over “${t.title}”. It arrives ${fmtWhen(a.arrive,now())}${a.mtn?` (slowed by ${a.mtn} rough ${a.mtn>1?'provinces':'province'}: mountains, ashlands or craters)`:''}.`,{army:a.id})}
function armyRival(a){const r=WD.realms.find(x=>x.id===a.realm);return r?r.rival:{name:'A rival',color:'#888'}}
function armyCause(a){if(a.kind==='task'){const t=WD.tasks.find(x=>x.id===a.ref);return{label:t?t.title:'a quest',fix:t?`finish “${t.title}”`:'finish the quest',ref:{task:a.ref}}}
  const g=WD.goals.find(x=>x.id===a.ref);const gn=g?g.name:'a goal';
  return a.reason==='goal-deadline'?{label:gn,fix:`complete the goal “${gn}”`,why:`Your goal “${gn}” is due ${g&&g.deadline?fmtDay(deadlineEnd(g.deadline)):'soon'}.`,ref:{goal:a.ref}}
    :{label:gn,fix:`finish any quest in “${gn}”`,why:`You haven't completed any quest in “${gn}” for ${CFG.armies.goal_idle_days} days.`,ref:{goal:a.ref}}}
function armyState(a){const t=now();if(t<a.arrive){const f=a.arrive>a.launch?clamp((t-a.launch)/(a.arrive-a.launch),0,1):1;const pa=armyPath(a.from,a.target);return{phase:'march',f,pos:pathAt(pa,f),pa,eta:a.arrive}}
  const pa=armyPath(a.from,a.target);return{phase:'siege',f:1,pos:{x:pa.p[pa.p.length-2],y:pa.p[pa.p.length-1],i:pa.cum.length-1},pa,eta:a.arrive+siegeDays(a)*DAY}}
function defeatArmy(a,quiet){WD.armies=WD.armies.filter(x=>x!==a);const b=+CFG.gold.army_defeat_bounty||0;WD.gold+=b;
  const r=armyRival(a);if(!quiet){notify('victory','Enemy was defeated!',`${r.name}'s army was routed before ${settName(a.target)}. +${b} gold.`,null,false);if(typeof uiDefeat==='function')uiDefeat(a,r,b)}}
function loseProvinces(n,sid,toRi){const s=settById(sid);const hp=homeProv();const lost=[];
  const cands=[];for(let p=0;p<P;p++)if(owner[p]===PLAYER&&p!==hp)cands.push(p);
  cands.sort((a,b)=>{const pa=a===s.prov?1:0,pb=b===s.prov?1:0;if(pa!==pb)return pa-pb;return Math.hypot(pcx[a]-s.x,pcy[a]-s.y)-Math.hypot(pcx[b]-s.x,pcy[b]-s.y)});
  for(const p of cands){if(lost.length>=n)break;owner[p]=toRi;lost.push(p);WD.annex=WD.annex.filter(x=>x!==p)}
  return lost}
function processTime(){if(!WD||!owner)return;
  for(let guard=0;guard<400;guard++){const t=now();let ev=null;const cand=(time,type,obj)=>{if(time<=t&&(!ev||time<ev.time))ev={time,type,obj}};
    for(const a of WD.armies){if(!a.sieged)cand(a.arrive,'siege',a);else cand(a.arrive+siegeDays(a)*DAY,'loot',a)}
    for(const g of WD.goals){if(g.status!=='open')continue;
      if(g.deadline&&!g.deadlineCampaign)cand(deadlineEnd(g.deadline)-(+CFG.armies.goal_deadline_warning_days||7)*DAY,'gdead',g);
      if(!WD.armies.some(a=>a.kind==='goal'&&a.ref===g.id&&a.reason==='goal-idle'))cand((g.lastActivity||g.created)+(+CFG.armies.goal_idle_days||7)*DAY,'gidle',g)}
    for(const k of WD.tasks)if(k.status!=='done'&&k.deadline&&!k.overdueNotified)cand(deadlineEnd(k.deadline),'overdue',k);
    if(!ev)break;accrue(ev.time);const o=ev.obj;
    if(ev.type==='siege'){if(owner[settById(o.target).prov]!==PLAYER){const pa=armyPath(o.from,o.target);const end=pa.p.length;const nt=nearestPlayerSett(pa.p[end-2],pa.p[end-1]);o.from=o.target;o.target=nt;o.launch=ev.time;o.arrive=ev.time+DAY;continue}
      o.sieged=true;const s=settById(o.target),ty=o.target===WD.home?'Castle':STYPE_LABEL[settType(s)],c=armyCause(o);
      notify('siege',`${ty} under siege!`,`${armyRival(o).name} besieges ${settName(o.target)}. You have ${siegeDays(o)} ${siegeDays(o)>1?'days':'day'} to ${c.fix}.`,{army:o.id},true)}
    else if(ev.type==='loot'){const s=settById(o.target);const main=o.target===WD.home;const key=main?'main_castle':settType(s);
      const n=Math.max(1,+CFG.loot_provinces[key]||1);const ri=realmIdx(o.realm);const lost=loseProvinces(n,o.target,ri>=0?ri:-1);
      let goldLost=0;if(main&&CFG.main_castle_loot_takes_all_gold){goldLost=Math.floor(WD.gold);WD.gold=0}
      WD.armies=WD.armies.filter(x=>x!==o);
      if(o.kind==='task'){const k=WD.tasks.find(x=>x.id===o.ref);if(k)k.looted=true}
      else{const g=WD.goals.find(x=>x.id===o.ref);if(g){if(o.reason==='goal-idle')g.lastActivity=ev.time}}
      notify('loot',`Enemy has looted your ${main?'castle':STYPE_LABEL[settType(s)].toLowerCase()} ${settName(o.target)}!`,`${armyRival(o).name} took ${lost.length} ${lost.length===1?'province':'provinces'}${goldLost?` and all ${goldLost} gold in the treasury`:''}.`,{prov:lost[0]},true)}
    else if(ev.type==='gdead'){o.deadlineCampaign=true;const a=launchArmy('goal',o.id,'goal-deadline',o.realm,ev.time,ev.time+(+CFG.armies.campaign_march_days||7)*DAY);
      if(a)notify('campaign','Your enemy has launched a campaign against you!',`Why: your goal “${o.name}” is due ${fmtDay(deadlineEnd(o.deadline))}. ${armyRival(a).name} marches on ${settName(a.target)} and arrives ${fmtWhen(a.arrive,now())}. Complete the goal to defeat it.`,{army:a.id,goal:o.id},true)}
    else if(ev.type==='gidle'){const a=launchArmy('goal',o.id,'goal-idle',o.realm,ev.time,ev.time+(+CFG.armies.campaign_march_days||7)*DAY);
      if(!a){o.lastActivity=ev.time;continue}
      notify('campaign','Your enemy has launched a campaign against you!',`Why: you haven't completed any quest in “${o.name}” for ${CFG.armies.goal_idle_days} days. ${armyRival(a).name} marches on ${settName(a.target)} and arrives ${fmtWhen(a.arrive,now())}. Finish any quest in the goal to defeat it.`,{army:a.id,goal:o.id},true)}
    else if(ev.type==='overdue'){o.overdueNotified=true;notify('quest','Quest overdue',`“${o.title}” passed its deadline.`,{task:o.id})}
  }
  accrue(now());checkRanks();
}

/* ---------------- new world ---------------- */
function seedExamples(){
  const t0=now(),hp=homeProv();const realms=WD.realms;if(!realms.length)return;
  const own=new Set();for(let p=0;p<P;p++)if(owner[p]===PLAYER)own.add(p);
  const border=[];for(const p of own)for(const q of nbr[p])if(!own.has(q)&&!border.includes(q)&&plantCheck(q).ok&&!plantCheck(q).cost)border.push(q);
  border.sort((a,b)=>Math.hypot(pcx[a]-pcx[hp],pcy[a]-pcy[hp])-Math.hypot(pcx[b]-pcx[hp],pcy[b]-pcy[hp]));
  const spot=i=>{const p=border.length?border[i%border.length]:hp;return{x:panchor[p*2]+(hash01(p+i)-.5)*10,y:panchor[p*2+1]+(hash01(p+i*7)-.5)*10,prov:p}};
  const pickRealm=(hint,i)=>{const r=realms.find(x=>x.name.toLowerCase().includes(hint));return (r||realms[i%realms.length]).id};
  const pickSkill=h=>{const k=CH.skills.find(x=>x.name.toLowerCase()===h.toLowerCase());return k?[k.name]:[]};
  const mk=(i,f,hint,skill,inGoal)=>{const realm=pickRealm(hint,i);const g=inGoal?WD.goals.find(x=>x.realm===realm):null;
    const t=newTask(Object.assign(spot(i),{realm,goal:g?g.id:null,skills:g&&g.skills.length?[]:pickSkill(skill),example:true},f));WD.tasks.push(t);return t};
  for(const [i,title,diff,ago,hint,skill] of [[0,'Morning run, 5 km',1,4,'health','Conditioning'],[1,"Review last month's spending",2,3,'money','Investing'],[2,'Send three client follow-ups',2,2,'business','Selling & influencing']]){
    const t=mk(i,{title,diff,created:t0-(ago+2)*DAY},hint,skill,true);completeTask(t,{quiet:true,noSkills:true,at:t0-ago*DAY})}
  const open=[['Leg day: squats and deadlifts',2,2,1,'health','Muscle growth',false],['Long run, 12 km',3,8,2,'health','Conditioning',true],['Write the Q4 launch email sequence',3,4,3,'business','Writing',true],
    ['Finish chapter 3 of the Python course',2,null,1,'education','Coding',true],['Rebalance the investment portfolio',1,null,0,'money','Investing',false],['Practise the wedding toast out loud',2,null,1,'relationship','Public speaking',false]];
  open.forEach(([title,diff,days,ago,hint,skill,inGoal],k)=>{const t=mk(k+3,{title,diff,created:t0-ago*DAY},hint,skill,inGoal);if(days){t.deadline=dateStr(t0+days*DAY);launchArmy('task',t.id,'task-deadline',t.realm,t0-ago*DAY,deadlineEnd(t.deadline))}});
  const rep=WD.tasks.find(t=>t.title==='Write the Q4 launch email sequence');if(rep){rep.desc='Five emails: teaser, launch, social proof, objections, last call.';rep.subs=[{t:'Outline the sequence',d:true},{t:'Draft emails 1 to 3',d:false},{t:'Draft emails 4 and 5',d:false}]}
  WD.notifs.forEach(n=>n.read=true);
}
