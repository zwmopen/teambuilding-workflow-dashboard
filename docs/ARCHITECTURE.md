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

`server.js` 提供仅监听本机回环地址的 HTTP API、静态页面、设备自动刷新、传输任务进度/取消和分发 Skill 白名单调用；`lib/juguang-data.js` 负责聚光数据读取；`lib/distribution-data.js` 从 Junction、台账和 CSV 日志计算作品集状态；`public/` 是工作流控制台；`desktop/` 用隔离的 Electron `webview` 承载本地界面与真实 ChatGPT；`mcp/` 保留聚光数据调用入口。

手机发送、接收确认和 Junction 安全删除不在工作台中重写，而是调用 `device-folder-transfer`。工作台负责任务选择、输入校验、最终确认、进度、取消、结果呈现和状态刷新；普通文件传输与作品包补笔记使用同一设备发现和传输真源。

作品包防重采用三层互锁：发送前在 `.distribution-claims/` 原子创建独占 JSON 占用；接收成功后写入 `device-usage-log.csv`；最后删除对应活动 Junction。任何一层显示已占用/已使用，随机与指定分发都拒绝再次发送。
