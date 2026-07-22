# 团建图文生产控制台

江湖有旅人团建小红书图文生产工作流的本地可视化控制台。

## 边界

- 软件源码：`src/`
- 业务素材、模板、成品和生产记录：`D:\AICode\项目推进\projects\江湖有旅人\主项目`
- 控制台状态、提示词版本索引和服务日志：`D:\AICode\运行数据\江湖有旅人\图文生产控制台`
- 团建生产方法：`D:\AICode\AI\skills\技能包\技能\teambuilding-xhs-workflow`

软件不复制业务资产，只读取项目真源并保存自己的界面状态。

## 启动

双击 `start.vbs` 或桌面的“团建图文生产控制台”。服务地址为 `http://127.0.0.1:4327`。

命令行启动：

```powershell
& 'D:\AICode\工具开发\projects\teambuilding-workflow-dashboard\start.ps1'
```

## 验收

```powershell
node --check .\src\server.js
node .\src\path-security.test.js
```

启动后应能读取当前项目的素材、模板、成品、生产日志和提示词，并把可变状态写入运行数据目录。
