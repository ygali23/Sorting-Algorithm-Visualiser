const $=s=>document.querySelector(s),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>performance.now();
const delayFromSpeed=v=>{const t=(100-v)/99;return 2+Math.pow(t,1.65)*60};
const valueColor=(v,minV,maxV)=>`hsl(${270*((v-minV)/(maxV-minV||1))},92%,60%)`;

let audioCtx=null,soundOn=false;
function ensureAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume()}
function beep(v01){if(!soundOn)return;ensureAudio();const t0=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="sine";o.frequency.setValueAtTime(180+v01*820,t0);
g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(.05,t0+.01);g.gain.exponentialRampToValueAtTime(.0001,t0+.06);
o.connect(g).connect(audioCtx.destination);o.start(t0);o.stop(t0+.065)}

const lanesEl=$("#lanes"),shuffleBtn=$("#shuffleBtn"),playBtn=$("#playBtn"),stepBtn=$("#stepBtn"),stopBtn=$("#stopBtn"),sizeRange=$("#sizeRange"),speedRange=$("#speedRange"),sizeVal=$("#sizeVal"),speedVal=$("#speedVal");
const soundToggle=$("#soundToggle"),modeToggle=$("#modeToggle"),toast=$("#toast"),scrubRange=$("#scrubRange"),scrubVal=$("#scrubVal"),presetSelect=$("#presetSelect");
const explainModal=$("#explain"),explainClose=$("#explainClose"),explainTitle=$("#explainTitle"),explainSub=$("#explainSub"),explainBody=$("#explainBody");
const raceCanvas=$("#raceCanvas"),raceLegend=$("#raceLegend"),rctx=raceCanvas.getContext("2d");

/* NEW: panel elements */
const pillMode=$("#pillMode"),pillSound=$("#pillSound"),panelStep=$("#panelStep"),panelActive=$("#panelActive"),panelList=$("#panelList");

let useLines=false,baseArray=[],running=false,stopped=false,paused=false,lanes=[],raceHistory=[],globalMaxSteps=0;

const BAW=(b,a,w)=>`B/A/W: ${b} / ${a} / ${w}`;
const ALGOS={
  bubble:{name:"Bubble Sort",badge:BAW("n","n²","n²"),run:genBubbleOptimized},
  insertion:{name:"Insertion Sort",badge:BAW("n","n²","n²"),run:genInsertion},
  selection:{name:"Selection Sort",badge:BAW("n²","n²","n²"),run:genSelection},
  cocktail:{name:"Cocktail Shaker",badge:BAW("n","n²","n²"),run:genCocktail},
  comb:{name:"Comb Sort",badge:BAW("n log n","n²","n²"),run:genComb},
  shell:{name:"Shell Sort",badge:BAW("n log n","~n^(3/2)","n²"),run:genShell},
  quick:{name:"Quick Sort",badge:BAW("n log n","n log n","n²"),run:genQuick},
  merge:{name:"Merge Sort",badge:BAW("n log n","n log n","n log n"),run:genMerge},
  heap:{name:"Heap Sort",badge:BAW("n log n","n log n","n log n"),run:genHeap},
  counting:{name:"Counting Sort",badge:BAW("n+k","n+k","n+k"),run:genCounting},
  radix:{name:"Radix Sort (LSD)",badge:BAW("n·k","n·k","n·k"),run:genRadix},
  tim:{name:"TimSort (mini)",badge:BAW("n","n log n","n log n"),run:genTimMini},
};

const toastMsg=msg=>{if(!toast)return;toast.textContent=msg;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),1100)};
const selectedLaneIndices=()=>{const checks=[...document.querySelectorAll(".laneCheck")];if(!checks.length)return[0,1,2,3];const picked=checks.filter(c=>c.checked).map(c=>+c.dataset.lane);return picked.length?picked:[0]};
const activeSet=()=>new Set(selectedLaneIndices());
const setChecks=idxs=>{const s=new Set(idxs);document.querySelectorAll(".laneCheck").forEach(c=>c.checked=s.has(+c.dataset.lane))};

function laneTemplate(id){
  const lane=document.createElement("div");lane.className="lane";lane.dataset.lane=id;
  const opts=Object.entries(ALGOS).map(([k,a])=>`<option value="${k}">${a.name}</option>`).join("");
  lane.innerHTML=`
  <div class="laneHead">
    <div class="laneLeft">
      <div class="laneName">Algorithm ${id+1}<span class="badge" id="badge-${id}">—</span></div>
      <select class="select" id="sel-${id}">${opts}</select>
    </div>
    <div class="laneRight">
      <button class="btnSolo" type="button" data-solo="${id}">Solo</button>
      <span><i class="dot idle" id="dot-${id}"></i><b id="state-${id}">IDLE</b></span>
      <span>cmp <b id="cmp-${id}">0</b></span>
      <span>swp <b id="swp-${id}">0</b></span>
      <span>ms <b id="ms-${id}">0</b></span>
    </div>
  </div>
  <div class="viz" id="viz-${id}"></div>`;
  return lane;
}
function setLaneState(id,state){const st=$(`#state-${id}`),dot=$(`#dot-${id}`);if(!st||!dot)return;st.textContent=state;dot.className="dot "+(state==="RUN"?"run":state==="DONE"?"done":state==="STOP"?"stop":"idle")}
function setLaneStats(id,cmp,swp,ms){const c=$(`#cmp-${id}`),s=$(`#swp-${id}`),m=$(`#ms-${id}`);if(c)c.textContent=""+cmp;if(s)s.textContent=""+swp;if(m)m.textContent=""+ms}
function updateBadge(id,key){const b=$(`#badge-${id}`);if(b)b.textContent=ALGOS[key].badge}

function generateBase(){
  const n=+sizeRange.value;const arr=Array.from({length:n},()=>8+Math.floor(Math.random()*93));
  for(let i=n-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
  baseArray=arr;
}

function renderBarsInto(container,arr,hi){
  container.innerHTML="";const minV=Math.min(...arr),maxV=Math.max(...arr);
  for(let i=0;i<arr.length;i++){
    const b=document.createElement("div");b.className="bar";b.style.height=`${arr[i]}%`;b.style.background=valueColor(arr[i],minV,maxV);
    if(hi?.compare?.has(i))b.classList.add("compare");if(hi?.swap?.has(i))b.classList.add("swap");if(hi?.pivot===i)b.classList.add("pivot");
    container.appendChild(b);
  }
}
const updateBars=(c,a,hi)=>renderBarsInto(c,a,hi);

function makeLineView(container){container.innerHTML=`<div class="canvasWrap"><canvas></canvas></div>`;const canvas=container.querySelector("canvas");return{canvas,ctx:canvas.getContext("2d")}}
function resizeCanvasToDisplaySize(canvas){
  const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(1,Math.floor(r.width*dpr)),h=Math.max(1,Math.floor(r.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;return true}return false;
}
function drawPolyline(view,arr,hi){
  const {canvas,ctx}=view;resizeCanvasToDisplaySize(canvas);const w=canvas.width,h=canvas.height,dpr=window.devicePixelRatio||1;
  ctx.clearRect(0,0,w,h);
  ctx.globalAlpha=.35;ctx.strokeStyle="rgba(255,255,255,0.10)";ctx.lineWidth=1;
  for(let y=0;y<=4;y++){const yy=h*y/4;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke()}ctx.globalAlpha=1;
  const n=arr.length,pad=10*dpr,x0=pad,x1=w-pad,y0=pad,y1=h-pad,minV=Math.min(...arr),maxV=Math.max(...arr);
  const pt=i=>{const t=i/(n-1),x=x0+t*(x1-x0),y=y1-(arr[i]/100)*(y1-y0);return{x,y}};
  ctx.lineWidth=2.6*dpr;
  for(let i=0;i<n-1;i++){const p0=pt(i),p1=pt(i+1),v=(arr[i]+arr[i+1])/2;ctx.strokeStyle=valueColor(v,minV,maxV);ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke()}
  const dot=(i,color)=>{const p=pt(i);ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,4.2*dpr,0,Math.PI*2);ctx.fill()};
  if(hi?.compare)for(const i of hi.compare)dot(i,"rgba(251,191,36,.95)");
  if(hi?.swap)for(const i of hi.swap)dot(i,"rgba(251,113,133,.95)");
  if(Number.isFinite(hi?.pivot))dot(hi.pivot,"rgba(124,58,237,.95)");
}

async function finishEffect(lane){
  const arr=lane.currentArr;
  if(useLines){for(let k=0;k<10;k++){if(stopped)return;drawPolyline(lane.view,arr,null);await sleep(12)}}
  else{const bars=lane.vizEl.children;for(let k=0;k<bars.length;k++){if(stopped)return;bars[k].style.filter="saturate(1.25) brightness(1.05)";await sleep(2)}for(let k=0;k<bars.length;k++)bars[k].style.filter=""}
}

function makeStep(arr,hi,cmp,swp,t0,done=false,event=null){return{arr:arr.slice(),hi,cmp,swp,ms:Math.round(now()-t0),done,event}}

async function buildSteps(){
  const active=activeSet();
  lanes.forEach((lane,i)=>{lane.steps=[];lane.stepIndex=0;lane.stats={cmp:0,swp:0,ms:0};lane.currentArr=baseArray.slice();setLaneStats(i,0,0,0);setLaneState(i,"IDLE")});
  for(let li=0;li<lanes.length;li++){
    const lane=lanes[li];
    if(!active.has(li)){lane.steps=[{arr:baseArray.slice(),hi:null,cmp:0,swp:0,ms:0,done:false,event:null}];continue}
    lane.steps=ALGOS[lane.algoKey].run(baseArray.slice());updateBadge(li,lane.algoKey);
  }
  globalMaxSteps=Math.max(...lanes.map(l=>l.steps.length));
  scrubRange.max=""+Math.max(0,globalMaxSteps-1);scrubRange.value="0";scrubVal.textContent=`0 / ${Math.max(0,globalMaxSteps-1)}`;
  raceHistory=Array.from({length:globalMaxSteps},()=>lanes.map(()=>({cmp:0,swp:0,ms:0})));
  for(let t=0;t<globalMaxSteps;t++)for(let li=0;li<lanes.length;li++){const st=lanes[li].steps[Math.min(t,lanes[li].steps.length-1)];raceHistory[t][li]={cmp:st.cmp,swp:st.swp,ms:st.ms}}
  drawRace(0);
  updatePanel(0); /* NEW */
}

function applyStep(globalIndex){
  scrubRange.value=""+globalIndex;scrubVal.textContent=`${globalIndex} / ${Math.max(0,globalMaxSteps-1)}`;
  const active=activeSet();
  for(let li=0;li<lanes.length;li++){
    const lane=lanes[li],step=lane.steps[Math.min(globalIndex,lane.steps.length-1)];
    lane.currentArr=step.arr;lane.stats={cmp:step.cmp,swp:step.swp,ms:step.ms};setLaneStats(li,step.cmp,step.swp,step.ms);
    lane.el.classList.toggle("inactive",!active.has(li));
    if(useLines)drawPolyline(lane.view,step.arr,step.hi);else updateBars(lane.vizEl,step.arr,step.hi);
    if(!active.has(li)){setLaneState(li,"IDLE");continue}
    if(step.done)setLaneState(li,"DONE");else if(stopped)setLaneState(li,"STOP");else if(running&&!paused)setLaneState(li,"RUN");else setLaneState(li,"IDLE");
  }
  drawRace(globalIndex);renderLegend();
  updatePanel(globalIndex); /* NEW */
  let best=null;for(let li=0;li<lanes.length;li++){if(!active.has(li))continue;const st=lanes[li].steps[Math.min(globalIndex,lanes[li].steps.length-1)];if(st.event?.text)best=st}
  if(best?.event?.autoExplain)showExplain(best.event.title,best.event.subtitle,best.event.text);
}

async function playbackLoop(){
  while(running&&!stopped){
    if(paused){await sleep(30);continue}
    const delay=delayFromSpeed(+speedRange.value);let idx=+scrubRange.value;
    if(idx>=globalMaxSteps-1){
      running=false;const active=activeSet();lanes.forEach((_,i)=>active.has(i)&&setLaneState(i,"DONE"));
      await Promise.all(lanes.map((l,i)=>({l,i})).filter(({i})=>active.has(i)).map(({l})=>finishEffect(l)));
      stopBtn.disabled=true;playBtn.disabled=false;stepBtn.disabled=false;shuffleBtn.disabled=false;sizeRange.disabled=false;setPlayBtn(false);
      updatePanel(+scrubRange.value); /* NEW */
      return;
    }
    idx++;applyStep(idx);
    if(soundOn){const active=activeSet();for(let li=0;li<lanes.length;li++){if(!active.has(li))continue;const st=lanes[li].steps[Math.min(idx,lanes[li].steps.length-1)];
      if(st?.hi?.swap?.size){const first=[...st.hi.swap][0];beep((st.arr[first]||50)/100);break}}}
    await sleep(delay);
  }
}

function showExplain(title,subtitle,body){explainTitle.textContent=title||"What happened?";explainSub.textContent=subtitle||"";explainBody.innerHTML=body;explainModal.classList.add("show");explainModal.setAttribute("aria-hidden","false")}
function hideExplain(){explainModal.classList.remove("show");explainModal.setAttribute("aria-hidden","true")}
if(explainClose)explainClose.addEventListener("click",hideExplain);
if(explainModal)explainModal.addEventListener("click",e=>{if(e.target===explainModal)hideExplain()});

const laneColor=i=>`hsl(${[195,270,145,330][i%4]},92%,60%)`;
function drawRace(stepIndex){
  const active=activeSet(),dpr=window.devicePixelRatio||1,rect=raceCanvas.getBoundingClientRect(),w=Math.max(1,Math.floor(rect.width*dpr)),h=Math.max(1,Math.floor(rect.height*dpr));
  if(raceCanvas.width!==w||raceCanvas.height!==h){raceCanvas.width=w;raceCanvas.height=h}
  rctx.clearRect(0,0,w,h);rctx.fillStyle="rgba(0,0,0,.20)";rctx.fillRect(0,0,w,h);
  rctx.strokeStyle="rgba(255,255,255,0.10)";rctx.lineWidth=1;for(let y=0;y<=4;y++){const yy=h*y/4;rctx.beginPath();rctx.moveTo(0,yy);rctx.lineTo(w,yy);rctx.stroke()}
  const maxT=Math.max(1,globalMaxSteps-1),opsAt=(t,li)=>{const s=raceHistory[t]?.[li]||{cmp:0,swp:0};return s.cmp+s.swp};
  let yMax=1;for(let li=0;li<lanes.length;li++){if(!active.has(li))continue;yMax=Math.max(yMax,opsAt(Math.min(stepIndex,maxT),li),opsAt(maxT,li))}yMax*=1.08;
  const pad=10*dpr,x0=pad,x1=w-pad,y0=pad,y1=h-pad;
  for(let li=0;li<lanes.length;li++){if(!active.has(li))continue;rctx.strokeStyle=laneColor(li);rctx.lineWidth=2.2*dpr;rctx.beginPath();
    for(let t=0;t<=stepIndex;t++){const x=x0+(t/maxT)*(x1-x0),y=y1-(opsAt(t,li)/yMax)*(y1-y0);t===0?rctx.moveTo(x,y):rctx.lineTo(x,y)}rctx.stroke()}
  const mx=x0+(stepIndex/maxT)*(x1-x0);rctx.strokeStyle="rgba(255,255,255,0.30)";rctx.lineWidth=1;rctx.beginPath();rctx.moveTo(mx,y0);rctx.lineTo(mx,y1);rctx.stroke();
}
function renderLegend(){
  if(!raceLegend)return;const active=activeSet();raceLegend.innerHTML="";
  lanes.forEach((lane,i)=>{if(!active.has(i))return;const row=document.createElement("div");row.className="legendRow";
    row.innerHTML=`<div class="legendLeft"><span class="legendSwatch" style="background:${laneColor(i)}"></span><span>Algorithm ${i+1}: ${lane.algoKey}</span></div>
    <div class="legendRight"><span>cmp:${lane.stats?.cmp||0}</span><span>swp:${lane.stats?.swp||0}</span></div>`;raceLegend.appendChild(row)})
}

function rerenderLaneViews(){
  lanes.forEach(l=>{
    const c=l.vizEl;
    if(useLines){l.view=makeLineView(c);drawPolyline(l.view,l.currentArr||baseArray,null)}
    else{l.view=null;renderBarsInto(c,l.currentArr||baseArray,null)}
  });
}

function makeKbd(t){const s=document.createElement("span");s.className="kbd";s.textContent=t;return s}
function setPlayBtn(isPlaying){playBtn.innerHTML=isPlaying?"⏸ Pause ":"▶ Play ";playBtn.appendChild(makeKbd("Space"))}

/* NEW: panel updater */
function updatePanel(globalIndex){
  if(pillMode)pillMode.textContent=useLines?"Lines":"Bars";
  if(pillSound)pillSound.textContent=soundOn?"Sound On":"Sound Off";
  if(panelStep)panelStep.textContent=`${globalIndex} / ${Math.max(0,globalMaxSteps-1)}`;

  const active=activeSet();
  const activeIds=[...active].sort((a,b)=>a-b);
  if(panelActive)panelActive.textContent=activeIds.length?activeIds.map(i=>`#${i+1}`).join(", "):"—";

  if(!panelList)return;
  panelList.innerHTML="";
  activeIds.forEach(i=>{
    const lane=lanes[i];
    const st=lane?.steps?.[Math.min(globalIndex,(lane.steps?.length||1)-1)] || {cmp:0,swp:0};
    const ops=(st.cmp||0)+(st.swp||0);
    const div=document.createElement("div");
    div.className="panelItem";
    div.innerHTML=`
      <div class="panelLeft">
        <span class="swatch" style="background:${laneColor(i)}"></span>
        <span class="pname">Alg ${i+1}: ${lane.algoKey}</span>
      </div>
      <div class="pops">ops ${ops}</div>
    `;
    panelList.appendChild(div);
  });
}

/* controls */
shuffleBtn.addEventListener("click",async()=>{if(running)return;generateBase();lanes.forEach(l=>l.currentArr=baseArray.slice());rerenderLaneViews();await buildSteps();applyStep(0);toastMsg("Shuffled")});
sizeRange.addEventListener("input",async()=>{sizeVal.textContent=sizeRange.value;if(running)return;generateBase();lanes.forEach(l=>l.currentArr=baseArray.slice());rerenderLaneViews();await buildSteps();applyStep(0)});
speedRange.addEventListener("input",()=>speedVal.textContent=speedRange.value);
soundToggle.addEventListener("click",()=>{soundOn=!soundOn;soundToggle.classList.toggle("on",soundOn);soundToggle.setAttribute("aria-checked",""+soundOn);if(soundOn)ensureAudio();updatePanel(+scrubRange.value)});
modeToggle.addEventListener("click",()=>{useLines=!useLines;modeToggle.classList.toggle("on",useLines);modeToggle.setAttribute("aria-checked",""+useLines);rerenderLaneViews();applyStep(+scrubRange.value);toastMsg(useLines?"Line mode":"Bar mode");updatePanel(+scrubRange.value)});

playBtn.addEventListener("click",async()=>{
  if(stopped)stopped=false;
  if(!running){
    await buildSteps();applyStep(+scrubRange.value);
    running=true;paused=false;stopped=false;
    shuffleBtn.disabled=true;sizeRange.disabled=true;stopBtn.disabled=false;stepBtn.disabled=true;setPlayBtn(true);
    const active=activeSet();lanes.forEach((_,i)=>active.has(i)?setLaneState(i,"RUN"):setLaneState(i,"IDLE"));
    playbackLoop();
  }else{paused=!paused;setPlayBtn(!paused);toastMsg(paused?"Paused":"Playing");updatePanel(+scrubRange.value)}
});
stepBtn.addEventListener("click",()=>{if(running&&!paused)return;const idx=+scrubRange.value;if(idx<globalMaxSteps-1)applyStep(idx+1)});
stopBtn.addEventListener("click",()=>{if(!running)return;stopped=true;running=false;paused=false;shuffleBtn.disabled=false;sizeRange.disabled=false;stopBtn.disabled=true;stepBtn.disabled=false;setPlayBtn(false);
  const active=activeSet();lanes.forEach((_,i)=>active.has(i)?setLaneState(i,"STOP"):setLaneState(i,"IDLE"));toastMsg("Stopped");updatePanel(+scrubRange.value)});
scrubRange.addEventListener("input",()=>applyStep(+scrubRange.value));

window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(e.code==="Space"){e.preventDefault();playBtn.click()}
  if(k===".")stepBtn.click();if(k==="s")stopBtn.click();if(k==="r")shuffleBtn.click();if(k==="l")modeToggle.click();if(k==="t")soundToggle.click();
});
window.addEventListener("resize",()=>{if(useLines)lanes.forEach(l=>l.view&&drawPolyline(l.view,l.currentArr||baseArray,null));drawRace(+scrubRange.value)});

presetSelect?.addEventListener("change",async()=>{
  const p=presetSelect.value;
  if(p==="all")setChecks([0,1,2,3]);
  if(p==="first2")setChecks([0,1]);
  if(p==="first3")setChecks([0,1,2]);
  if(p==="solo1")setChecks([0]);
  if(p==="solo2")setChecks([1]);
  if(p==="solo3")setChecks([2]);
  if(p==="solo4")setChecks([3]);
  toastMsg("Preset applied");
  if(!running){await buildSteps();applyStep(+scrubRange.value)}
});

function init(){
  lanesEl.innerHTML="";lanes=[];
  for(let i=0;i<4;i++){
    const el=laneTemplate(i);lanesEl.appendChild(el);
    const vizEl=el.querySelector(`#viz-${i}`);
    lanes.push({id:i,el,vizEl,algoKey:["bubble","insertion","quick","merge"][i],steps:[],stepIndex:0,stats:{cmp:0,swp:0,ms:0},currentArr:[],view:null});
  }
  lanes.forEach((lane,i)=>{
    const sel=$(`#sel-${i}`);sel.value=lane.algoKey;updateBadge(i,lane.algoKey);
    sel.addEventListener("change",async()=>{lane.algoKey=sel.value;updateBadge(i,lane.algoKey);toastMsg(`Algorithm ${i+1}: ${ALGOS[lane.algoKey].name}`);if(!running){await buildSteps();applyStep(+scrubRange.value)}});
  });
  document.querySelectorAll(".btnSolo").forEach(btn=>btn.addEventListener("click",async()=>{
    const id=+btn.dataset.solo;setChecks([id]);presetSelect.value=`solo${id+1}`;toastMsg(`Solo: Algorithm ${id+1}`);
    if(!running){await buildSteps();applyStep(+scrubRange.value)}
  }));
  document.querySelectorAll(".laneCheck").forEach(c=>c.addEventListener("change",async()=>{if(running)return;await buildSteps();applyStep(+scrubRange.value);toastMsg("Updated selection")}));
  sizeVal.textContent=sizeRange.value;speedVal.textContent=speedRange.value;
  generateBase();lanes.forEach(l=>l.currentArr=baseArray.slice());rerenderLaneViews();
  buildSteps().then(()=>applyStep(0));
}

/* sorting generators (unchanged) */
function genBubbleOptimized(arr){const steps=[];let cmp=0,swp=0;const t0=now(),n=arr.length;
  for(let end=n-1;end>0;end--){let swapped=false;
    for(let i=0;i<end;i++){cmp++;steps.push(makeStep(arr,{compare:new Set([i,i+1])},cmp,swp,t0));
      if(arr[i]>arr[i+1]){swp++;[arr[i],arr[i+1]]=[arr[i+1],arr[i]];swapped=true;steps.push(makeStep(arr,{swap:new Set([i,i+1])},cmp,swp,t0))}
    } if(!swapped)break;
  } steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genInsertion(arr){const steps=[];let cmp=0,swp=0;const t0=now(),n=arr.length;
  for(let i=1;i<n;i++){const key=arr[i];let j=i-1;steps.push(makeStep(arr,{compare:new Set([i])},cmp,swp,t0));
    while(j>=0){cmp++;steps.push(makeStep(arr,{compare:new Set([j,j+1])},cmp,swp,t0));if(arr[j]<=key)break;
      swp++;arr[j+1]=arr[j];steps.push(makeStep(arr,{swap:new Set([j,j+1])},cmp,swp,t0));j--;
    } arr[j+1]=key;swp++;steps.push(makeStep(arr,{swap:new Set([j+1])},cmp,swp,t0));
  } steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genSelection(arr){const steps=[];let cmp=0,swp=0;const t0=now(),n=arr.length;
  for(let i=0;i<n-1;i++){let m=i;for(let j=i+1;j<n;j++){cmp++;steps.push(makeStep(arr,{compare:new Set([m,j])},cmp,swp,t0));if(arr[j]<arr[m])m=j}
    if(m!==i){swp++;[arr[i],arr[m]]=[arr[m],arr[i]];steps.push(makeStep(arr,{swap:new Set([i,m])},cmp,swp,t0))}
  } steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genQuick(arr){const steps=[];let cmp=0,swp=0;const t0=now();
  function part(lo,hi){const pivot=arr[hi];let p=lo;steps.push(makeStep(arr,{pivot:hi},cmp,swp,t0));
    for(let i=lo;i<hi;i++){cmp++;steps.push(makeStep(arr,{compare:new Set([i,hi]),pivot:hi},cmp,swp,t0));
      if(arr[i]<pivot){if(i!==p){swp++;[arr[i],arr[p]]=[arr[p],arr[i]];steps.push(makeStep(arr,{swap:new Set([i,p]),pivot:hi},cmp,swp,t0))}p++}
    } swp++;[arr[p],arr[hi]]=[arr[hi],arr[p]];steps.push(makeStep(arr,{swap:new Set([p,hi])},cmp,swp,t0));return p;
  }
  (function qs(lo,hi){if(lo>=hi)return;const p=part(lo,hi);qs(lo,p-1);qs(p+1,hi)})(0,arr.length-1);
  steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genMerge(arr){const steps=[];let cmp=0,swp=0;const t0=now();
  function merge(lo,mid,hi){const L=arr.slice(lo,mid+1),R=arr.slice(mid+1,hi+1);let i=0,j=0,k=lo;
    while(i<L.length&&j<R.length){cmp++;steps.push(makeStep(arr,{compare:new Set([k])},cmp,swp,t0));
      arr[k++]=(L[i]<=R[j]?L[i++]:R[j++]);swp++;steps.push(makeStep(arr,{swap:new Set([k-1])},cmp,swp,t0))}
    while(i<L.length){arr[k++]=L[i++];swp++;steps.push(makeStep(arr,{swap:new Set([k-1])},cmp,swp,t0))}
    while(j<R.length){arr[k++]=R[j++];swp++;steps.push(makeStep(arr,{swap:new Set([k-1])},cmp,swp,t0))}
  }
  (function ms(lo,hi){if(lo>=hi)return;const mid=Math.floor((lo+hi)/2);ms(lo,mid);ms(mid+1,hi);merge(lo,mid,hi)})(0,arr.length-1);
  steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genHeap(arr){const steps=[];let cmp=0,swp=0;const t0=now(),n=arr.length;
  function heapify(n,i){while(true){let largest=i,l=2*i+1,r=2*i+2;
    if(l<n){cmp++;steps.push(makeStep(arr,{compare:new Set([i,l])},cmp,swp,t0));if(arr[l]>arr[largest])largest=l}
    if(r<n){cmp++;steps.push(makeStep(arr,{compare:new Set([largest,r])},cmp,swp,t0));if(arr[r]>arr[largest])largest=r}
    if(largest!==i){swp++;[arr[i],arr[largest]]=[arr[largest],arr[i]];steps.push(makeStep(arr,{swap:new Set([i,largest])},cmp,swp,t0));i=largest}else break;
  }}
  for(let i=Math.floor(n/2)-1;i>=0;i--)heapify(n,i);
  for(let end=n-1;end>0;end--){swp++;[arr[0],arr[end]]=[arr[end],arr[0]];steps.push(makeStep(arr,{swap:new Set([0,end])},cmp,swp,t0));heapify(end,0)}
  steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genShell(arr){const steps=[];let cmp=0,swp=0;const t0=now(),n=arr.length;
  for(let gap=Math.floor(n/2);gap>0;gap=Math.floor(gap/2)){
    for(let i=gap;i<n;i++){const temp=arr[i];let j=i;
      while(j>=gap){cmp++;steps.push(makeStep(arr,{compare:new Set([j,j-gap])},cmp,swp,t0));if(arr[j-gap]<=temp)break;
        arr[j]=arr[j-gap];swp++;steps.push(makeStep(arr,{swap:new Set([j,j-gap])},cmp,swp,t0));j-=gap}
      arr[j]=temp;swp++;steps.push(makeStep(arr,{swap:new Set([j])},cmp,swp,t0));
    }
  } steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genCocktail(arr){const steps=[];let cmp=0,swp=0;const t0=now();let start=0,end=arr.length-1,swapped=true;
  while(swapped){swapped=false;
    for(let i=start;i<end;i++){cmp++;steps.push(makeStep(arr,{compare:new Set([i,i+1])},cmp,swp,t0));
      if(arr[i]>arr[i+1]){swp++;[arr[i],arr[i+1]]=[arr[i+1],arr[i]];swapped=true;steps.push(makeStep(arr,{swap:new Set([i,i+1])},cmp,swp,t0))}
    } if(!swapped)break;swapped=false;end--;
    for(let i=end;i>start;i--){cmp++;steps.push(makeStep(arr,{compare:new Set([i-1,i])},cmp,swp,t0));
      if(arr[i-1]>arr[i]){swp++;[arr[i-1],arr[i]]=[arr[i],arr[i-1]];swapped=true;steps.push(makeStep(arr,{swap:new Set([i-1,i])},cmp,swp,t0))}
    } start++;
  } steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genComb(arr){const steps=[];let cmp=0,swp=0;const t0=now();const shrink=1.3;let gap=arr.length,swapped=true;
  while(gap>1||swapped){gap=Math.floor(gap/shrink);if(gap<1)gap=1;swapped=false;
    for(let i=0;i+gap<arr.length;i++){cmp++;steps.push(makeStep(arr,{compare:new Set([i,i+gap])},cmp,swp,t0));
      if(arr[i]>arr[i+gap]){swp++;[arr[i],arr[i+gap]]=[arr[i+gap],arr[i]];swapped=true;steps.push(makeStep(arr,{swap:new Set([i,i+gap])},cmp,swp,t0))}
    }
  } steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genCounting(arr){const steps=[];let cmp=0,swp=0;const t0=now();const minV=Math.min(...arr),maxV=Math.max(...arr),k=maxV-minV+1,count=new Array(k).fill(0);
  for(let i=0;i<arr.length;i++){count[arr[i]-minV]++;swp++;steps.push(makeStep(arr,{compare:new Set([i])},cmp,swp,t0))}
  let idx=0;for(let v=0;v<k;v++)while(count[v]-->0){arr[idx]=v+minV;swp++;steps.push(makeStep(arr,{swap:new Set([idx])},cmp,swp,t0));idx++}
  steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genRadix(arr){const steps=[];let cmp=0,swp=0;const t0=now();const vals=arr.map(v=>Math.floor(v*10));let exp=1;
  function pass(exp){const out=new Array(vals.length),count=new Array(10).fill(0);
    for(let i=0;i<vals.length;i++){const d=Math.floor(vals[i]/exp)%10;count[d]++;cmp++;steps.push(makeStep(arr,{compare:new Set([i])},cmp,swp,t0))}
    for(let i=1;i<10;i++)count[i]+=count[i-1];
    for(let i=vals.length-1;i>=0;i--){const d=Math.floor(vals[i]/exp)%10;out[--count[d]]=vals[i]}
    for(let i=0;i<vals.length;i++){vals[i]=out[i];arr[i]=clamp(Math.round(vals[i]/10),8,100);swp++;steps.push(makeStep(arr,{swap:new Set([i])},cmp,swp,t0))}
  }
  let maxv=Math.max(...vals);while(Math.floor(maxv/exp)>0){pass(exp);exp*=10}
  steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}
function genTimMini(arr){const steps=[];let cmp=0,swp=0;const t0=now(),n=arr.length,RUN=16;
  function insertion(lo,hi){for(let i=lo+1;i<=hi;i++){const key=arr[i];let j=i-1;
    while(j>=lo){cmp++;steps.push(makeStep(arr,{compare:new Set([j,j+1])},cmp,swp,t0));if(arr[j]<=key)break;arr[j+1]=arr[j];swp++;steps.push(makeStep(arr,{swap:new Set([j,j+1])},cmp,swp,t0));j--}
    arr[j+1]=key;swp++;steps.push(makeStep(arr,{swap:new Set([j+1])},cmp,swp,t0))}}
  function merge(lo,mid,hi){const L=arr.slice(lo,mid+1),R=arr.slice(mid+1,hi+1);let i=0,j=0,k=lo;
    while(i<L.length&&j<R.length){cmp++;steps.push(makeStep(arr,{compare:new Set([k])},cmp,swp,t0));arr[k++]=(L[i]<=R[j]?L[i++]:R[j++]);swp++;steps.push(makeStep(arr,{swap:new Set([k-1])},cmp,swp,t0))}
    while(i<L.length){arr[k++]=L[i++];swp++;steps.push(makeStep(arr,{swap:new Set([k-1])},cmp,swp,t0))}
    while(j<R.length){arr[k++]=R[j++];swp++;steps.push(makeStep(arr,{swap:new Set([k-1])},cmp,swp,t0))}}
  for(let i=0;i<n;i+=RUN)insertion(i,Math.min(i+RUN-1,n-1));
  for(let size=RUN;size<n;size*=2)for(let lo=0;lo<n;lo+=2*size){const mid=lo+size-1,hi=Math.min(lo+2*size-1,n-1);if(mid<hi)merge(lo,mid,hi)}
  steps.push(makeStep(arr,null,cmp,swp,t0,true));return steps;
}

init();
