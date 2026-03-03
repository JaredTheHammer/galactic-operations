/**
 * build-combat-arena.mjs
 *
 * Bundles the combat engine into a standalone HTML page that works
 * without a dev server. Opens in any browser.
 *
 * Usage:  node scripts/build-combat-arena.mjs
 * Output: reports/combat-arena.html
 */

import * as esbuild from 'esbuild'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

async function build() {
  const entryPoint = path.join(ROOT, 'packages/engine/src/combat-arena-entry.ts')

  await fs.writeFile(entryPoint, `
// Auto-generated entry for combat-arena standalone build
// NOTE: data-loader.ts uses Node fs/path, so we skip it here.
// The standalone page loads data inline via GAME_DATA_RAW.
export { runCombatWithReplay } from './replay-combat.js'
export { loadAIProfiles } from './ai/decide-v2.js'
`)

  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    globalName: 'CombatEngine',
    platform: 'browser',
    target: 'es2020',
    write: false,
    minify: false,
    external: [],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })

  const engineJs = result.outputFiles[0].text
  await fs.unlink(entryPoint).catch(() => {})

  const dataDir = path.join(ROOT, 'data')

  const [
    diceD6, imperialsNpc, weaponsV2, armor, species, careers,
    aiProfiles,
    mercenary, smuggler, droidTech, forceAdept, tactician, assassin,
    openGround, corridorComplex, commandCenter, storageBay, landingPad, barracks,
  ] = await Promise.all([
    fs.readFile(path.join(dataDir, 'dice-d6.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'npcs/imperials.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'weapons-v2.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'armor.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'species.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'careers.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'ai-profiles.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/mercenary.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/smuggler.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/droid-tech.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/force-adept.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/tactician.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/assassin.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/open-ground.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/corridor-complex.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/command-center.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/storage-bay.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/landing-pad.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/barracks.json'), 'utf-8'),
  ])

  const data = {
    diceD6, imperialsNpc, weaponsV2, armor, species, careers,
    aiProfiles,
    mercenary, smuggler, droidTech, forceAdept, tactician, assassin,
    openGround, corridorComplex, commandCenter, storageBay, landingPad, barracks,
  }

  const html = buildHTML(engineJs, data)

  const outDir = path.join(ROOT, 'reports')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'combat-arena.html')
  await fs.writeFile(outPath, html, 'utf-8')

  console.log('Built: ' + outPath)
  console.log('Size: ' + (html.length / 1024).toFixed(0) + ' KB')
}

function buildHTML(engineJs, data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Galactic Operations - Combat Arena</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a0f; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
#app { width: 100vw; height: 100vh; }

#setup-panel {
  max-width: 900px; margin: 20px auto; padding: 24px;
  background: rgba(19,19,32,0.98); border: 2px solid #4a9eff;
  border-radius: 12px; overflow-y: auto; max-height: calc(100vh - 40px);
}
.setup-title { font-size: 28px; font-weight: bold; color: #ffd700; text-align: center; margin-bottom: 4px; }
.setup-subtitle { font-size: 12px; color: #888; text-align: center; margin-bottom: 20px; }
.sides-row { display: flex; gap: 16px; margin-bottom: 16px; }
.side-panel { flex: 1; border: 2px solid #333; border-radius: 8px; padding: 12px; }
.side-panel.sideA { border-color: rgba(255,68,68,0.4); }
.side-panel.sideB { border-color: rgba(68,255,68,0.4); }
.side-label { font-size: 13px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; }
.side-label.sideA { color: #ff6666; }
.side-label.sideB { color: #66ff66; }
.npc-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.03); border-radius: 4px; font-size: 12px; }
.npc-row .npc-name { flex: 1; }
.npc-row .npc-stats { color: #888; font-size: 10px; margin-right: 8px; }
.count-ctrl { display: flex; align-items: center; gap: 4px; }
.count-ctrl button { width: 22px; height: 22px; border: 1px solid #555; background: #1a1a2e; color: #fff; border-radius: 3px; cursor: pointer; font-size: 14px; line-height: 1; }
.count-ctrl button:hover { background: #333; }
.count-ctrl .count-val { width: 20px; text-align: center; font-weight: bold; }
.config-row { display: flex; gap: 16px; margin-bottom: 12px; }
.config-group { flex: 1; }
.config-group label { display: block; font-size: 11px; color: #4a9eff; text-transform: uppercase; font-weight: bold; margin-bottom: 6px; }
.config-group select, .config-group input { width: 100%; padding: 6px 8px; background: #1a1a2e; border: 1px solid #333; border-radius: 4px; color: #fff; font-size: 12px; }
.btn-start { width: 100%; padding: 12px; background: #ffd700; color: #000; border: none; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; margin-top: 8px; }
.btn-start:hover { background: #ffed4a; }

#watch-panel { display: flex; flex-direction: column; height: 100vh; }
.watch-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: rgba(19,19,32,0.95); border-bottom: 1px solid #333; }
.watch-header .scenario-name { font-size: 16px; font-weight: bold; color: #ffd700; }
.watch-header .round-info { font-size: 13px; color: #4a9eff; }
.watch-body { display: flex; flex: 1; overflow: hidden; }
.canvas-wrap { flex: 1; overflow: auto; background: #0a0a0f; }
.combat-log-panel { width: 260px; background: rgba(19,19,32,0.95); border-left: 1px solid #333; overflow-y: auto; padding: 8px; font-size: 11px; }
.log-entry { padding: 3px 6px; border-radius: 3px; margin-bottom: 2px; }
.log-entry.round { color: #ffd700; font-weight: bold; }
.log-entry.attack { color: #ff6666; }
.log-entry.move { color: #4a9eff; }
.log-entry.phase { color: #888; }
.log-entry.victory { color: #ffd700; font-weight: bold; font-size: 13px; }
.watch-controls { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: rgba(19,19,32,0.95); border-top: 1px solid #333; flex-wrap: wrap; }
.watch-controls button { padding: 6px 12px; background: #1a1a2e; border: 1px solid #555; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.watch-controls button:hover { background: #333; }
.watch-controls button.active { background: #4a9eff; color: #000; border-color: #4a9eff; }
.watch-controls .frame-slider { flex: 1; min-width: 100px; }
.watch-controls .frame-info { font-size: 11px; color: #888; min-width: 70px; text-align: right; }
@keyframes arena-spin { to { transform: rotate(360deg); } }
.spinner { width: 48px; height: 48px; border: 4px solid #1a1a2e; border-top-color: #ffd700; border-radius: 50%; animation: arena-spin 0.8s linear infinite; margin: 0 auto 16px; }
</style>
</head>
<body>
<div id="app">
  <div id="setup-phase">
    <div id="setup-panel">
      <div class="setup-title">COMBAT ARENA</div>
      <div class="setup-subtitle">Galactic Operations - Build & Watch Custom Battles</div>
      <div class="sides-row">
        <div class="side-panel sideA">
          <div class="side-label sideA">Side A: <input id="labelA" value="Imperial" style="background:transparent;border:none;color:#ff6666;font-size:13px;font-weight:bold;width:120px;"></div>
          <div id="npcs-a"></div>
        </div>
        <div class="side-panel sideB">
          <div class="side-label sideB">Side B: <input id="labelB" value="Rebel" style="background:transparent;border:none;color:#66ff66;font-size:13px;font-weight:bold;width:120px;"></div>
          <div id="npcs-b"></div>
        </div>
      </div>
      <div class="config-row">
        <div class="config-group"><label>Arena Size</label><select id="arena-size"><option value="tiny">Tiny (12x12)</option><option value="small" selected>Small (24x24)</option><option value="medium">Medium (36x36)</option></select></div>
        <div class="config-group"><label>Cover Density</label><select id="arena-cover"><option value="none">None</option><option value="light" selected>Light</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option></select></div>
        <div class="config-group"><label>Seed</label><input id="arena-seed" type="number" min="1" value=""></div>
      </div>
      <button class="btn-start" id="btn-start">START COMBAT</button>
    </div>
  </div>
  <div id="running-phase" style="display:none;width:100%;height:100vh;justify-content:center;align-items:center;flex-direction:column;">
    <div class="spinner"></div>
    <div style="color:#ffd700;font-size:18px;font-weight:bold;">Running combat...</div>
  </div>
  <div id="watch-phase" style="display:none;">
    <div id="watch-panel">
      <div class="watch-header"><div><span class="scenario-name" id="w-scenario"></span><span style="margin-left:12px;font-size:12px;color:#888;" id="w-sides"></span></div><div class="round-info" id="w-round"></div></div>
      <div class="watch-body"><div class="canvas-wrap"><canvas id="arena-canvas"></canvas></div><div class="combat-log-panel" id="combat-log"></div></div>
      <div class="watch-controls">
        <button id="btn-prev">Prev</button><button id="btn-play">Play</button><button id="btn-next">Next</button>
        <span style="margin:0 4px;color:#555;">|</span>
        <button id="btn-slow">Slow</button><button id="btn-normal" class="active">Normal</button><button id="btn-fast">Fast</button><button id="btn-instant">Instant</button>
        <input type="range" id="frame-slider" class="frame-slider" min="0" max="0" value="0">
        <span class="frame-info" id="frame-info">0/0</span>
        <span style="margin:0 4px;color:#555;">|</span>
        <button id="btn-back-setup">Back</button><button id="btn-run-again">New Seed</button>
      </div>
    </div>
  </div>
</div>
<script>
var GAME_DATA_RAW={diceD6:${data.diceD6},imperialsNpc:${data.imperialsNpc},weaponsV2:${data.weaponsV2},armor:${data.armor},species:${data.species},careers:${data.careers},aiProfiles:${data.aiProfiles},specializations:{mercenary:${data.mercenary},smuggler:${data.smuggler},droidTech:${data.droidTech},forceAdept:${data.forceAdept},tactician:${data.tactician},assassin:${data.assassin}},boardTemplates:[${data.openGround},${data.corridorComplex},${data.commandCenter},${data.storageBay},${data.landingPad},${data.barracks}]};
</script>
<script>${engineJs}</script>
<script>
(function(){
  function loadGameData(){var r=GAME_DATA_RAW,np={},nr=r.imperialsNpc.npcs||r.imperialsNpc;for(var e of Object.entries(nr))np[e[0]]=e[1];var wp={},wr=r.weaponsV2.weapons||r.weaponsV2;for(var e of Object.entries(wr))wp[e[0]]=e[1];var ar={},arr=r.armor.armor||r.armor;for(var e of Object.entries(arr))ar[e[0]]=e[1];var sp={},sr=r.species.species||r.species;for(var e of Object.entries(sr))sp[e[0]]=e[1];var cr={},crr=r.careers.careers||r.careers;for(var e of Object.entries(crr))cr[e[0]]=e[1];var specs={};for(var e of Object.entries(r.specializations)){if(e[1].specialization){var sd=e[1].specialization;specs[sd.id]=Object.assign({},sd,{talents:e[1].talents||[]})}}var dice=r.diceD6.dieTypes||r.diceD6;return{dice:dice,species:sp,careers:cr,specializations:specs,weapons:wp,armor:ar,npcProfiles:np}}
  var gd=loadGameData(),bt=GAME_DATA_RAW.boardTemplates,pd=CombatEngine.loadAIProfiles(GAME_DATA_RAW.aiProfiles);
  var NPC_IDS=Object.keys(gd.npcProfiles),sc={A:{},B:{}};
  NPC_IDS.forEach(function(id){sc.A[id]=0;sc.B[id]=0});
  function renderNPCs(cid,side){var el=document.getElementById(cid);el.innerHTML='';NPC_IDS.forEach(function(nid){var npc=gd.npcProfiles[nid];var row=document.createElement('div');row.className='npc-row';row.innerHTML='<span class="npc-name">'+(npc.name||nid)+'</span><span class="npc-stats">W:'+(npc.woundThreshold||'?')+' S:'+(npc.soak||0)+'</span><div class="count-ctrl"><button data-action="dec" data-side="'+side+'" data-npc="'+nid+'">-</button><span class="count-val" id="count-'+side+'-'+nid+'">'+sc[side][nid]+'</span><button data-action="inc" data-side="'+side+'" data-npc="'+nid+'">+</button></div>';el.appendChild(row)})}
  document.addEventListener('click',function(e){var b=e.target.closest('[data-action]');if(!b)return;var a=b.dataset.action,s=b.dataset.side,n=b.dataset.npc;if(a==='inc'&&sc[s][n]<5)sc[s][n]++;if(a==='dec'&&sc[s][n]>0)sc[s][n]--;document.getElementById('count-'+s+'-'+n).textContent=sc[s][n]});
  renderNPCs('npcs-a','A');renderNPCs('npcs-b','B');
  sc.A['stormtrooper']=3;sc.B['stormtrooper']=2;
  var cA=document.getElementById('count-A-stormtrooper');if(cA)cA.textContent='3';
  var cB=document.getElementById('count-B-stormtrooper');if(cB)cB.textContent='2';
  document.getElementById('arena-seed').value=Math.floor(Math.random()*99999)+1;
  function buildScenario(){var lA=document.getElementById('labelA').value||'Side A',lB=document.getElementById('labelB').value||'Side B',preset=document.getElementById('arena-size').value,cover=document.getElementById('arena-cover').value,seed=parseInt(document.getElementById('arena-seed').value)||1,fA=[],fB=[];NPC_IDS.forEach(function(nid){if(sc.A[nid]>0)fA.push({type:'npc',npcId:nid,count:sc.A[nid]});if(sc.B[nid]>0)fB.push({type:'npc',npcId:nid,count:sc.B[nid]})});if(!fA.length||!fB.length){alert('Each side needs at least one unit.');return null}return{scenario:{id:'arena',name:lA+' vs '+lB,arena:{preset:preset,cover:cover},sideA:{label:lA,figures:fA},sideB:{label:lB,figures:fB},simulation:{count:1,seed:seed,roundLimit:20}},seed:seed}}
  var replay=null,cf=0,paused=true,spd=600,timer=null;
  function showPhase(n){document.getElementById('setup-phase').style.display=n==='setup'?'block':'none';document.getElementById('running-phase').style.display=n==='running'?'flex':'none';document.getElementById('watch-phase').style.display=n==='watch'?'block':'none'}
  function runCombat(config){showPhase('running');requestAnimationFrame(function(){setTimeout(function(){try{replay=CombatEngine.runCombatWithReplay(config.scenario,gd,pd,bt,config.seed);initWatch();showPhase('watch')}catch(e){alert('Error: '+e.message);showPhase('setup')}},32)})}
  document.getElementById('btn-start').addEventListener('click',function(){var c=buildScenario();if(c)runCombat(c)});
  document.getElementById('btn-back-setup').addEventListener('click',function(){stop();showPhase('setup')});
  document.getElementById('btn-run-again').addEventListener('click',function(){stop();document.getElementById('arena-seed').value=Math.floor(Math.random()*999999)+1;var c=buildScenario();if(c)runCombat(c);else showPhase('setup')});
  var TILE=28,TC={open:'#1a1a2e',wall:'#333355',cover:'#2a2a4a',difficult:'#2e1a1a',pit:'#0a0a1f',terminal:'#1a2e1a',door:'#2e2e1a'};
  function render(r,f){var cv=document.getElementById('arena-canvas'),ctx=cv.getContext('2d'),W=r.arenaWidth,H=r.arenaHeight;cv.width=W*TILE;cv.height=H*TILE;for(var y=0;y<H;y++)for(var x=0;x<W;x++){var t=r.tiles[y]&&r.tiles[y][x],tr=t?(t.terrain||t.type||'open'):'open';ctx.fillStyle=TC[tr]||'#1a1a2e';ctx.fillRect(x*TILE,y*TILE,TILE,TILE);ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.strokeRect(x*TILE,y*TILE,TILE,TILE)}
  if(f.movePath&&f.movePath.length){ctx.strokeStyle='rgba(74,158,255,0.5)';ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(f.movePath[0].x*TILE+TILE/2,f.movePath[0].y*TILE+TILE/2);for(var i=1;i<f.movePath.length;i++)ctx.lineTo(f.movePath[i].x*TILE+TILE/2,f.movePath[i].y*TILE+TILE/2);ctx.stroke();ctx.setLineDash([])}
  if(f.attackLine){var al=f.attackLine;ctx.strokeStyle='rgba(255,68,68,0.7)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(al.from.x*TILE+TILE/2,al.from.y*TILE+TILE/2);ctx.lineTo(al.to.x*TILE+TILE/2,al.to.y*TILE+TILE/2);ctx.stroke();ctx.beginPath();ctx.arc(al.to.x*TILE+TILE/2,al.to.y*TILE+TILE/2,TILE*0.4,0,Math.PI*2);ctx.stroke()}
  for(var i=0;i<f.figures.length;i++){var fg=f.figures[i],cx=fg.position.x*TILE+TILE/2,cy=fg.position.y*TILE+TILE/2,rd=TILE*0.38;if(fg.isDefeated){ctx.strokeStyle='rgba(255,0,0,0.3)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-rd,cy-rd);ctx.lineTo(cx+rd,cy+rd);ctx.moveTo(cx+rd,cy-rd);ctx.lineTo(cx-rd,cy+rd);ctx.stroke();continue}var isA=fg.side==='A';ctx.fillStyle=isA?'rgba(255,68,68,0.8)':'rgba(68,255,68,0.8)';if(fg.id===(f.executingFigureId||''))ctx.fillStyle=isA?'rgba(255,120,120,1)':'rgba(120,255,120,1)';ctx.beginPath();ctx.arc(cx,cy,rd,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.font='bold '+(TILE*0.35)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(fg.entityType==='hero'?'H':(fg.name||fg.entityId||'?')[0].toUpperCase(),cx,cy);var wt=fg.woundThreshold||5,pct=Math.max(0,1-fg.woundsCurrent/wt),bw=TILE*0.7,bh=3,bx=cx-bw/2,by=cy+rd+2;ctx.fillStyle='#333';ctx.fillRect(bx,by,bw,bh);ctx.fillStyle=pct>0.5?'#44ff44':pct>0.25?'#ffaa00':'#ff4444';ctx.fillRect(bx,by,bw*pct,bh)}}
  var logEl=document.getElementById('combat-log'),slider=document.getElementById('frame-slider'),fInfo=document.getElementById('frame-info');
  function initWatch(){cf=0;paused=true;document.getElementById('w-scenario').textContent=replay.scenarioName;document.getElementById('w-sides').textContent=replay.sideALabel+' vs '+replay.sideBLabel;slider.max=replay.frames.length-1;slider.value=0;logEl.innerHTML='';addLog(replay.frames[0].actionText);updateUI();render(replay,replay.frames[0]);updBtn()}
  function updateUI(){var f=replay.frames[cf];fInfo.textContent=(cf+1)+'/'+replay.frames.length;slider.value=cf;document.getElementById('w-round').textContent='Round '+f.roundNumber+' / '+replay.totalRounds}
  function addLog(t){var d=document.createElement('div');d.className='log-entry';if(t.startsWith('Round'))d.className+=' round';else if(t.includes('attacks'))d.className+=' attack';else if(t.includes('moves'))d.className+=' move';else if(t.includes('wins!'))d.className+=' victory';else d.className+=' phase';d.textContent=t;logEl.appendChild(d);logEl.scrollTop=logEl.scrollHeight}
  function goTo(idx){if(!replay)return;idx=Math.max(0,Math.min(replay.frames.length-1,idx));if(idx>cf)for(var i=cf+1;i<=idx;i++)addLog(replay.frames[i].actionText);else if(idx<cf){logEl.innerHTML='';for(var i=0;i<=idx;i++)addLog(replay.frames[i].actionText)}cf=idx;render(replay,replay.frames[cf]);updateUI();if(cf>=replay.frames.length-1)stop()}
  function play(){paused=false;updBtn();timer=setInterval(function(){if(cf<replay.frames.length-1)goTo(cf+1);else stop()},spd)}
  function stop(){paused=true;updBtn();if(timer){clearInterval(timer);timer=null}}
  function updBtn(){document.getElementById('btn-play').textContent=paused?'Play':'Pause'}
  document.getElementById('btn-play').addEventListener('click',function(){if(paused){if(cf>=replay.frames.length-1)goTo(0);play()}else stop()});
  document.getElementById('btn-prev').addEventListener('click',function(){stop();goTo(cf-1)});
  document.getElementById('btn-next').addEventListener('click',function(){stop();goTo(cf+1)});
  function setSpd(ms,bid){spd=ms;['btn-slow','btn-normal','btn-fast','btn-instant'].forEach(function(id){document.getElementById(id).classList.remove('active')});document.getElementById(bid).classList.add('active');if(!paused){stop();play()}}
  document.getElementById('btn-slow').addEventListener('click',function(){setSpd(1200,'btn-slow')});
  document.getElementById('btn-normal').addEventListener('click',function(){setSpd(600,'btn-normal')});
  document.getElementById('btn-fast').addEventListener('click',function(){setSpd(200,'btn-fast')});
  document.getElementById('btn-instant').addEventListener('click',function(){setSpd(0,'btn-instant');stop();goTo(replay.frames.length-1)});
  slider.addEventListener('input',function(){stop();goTo(parseInt(this.value))});
  document.addEventListener('keydown',function(e){if(document.getElementById('watch-phase').style.display==='none')return;if(e.code==='Space'){e.preventDefault();document.getElementById('btn-play').click()}if(e.code==='ArrowLeft'){e.preventDefault();stop();goTo(cf-1)}if(e.code==='ArrowRight'){e.preventDefault();stop();goTo(cf+1)}});
  showPhase('setup');
})();
</script>
</body>
</html>`
}

build().catch(function(err) {
  console.error('Build failed:', err)
  process.exit(1)
})
