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

独立浏览器扩展 teambuilding-gpt-production-extension
              ↓ 仅本机接口
   授权目录 / 文件流 / 生产去重只读状态
```

`server.js` 提供仅监听本机回环地址的 HTTP API、静态页面、设备自动刷新、可恢复传输任务进度/取消、扩展只读协作接口和分发 Skill 白名单调用；`lib/transfer-progress.js` 把底层输出转换为用户可见阶段和百分比；`lib/dedup-ledger.js` 区分生产历史与分发历史；`lib/distribution-data.js` 从 Junction、台账和 CSV 日志计算作品集状态；`public/` 是工作流控制台；`desktop/` 承载本地界面；`mcp/` 保留聚光数据调用入口。

生产防重与分发防重是两套独立事实：生产历史库按整组图片 SHA-256 确定重复，并用 64 位 dHash 做近似预警；分发防重继续使用 claim、使用日志和入口状态。两类数据都不复制进公开源码。

手机发送、接收确认和 Junction 安全删除不在工作台中重写，而是调用 `device-folder-transfer`。工作台负责任务选择、输入校验、系统内最终确认、进度、取消、结果呈现和状态刷新；普通文件传输与作品包补笔记使用同一设备发现、任务表现和传输真源。软链接兼容层属于执行内核，不在前台显示。

作品包防重采用三层互锁：发送前在 `.distribution-claims/` 原子创建独占 JSON 占用；接收成功后写入 `device-usage-log.csv`；最后删除对应活动 Junction。任何一层显示已占用/已使用，随机与指定分发都拒绝再次发送。

平台资格分为两个使用组：小红书与抖音是同一手机组，候选必须同时存在两个有效同源入口，使用一次后整组退出；公众号是独立组，其入口与手机组互不消耗。
