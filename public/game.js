(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const overlay = $("overlay"), status = $("statusText"), dot = document.querySelector(".connection");
  const keys = { up:false, down:false, left:false, right:false };
  let ws, myId = null, joined = false, world = {width:1600,height:1100}, players = [], mobs = [];
  let camera = {x:0,y:0}, noticeTimer = 0, noticeText = "";
  const tile = 32;
  function log(text) {
    const node = document.createElement("p"); node.textContent = text;
    $("log").prepend(node);
    while ($("log").children.length > 18) $("log").lastChild.remove();
  }
  function setStatus(text, online=false) { status.textContent=text; dot.classList.toggle("online",online); }
  function connect(name) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}`);
    ws.onopen = () => { setStatus("已連線",true); ws.send(JSON.stringify({type:"hello",name})); };
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === "welcome") { myId=msg.id; joined=true; overlay.classList.add("hidden"); $("attackBtn").disabled=false; log("成功進入世界，祝你冒險愉快！"); }
      if (msg.type === "notice") { showNotice(msg.text); log(msg.text); }
      if (msg.type === "state") { world=msg.world; players=msg.players; mobs=msg.mobs; updateUI(); }
    };
    ws.onclose = () => { setStatus("已斷線"); $("attackBtn").disabled=true; if(joined) log("與伺服器中斷連線，請重新整理頁面。"); };
    ws.onerror = () => setStatus("連線錯誤");
  }
  function showNotice(text) { noticeText=text; noticeTimer=2.2; }
  $("joinForm").addEventListener("submit", e => { e.preventDefault(); if(ws && ws.readyState===WebSocket.OPEN)return; connect($("playerName").value.trim() || "勇者"); });
  function sendInput() { if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:"input",keys})); }
  // Hosting platforms may idle-sleep after no inbound traffic; send a lightweight heartbeat every 30 seconds.
  setInterval(() => { if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:"heartbeat", at:Date.now()})); }, 30000);
  function attack() { if(joined && ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:"attack"})); }
  $("attackBtn").addEventListener("click",attack);
  window.addEventListener("keydown", e => {
    const k=e.key.toLowerCase();
    if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    if(k==="w"||k==="arrowup")keys.up=true;
    if(k==="s"||k==="arrowdown")keys.down=true;
    if(k==="a"||k==="arrowleft")keys.left=true;
    if(k==="d"||k==="arrowright")keys.right=true;
    if(k===" " && !e.repeat) attack();
    sendInput();
  });
  window.addEventListener("keyup", e => {
    const k=e.key.toLowerCase();
    if(k==="w"||k==="arrowup")keys.up=false;
    if(k==="s"||k==="arrowdown")keys.down=false;
    if(k==="a"||k==="arrowleft")keys.left=false;
    if(k==="d"||k==="arrowright")keys.right=false;
    sendInput();
  });
  window.addEventListener("blur",()=>{Object.keys(keys).forEach(k=>keys[k]=false);sendInput();});
  function updateUI() {
    $("playerCount").textContent=`${players.length} / 10`;
    const me=players.find(p=>p.id===myId);
    $("playerList").innerHTML="";
    players.forEach(p=>{
      const row=document.createElement("div");row.className="player-row";
      const dot=document.createElement("i");dot.className="player-dot";
      const name=document.createElement("span");name.textContent=p.name+(p.id===myId?"（你）":"");
      const level=document.createElement("small");level.textContent=`Lv.${p.level}`;
      row.append(dot,name,level);$("playerList").append(row);
    });
    if(!players.length)$("playerList").innerHTML='<p class="muted">等待連線…</p>';
    if(me){
      $("charName").textContent=me.name;$("charLevel").textContent=`Lv. ${me.level} 新手冒險者`;
      $("hpText").textContent=`${Math.ceil(me.hp)} / ${me.maxHp}`;$("hpBar").style.width=`${Math.max(0,me.hp/me.maxHp*100)}%`;
      $("expText").textContent=`${me.exp} / ${me.level*30}`;$("expBar").style.width=`${Math.min(100,me.exp/(me.level*30)*100)}%`;
    }
  }
  function hash(x,y){let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);}
  function drawWorld() {
    const sx=Math.floor(camera.x/tile), sy=Math.floor(camera.y/tile);
    const ex=sx+Math.ceil(canvas.width/tile)+2, ey=sy+Math.ceil(canvas.height/tile)+2;
    for(let y=sy;y<ey;y++)for(let x=sx;x<ex;x++){
      const px=x*tile-camera.x, py=y*tile-camera.y, h=hash(x,y);
      ctx.fillStyle=h>.82?"#2c583d":h>.55?"#2a533a":"#285037";ctx.fillRect(px,py,tile,tile);
      if(h>.94){ctx.fillStyle="#376746";ctx.fillRect(px+7,py+8,3,3);ctx.fillRect(px+22,py+20,3,3);}
    }
    // Winding village path
    ctx.fillStyle="#9a8054";
    for(let y=0;y<world.height;y+=tile){
      const pathX=150+Math.sin(y/155)*90;
      ctx.fillRect(pathX-camera.x,y-camera.y,72,tile);
    }
    ctx.fillRect(130-camera.x,180-camera.y,300,68);
    ctx.fillRect(420-camera.x,370-camera.y,150,56);
    // path details
    for(let y=0;y<world.height;y+=tile){const px=150+Math.sin(y/155)*90-camera.x;ctx.fillStyle="#b59a68";ctx.fillRect(px+10,y-camera.y,3,3);ctx.fillRect(px+53,y-camera.y+19,3,3);}
    // Trees as simple pixel art, avoid main spawn and path
    for(let y=60;y<world.height;y+=96)for(let x=60;x<world.width;x+=96){
      const h=hash(x/96,y/96);
      if(h>.48 && Math.abs(x-(150+Math.sin(y/155)*90))>100 && !(x<380&&y<310)){
        const px=x-camera.x,py=y-camera.y;
        ctx.fillStyle="#513c2d";ctx.fillRect(px+11,py+17,10,17);
        ctx.fillStyle="#153d2b";ctx.fillRect(px+2,py+2,29,24);
        ctx.fillStyle="#1e5736";ctx.fillRect(px+7,py-4,19,23);
        ctx.fillStyle="#2c7042";ctx.fillRect(px+11,py+2,7,6);
      }
    }
    // Small houses at village
    drawHouse(205,160,"#a54e45");drawHouse(300,168,"#5379a0");
  }
  function drawHouse(x,y,roof){
    const px=x-camera.x,py=y-camera.y;
    ctx.fillStyle="#d9c69a";ctx.fillRect(px,py+18,54,40);
    ctx.fillStyle=roof;ctx.fillRect(px-5,py+7,64,18);ctx.fillRect(px+4,py,46,8);
    ctx.fillStyle="#5b4030";ctx.fillRect(px+22,py+35,12,23);
    ctx.fillStyle="#9dd9e8";ctx.fillRect(px+6,py+28,10,10);ctx.fillRect(px+39,py+28,9,10);
  }
  function drawMob(m){
    const x=m.x-camera.x,y=m.y-camera.y;
    if(x<-50||y<-50||x>canvas.width+50||y>canvas.height+50)return;
    if(!m.alive){ctx.fillStyle="#b7d6bc";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText("重生中…",x,y);return;}
    ctx.fillStyle="#152a1b";ctx.fillRect(x-13,y+8,26,5);
    ctx.fillStyle="#78d65e";ctx.fillRect(x-14,y-9,28,19);ctx.fillRect(x-9,y-15,18,8);
    ctx.fillStyle="#b7f58d";ctx.fillRect(x-8,y-12,5,4);
    ctx.fillStyle="#15331d";ctx.fillRect(x-7,y-4,4,5);ctx.fillRect(x+4,y-4,4,5);
    ctx.fillStyle="#e7f3d0";ctx.fillRect(x-5,y+3,10,2);
    ctx.fillStyle="#d8e7d5";ctx.fillRect(x-15,y-23,30,4);
    ctx.fillStyle="#e46f67";ctx.fillRect(x-15,y-23,30*(m.hp/m.maxHp),4);
    ctx.fillStyle="#f1f6e8";ctx.font="10px sans-serif";ctx.textAlign="center";ctx.fillText("史萊姆",x,y-28);
  }
  function drawPlayer(p){
    const x=p.x-camera.x,y=p.y-camera.y;
    if(x<-40||y<-60||x>canvas.width+40||y>canvas.height+60)return;
    ctx.fillStyle="#14251c";ctx.fillRect(x-10,y+10,20,5);
    // body / boots / face / hair: deliberately crisp pixel blocks
    ctx.fillStyle="#3b2e28";ctx.fillRect(x-8,y+5,6,8);ctx.fillRect(x+2,y+5,6,8);
    ctx.fillStyle=p.id===myId?"#5cd69b":"#7db8ef";ctx.fillRect(x-10,y-9,20,17);
    ctx.fillStyle="#f1c69b";ctx.fillRect(x-7,y-21,14,14);
    ctx.fillStyle="#49372c";ctx.fillRect(x-8,y-24,16,6);ctx.fillRect(x-9,y-19,4,7);
    ctx.fillStyle="#342a27";ctx.fillRect(x-4,y-15,3,3);ctx.fillRect(x+3,y-15,3,3);
    ctx.fillStyle="#e9f5f0";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(p.name+(p.id===myId?" ★":""),x,y-31);
    ctx.fillStyle="#17241f";ctx.fillRect(x-15,y-38,30,4);ctx.fillStyle="#ed7774";ctx.fillRect(x-15,y-38,30*Math.max(0,p.hp/p.maxHp),4);
    if(Date.now()<p.attackUntil){ctx.strokeStyle="#ffe08a";ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,35,-.8,.8);ctx.stroke();}
  }
  function frame(){
    const me=players.find(p=>p.id===myId);
    if(me){camera.x=Math.max(0,Math.min(world.width-canvas.width,me.x-canvas.width/2));camera.y=Math.max(0,Math.min(world.height-canvas.height,me.y-canvas.height/2));}
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawWorld();
    mobs.forEach(drawMob);
    players.slice().sort((a,b)=>a.y-b.y).forEach(drawPlayer);
    // HUD map labels
    ctx.fillStyle="#102019cc";ctx.fillRect(12,12,170,27);
    ctx.fillStyle="#e5f4e8";ctx.font="12px sans-serif";ctx.textAlign="left";ctx.fillText("新手村・綠野森林",22,30);
    if(noticeTimer>0){noticeTimer-=1/60;ctx.font="bold 14px sans-serif";ctx.textAlign="center";const w=ctx.measureText(noticeText).width+36;ctx.fillStyle="#14231fe8";ctx.fillRect(canvas.width/2-w/2,canvas.height-54,w,34);ctx.fillStyle="#ffe6a8";ctx.fillText(noticeText,canvas.width/2,canvas.height-33);}
    requestAnimationFrame(frame);
  }
  frame();
})();