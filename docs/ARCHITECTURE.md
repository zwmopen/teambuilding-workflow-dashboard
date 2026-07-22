# 架构

```text
项目推进（素材/模板/成品/生产记录）
              ↓ 只读为主
工具开发/teambuilding-workflow-dashboard/src
              ↕
运行数据/江湖有旅人/图文生产控制台
              ↑
AI/skills/技能包/技能/teambuilding-xhs-workflow（方法与路由）
```

`server.js` 提供本地 HTTP API 和静态页面；`lib/juguang-data.js` 负责聚光数据读取；`public/` 是三栏式控制台前端；`mcp/` 保留聚光数据调用入口。
