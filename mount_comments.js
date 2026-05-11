const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');

// 1. 挂载 comments 路由
const target1 = "app.use('/api/client-issues', clientIssuesRouter);";
if (c.includes(target1) && !c.includes("app.use('/api/comments'")) {
  c = c.replace(target1, target1 + "\napp.use('/api/comments', commentsRouter);");
  console.log("✅ 已挂载 commentsRouter");
} else {
  console.log(c.includes("/api/comments") ? "⏭️ commentsRouter 已存在" : "⚠️ 未找到目标行");
}

fs.writeFileSync('server.js', c);
