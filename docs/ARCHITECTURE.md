# 架构

## 0.9.4 连接状态与可审计分发

- Electron 主窗口直接加载本地工作台，不再启用 `webviewTag`、ChatGPT guest 会话、网页脚本注入或多账号内嵌登录；外部网页仍由本地白名单接口交给系统浏览器。
- `device-presence.json` 仅在运行数据目录保存最近发现的设备摘要；本轮未回包的设备最多保留 10 分钟并标为“最近在线”，实际发送仍由共享 Skill 重新发现和连接。
- `app-settings.json` 可保存生图 API 类型、HTTPS 地址和模型名；密钥只读取 `TEAMBUILDING_IMAGE_API_KEY`，不写入设置文件或前端响应。当前版本只完成可接入界面与安全配置层，不包含未经验证的供应商调用。
- 局域网设备发现记录被标准化为 `transport=wifi`，前台从真实发现状态生成连接标签；USB、远程保留独立状态位，未获得底层事实时不得显示为在线。
- `transfer-progress.js` 从底层完成 JSON 中提取实际 `transport`，完成任务可显示本次传输使用的协议。
- 发送闭环顺序保持为：原子 claim → 设备接收确认 → 追加 `device-usage-log.csv`（含传输协议）→ 完成 claim → 原作品集移动到公众号目录。历史记录即使遇到入口误建，也会阻止再次进入手机待发送库存。

## 0.9.3 文件夹即状态

- `distribution-data.js` 同时识别发布空间中的 Junction 和真实目录，并输出 `workflowStage`。
- 手机分发进程只有在接收端提交成功后，才把原始作品目录移动到 `发布空间/公众号`。
- `POST /api/distribution/mark-used` 将公众号原始目录移动到 `发布空间/已使用` 并追加可审计日志。
- 外部手动移动后，下一次快照直接按目录位置重算阶段；不存在需要同步的第二份阶段台账。

## 0.9.2 素材全局索引

- `material-global-index.json` 保存紧凑全库条目、分类数量、母标签/次数分面和待核对历史证据。
- `GET /api/extension/material-index` 第一次调用或素材根变化时启动异步逐分类扫描，轮询返回进度；每个分类扫描完成后让出事件循环。
- 历史证据来自 `01-素材库/素材链接记录.csv` 与 `04-技能库/运行记录/制作日志.csv`，以事件键幂等导入元数据台账。
- 全库索引不保存附件内容；真实上传仍由分类懒加载接口读取。

## 0.9.1 分类按需加载与素材身份层

- 素材文件夹身份由文件系统目录身份派生为 SHA-256；同卷改名或移动后保持不变，内容相同的两个目录也不会共用身份。
- `material-hash-cache.json` 缓存路径对应的目录身份和文件夹哈希。
- `防重复账本/material-metadata-ledger.json` 以文件夹身份哈希为键保存人工母标签与使用次数。
- 图片、TXT、Markdown 的聚合内容指纹仍由使用台账保存，只用于内容防重，不再充当文件夹身份。
- `/api/materials` 只为用户展开的分类计算并返回元数据，避免打开工作台时全库同步哈希。
- `materialCategoryIndex()` 只读取素材根目录的直接子目录；`materialCategoryCache` 按分类路径独立缓存递归结果，顶层签名变化时不会复用已不存在的分类。
- `/api/dashboard` 只装载状态中当前分类，`/api/materials` 无分类参数时只返回轻量索引；两条入口不再先构造完整素材库再隐藏未展开内容。

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

独立浏览器扩展 teambuilding-gpt-production-extension
              ↓ 仅本机接口
   授权目录 / 文件流 / 生产去重只读状态
```

`server.js` 提供仅监听本机回环地址的 HTTP API、静态页面、设备自动刷新、可恢复传输任务进度/取消、扩展只读协作接口和分发 Skill 白名单调用；`lib/transfer-progress.js` 把底层输出转换为用户可见阶段和百分比；`lib/dedup-ledger.js` 区分生产历史与分发历史；`lib/distribution-data.js` 从 Junction、台账和 CSV 日志计算作品集状态；`public/` 是工作流控制台；`desktop/` 承载本地界面；`mcp/` 保留聚光数据调用入口。

生产防重与分发防重是两套独立事实：生产历史库按整组图片 SHA-256 确定重复，并用 64 位 dHash 做近似预警；分发防重继续使用 claim、使用日志和入口状态。两类数据都不复制进公开源码。

手机发送、接收确认和 Junction 安全删除不在工作台中重写，而是调用 `device-folder-transfer`。工作台负责任务选择、输入校验、系统内最终确认、进度、取消、结果呈现和状态刷新；普通文件传输与作品包补笔记使用同一设备发现、任务表现和传输真源。软链接兼容层属于执行内核，不在前台显示。

作品包防重采用三层互锁：发送前在 `.distribution-claims/` 原子创建独占 JSON 占用；接收成功后写入 `device-usage-log.csv`；最后删除对应活动 Junction。任何一层显示已占用/已使用，随机与指定分发都拒绝再次发送。

平台资格分为两个使用组：小红书与抖音是同一手机组，候选必须同时存在两个有效同源入口，使用一次后整组退出；公众号是独立组，其入口与手机组互不消耗。
