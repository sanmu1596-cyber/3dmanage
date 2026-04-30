const fs=require("fs");const p="public/app.js";let c=fs.readFileSync(p,"utf8");c+="
// === 游戏问题模块 ===
";c+="let gameIssuesData=[];let gameIssuesPage=1;const gPS=20;async function loadGameIssues(){const r=await authFetch("/api/game-issues");gameIssuesData=await r.json();renderGameIssuesPage();}
";fs.writeFileSync(p,c,"utf8");console.log("ok");