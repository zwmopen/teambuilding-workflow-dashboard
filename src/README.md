# 源码说明

这里是团建内容工作台的唯一软件源码。

- `server.js`：本地 HTTP、数据聚合、路径安全和分发 Skill 白名单调用。
- `public/`：浏览器界面。
- `public/distribution-ui.js`：作品集筛选、平台状态文案和设备扫描结果解析。
- `lib/juguang-data.js`：聚光数据读取。
- `lib/distribution-data.js`：作品集、平台入口和分发日志状态读取。
- `mcp/`：聚光数据 MCP 入口。
- `launch.ps1`：无中文编码依赖的正式启动器。

业务素材和成品不在本目录，详见项目根目录 `README.md`。
