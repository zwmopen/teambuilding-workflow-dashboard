# 架构

```text
项目推进（素材/模板/成品/生产记录/发布空间）
              ↓ 只读为主
工具开发/teambuilding-workflow-dashboard/src
              ↕
运行数据/江湖有旅人/图文生产控制台
              ↑
AI/skills/技能包/技能
  ├─ teambuilding-xhs-workflow（生产方法）
  └─ device-folder-transfer（分发执行与安全规则）
```

`server.js` 提供本地 HTTP API、静态页面和分发 Skill 的白名单调用；`lib/juguang-data.js` 负责聚光数据读取；`lib/distribution-data.js` 从 Junction 和 CSV 日志计算作品集状态；`public/` 是左侧工作流控制台；`mcp/` 保留聚光数据调用入口。

手机发送、接收确认、删除和归档 Junction 不在工作台中重写，而是调用 `device-folder-transfer/scripts/restock_device.py`。工作台只负责输入校验、用户确认、结果呈现和状态刷新。
