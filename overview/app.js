import {createSphere, basis} from './earth.js';
const stage = document.querySelector('.stage');
const panels = [...document.querySelectorAll('.panel')];
const cabin = document.querySelector('.cabin');
const grid = document.querySelector('.seat-grid');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
for (const label of ['A','C','','D','F']) {
  const item = document.createElement('span'); item.textContent = label; grid.append(item);
}
for (let row = 1; row <= 22; row++) {
  for (const column of ['A','C','','D','F']) {
    const item = document.createElement('span');
    if (column) { item.className = 'seat'; item.dataset.seat = `${row}${column}`; }
    else item.textContent = String(row).padStart(2,'0');
    grid.append(item);
  }
}
const seat = document.querySelector('[data-seat="21A"]');
const paint = createSphere(document.querySelector('#sphere'));
const times = [0,4200,11500,16600,27000,32000];
let elapsed = 0, previous = 0, active = window.parent === window, lastStep = -1, frame;
let lastMinute = -1;
const clamp = value => Math.max(0,Math.min(1,value));
const smooth = value => {const t=clamp(value);return t*t*(3-2*t);};
// Damped motion preserves a small settling overshoot similar to EasingWizard Elastic.
// Snapshot coordinates written by the native MapKit capture, normalized to its 1600 × 1000 canvas.
const route = document.querySelector('.route-path');
let mapPoints = [[78,695],[1473,290]];
fetch('assets/route.json').then(r=>r.json()).then(points=>{mapPoints=points;drawRoute();}).catch(()=>drawRoute());
function drawRoute() {
  const [a,b]=mapPoints;
  const d=`M${a[0]} ${a[1]} Q${(a[0]+b[0])/2} ${(a[1]+b[1])/2-70} ${b[0]} ${b[1]}`;
  document.querySelectorAll('.satellite-route>path').forEach(path=>path.setAttribute('d',d));
  for (const [selector,p] of [['.origin',a],['.destination',b]]) {
    const circle=document.querySelector(selector);circle.setAttribute('cx',p[0]);circle.setAttribute('cy',p[1]);
  }
  for (const [selector,p] of [['.from-label',a],['.to-label',b]]) {
    const label=document.querySelector(selector);label.setAttribute('x',p[0]+12);label.setAttribute('y',p[1]+24);
  }
}
drawRoute();
function render(time) {
  let step = times.findIndex((end,index)=>index>0&&time<end)-1;
  if(step<0)step=4;
  if(step!==lastStep) {
    stage.dataset.step=String(step);
    panels.forEach((panel,index)=>{panel.classList.toggle('active',index===step);panel.inert=index!==step;});
    lastStep=step;
  }
  const t=time-times[step];
  const selecting=step===1;
  const scroll=smooth((t-500)/2200);
  const mobile=innerWidth<650;
  cabin.style.transform=`translateY(${15-scroll*(mobile?1240:1430)}px)`;
  stage.classList.toggle('category-open',selecting&&t>3000&&t<5400);
  stage.classList.toggle('confirmed',selecting&&t>5500);
  seat.classList.toggle('chosen',selecting&&t>2800);
  seat.textContent=selecting&&t>5000?'▤':'';
  document.querySelector('.category-tags .read').classList.toggle('picked',selecting&&t>4500);
  if(selecting&&t>6600)cabin.style.transform=`translateY(${-1430-smooth((t-6600)/700)*700}px)`;
  stage.classList.toggle('printing',step===2&&t<2100);
  const ticket=document.querySelector('.ticket');
  const stub=document.querySelector('.stub');
  const tear=smooth((t-3200)/650);
  stub.style.transform=step===2?`translate(${tear*70}px,${tear*180}px) rotate(${tear*20}deg)`:'none';
  stub.style.opacity=step===2?String(1-tear):'1';
  ticket.style.rotate=step===2?`${t>3200?-3*Math.sin(clamp((t-3200)/1100)*Math.PI)*Math.exp(-clamp((t-3200)/1100)*2):0}deg`:'0deg';
  if(step===3) {
    const progress=smooth(t/10400);
    const length=route.getTotalLength();
    const point=route.getPointAtLength(length*progress);
    const ahead=route.getPointAtLength(Math.min(length,length*progress+2));
    const behind=route.getPointAtLength(Math.max(0,length*progress-2));
    document.querySelector('.plane-marker').setAttribute('transform',`translate(${point.x} ${point.y}) rotate(${Math.atan2(ahead.y-behind.y,ahead.x-behind.x)*180/Math.PI+90})`);
    const travelled=document.querySelector('.route-travelled');
    travelled.style.strokeDasharray=`${length*progress} ${length}`;
    const minutes=Math.ceil(150*(1-progress));
    if(minutes!==lastMinute) {
      const remaining=document.querySelector('#remaining');
      remaining.innerHTML=`${Math.floor(minutes/60)} <em>h</em> ${String(minutes%60).padStart(2,'0')} <em>min</em>`;
      document.querySelector('#distance').innerHTML=`${Math.round(1760*(1-progress)).toLocaleString('en-US')} <em>km</em>`;
      lastMinute=minutes;
    }
    document.querySelector('.satellite-world').style.transform=`scale(${1.08+Math.sin(progress*Math.PI)*.12}) translateX(${(0.5-progress)*3}%)`;
  }
  const size=document.querySelector('.globe').clientWidth;
  if(step!==3)paint(basis(30,128+Math.sin(time/10000)*3),false,{diameter:size,scale:1,left:0,top:0,width:size,height:size,roll:0});
}
function tick(now) {
  if(active&&!document.hidden) {
    elapsed+=Math.min(50,now-previous||0);
    if(elapsed>=times.at(-1))elapsed=0;
    render(elapsed);
  }
  previous=now;
  frame=requestAnimationFrame(tick);
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='overview-active')return;
  if(event.data.active&&!active){elapsed=0;lastStep=-1;}
  active=Boolean(event.data.active);
});
window.addEventListener('wheel',event=>{
  if(parent!==window&&!event.ctrlKey)parent.postMessage({type:'overview-scroll',delta:event.deltaY},location.origin);
},{passive:true});
let touchY;
window.addEventListener('touchstart',event=>{touchY=event.touches[0]?.clientY;},{passive:true});
window.addEventListener('touchmove',event=>{
  if(touchY===undefined||parent===window)return;
  const y=event.touches[0].clientY;parent.postMessage({type:'overview-scroll',delta:touchY-y},location.origin);touchY=y;
},{passive:true});
window.addEventListener('keydown',event=>{
  if(parent!==window&&['ArrowUp','PageUp','ArrowDown','PageDown'].includes(event.key))parent.postMessage({type:'overview-scroll',delta:event.key.includes('Up')?-80:80},location.origin);
});
console.assert(document.querySelectorAll('.seat').length===88,'Original cabin has 22 rows of four seats');
console.assert(panels.length===5,'Five stages required');
render(0);
if(reduced.matches) {
  // Reduced motion keeps the same automatic sequence using discrete frames.
  setInterval(()=>{if(active&&!document.hidden){elapsed=(elapsed+1000)%32000;render(elapsed);}},1000);
} else frame=requestAnimationFrame(tick);
