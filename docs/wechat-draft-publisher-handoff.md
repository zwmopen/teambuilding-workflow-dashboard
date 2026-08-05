# 微信公众号贴图草稿发布器｜项目交接文档

> 存档时间：2026-08-04
> 来源：用户提供完整交接文档，作为后续开发依据
> 关联仓库：zwmopen/team-video-workflow，分支 agent/wechat-draft-publisher-v1，PR #18

## 0. 交接摘要

本项目要在现有团建内容生产系统中增加一个"微信公众号贴图草稿发布器"。
用户本地已经有完整成品，不需要重新写文案、重新生成图片或操作公众号网页。

每篇帖子已经包含：多张成品图片、一个TXT文案文件、TXT第一条非空行为标题、TXT其余内容为正文。

最终目标：设置本地成品库 → 左侧浏览作品集和帖子 → 右侧检查图片、标题、正文 → 调用微信公众号官方API → 创建newspic贴图草稿 → 保存草稿记录

**只创建公众号草稿，严禁自动正式发表或群发。**

## 一、代码仓库与当前进度

- 主仓库：zwmopen/team-video-workflow，默认分支 main
- 开发分支：agent/wechat-draft-publisher-v1
- 当前提交：6885b5530e1d8844e0aed0f71eb7969047f45620
- PR #18：新增微信公众号贴图草稿发布器 V0.1，状态 Draft
- GitHub自动检查已通过（Repository quality、Secret scan）
- 真实微信公众号账号尚未进行接口验收

## 二、现有项目关系

```
team-video-workflow
├─ tools/device-share-hub       （手机素材投送中控，Win32 C++）
└─ tools/wechat-draft-publisher  （微信公众号贴图草稿发布器，Python）
```

## 三、用户本地成品库结构

### 3.1 单独帖子
一个文件夹同时存在至少一张图片 ＋ 至少一个TXT文案 = 一篇帖子。

### 3.2 作品集
作品集文件夹本身不一定有图片和文案，其下面包含多篇帖子。目录可继续嵌套，默认最多扫描5层。

## 四、最终产品界面

### 4.1 左侧：本地成品库
显示成品库根目录、作品集文件夹、子作品集、可发布帖子、图片数量、无效帖子、文案或图片异常提示。

### 4.2 右侧：草稿检查台
显示当前帖子名称、全部图片、图片上传顺序、标题输入框（含字数）、正文输入框（含字数）、超长标题警告、超过1000字警告、公众号账号选择、测试模式、强制重复创建、创建草稿按钮、执行状态、草稿media_id、最近提交记录。

### 4.3 微信公众号后台
页面顶部保留"打开公众号后台"按钮，在系统浏览器新窗口打开。不要iframe嵌入、不要读取DOM、不要模拟登录。

## 五、发布方式

### 5.1 纯官方API
本地图片 → material/add_material → 每张图片获得永久素材media_id → draft/add → article_type=newspic → 公众号草稿箱

核心草稿结构：
```json
{
  "articles": [{
    "article_type": "newspic",
    "title": "标题",
    "content": "正文",
    "need_open_comment": 0,
    "only_fans_can_comment": 0,
    "image_info": {
      "image_list": [
        { "image_media_id": "第一张图片media_id" },
        { "image_media_id": "第二张图片media_id" }
      ]
    }
  }]
}
```

### 5.3 只创建草稿
不得调用正式发表接口、群发接口、自动推送接口。统一使用"创建公众号草稿"。

## 六、开源项目参考
- jiji262/wechat-publisher：纯API、Token管理、素材上传、newspic草稿、多账号、错误码处理、重试
- lpreterite/wx-newspic：图片消息专用、CLI/服务边界、格式检查、dry-run、结构化结果
- 当前代码为独立实现，未直接复制源文件

## 七、当前已完成的代码

文件结构：
```
tools/wechat-draft-publisher
├─ wechat_draft_publisher
│  ├─ __init__.py / __main__.py / app.py / core.py / service.py / store.py / wechat_api.py
└─ tests
   ├─ test_core.py / test_service.py / test_wechat_api.py
```

- core.py：帖子识别、递归扫描、TXT解析、标题/正文拆分、自然排序、字数统计
- wechat_api.py：access_token获取/缓存、素材上传、newspic草稿创建、重试、dry-run
- store.py：SQLite记录草稿任务全量信息
- service.py：完整业务流程编排
- app.py：本机HTTP服务（127.0.0.1:8876）、双栏网页、目录选择、图片预览、创建草稿、历史查看

## 八、文案规则
- TXT识别优先级：文案.txt > copywriting.txt > content.txt > 文件名含"文案"的TXT > 唯一TXT
- 标题：第一条非空行，正文中不重复
- 标题长度：触发24字、目标20字，超长生成建议但保留原标题
- 正文：保留Emoji/标点/空行，CRLF→LF，压缩连续换行
- 超过1000字：软限制，只警告不截断

## 九、图片规则
- 格式：jpg/jpeg/png/gif/webp
- 排序：自然排序
- 数量：1-10张
- 永久素材：后续需实现哈希复用、失效重传、配额监控

## 十、防重复
任务哈希 = 账号 ＋ 最终标题 ＋ 正文 ＋ 图片SHA-256序列。默认阻止重复，可强制创建（独立记录）。

## 十一、配置与密钥
- 配置文件：%LOCALAPPDATA%\ZwmWechatDraftPublisher\settings.json
- AppSecret推荐环境变量，不得进入Git/浏览器/日志

## 十二-十三、运行与测试
- 双击 run-windows.cmd，默认端口 8876
- 测试：python -m unittest discover -s tests -v

## 十四、接手后优先任务
- P0：真实微信公众号接口验收（3张测试图创建草稿）
- P0：测试超过1000字（999/1000/1001字）
- P0：修复真实测试暴露的问题

## 十五、后续开发任务
- P1：批量草稿队列（持久化队列、多选、串行、重试、重启恢复）
- P1：图片素材复用
- P1：账号管理界面
- P1：标题处理改进
- P1：任务详情
- P2：与Windows中控整合
- P2：公众号后台快捷检查

## 十六、必须遵守的项目边界
只创建草稿、不正式发表、不自动群发、不使用网页模拟、不重写已有图片和TXT、不修改原始成品库、不静默截断正文、不静默覆盖原标题、不泄露密钥、不监听公网、不破坏现有功能、不建立平行仓库。

## 十七、验收标准
打开团建中控台 → 进入公众号草稿 → 设置成品库 → 左侧展开作品集 → 选择帖子 → 右侧检查 → 选择账号 → 创建草稿 → 公众号后台可见贴图草稿。

## 十八、建议接手顺序
1. 拉取PR #18并运行测试
2. 本机启动测试扫描
3. 配置测试公众号
4. 3张图片真实草稿验证
5. 999/1000/1001字验证
6. 修复API兼容问题
7. 持久化批量队列
8. 图片media_id复用
9. 账号管理
10. 接入Windows中控入口

## 十九、接手者首轮回报要求
区分"已实际验证"、"仅代码推断"、"尚未验证"。禁止把"理论可行"写成"已经完成"。

## 二十、TRAE 接手记录（2026-08-04）

### 已实际验证

- 已按 PR #18 的 head 提交 `6885b5530e1d8844e0aed0f71eb7969047f45620` 将 `tools/wechat-draft-publisher` 和仓库级 `tests/test_wechat_draft_publisher.py` 同步到本地仓库 `D:\AICode\AI\repos\team-video-workflow`。
- 在 `team-video-workflow` 本地仓库运行 `python -m compileall -q tools tests`，通过。
- 在 `team-video-workflow` 本地仓库运行 `python -m unittest discover -s tests -v`，25 个测试通过，包含 PR #18 的 dry-run、newspic payload、单独帖子和作品集识别。
- 在团建工作台源码中确认“内容分发 → 微信公众号”界面已存在：左侧作品集列表、右侧帖子列表、图片预览、标题/正文检查、测试模式、强制重复、创建公众号草稿、账号设置。
- 在团建工作台运行 `node --check src/public/app.js`、`node --check src/server.js`、`node --check src/lib/wechat-draft.js`，通过。
- 在团建工作台运行 `npm test -- public/distribution-ui.test.js path-security.test.js`，当前输出 207 个测试通过。
- 新增并验证 `src/lib/wechat-draft.test.js`：保存公众号账号设置时按账号级合并，不覆盖已有账号，并且不持久化明文 `AppSecret`。

### 已修改

- 修复 `src/lib/wechat-draft.js` 的 `saveWechatSettings()`：账号设置从浅合并改为账号级合并，避免新增或编辑一个公众号账号时把其他账号覆盖掉。
- 将 `lib/wechat-draft.test.js` 加入 `src/package.json` 的 `npm test` 脚本。

### 仅代码推断

- 工作台内置 JS 版公众号草稿链路与 PR #18 的 Python 独立发布器是两套实现：当前内容分发页走 `src/lib/wechat-draft.js`，不是启动 `tools/wechat-draft-publisher` 的 8876 服务。
- 两套实现都遵守“只创建草稿，不正式发表、不群发”的边界；后续应决定保留工作台内置 JS 版，还是让内容分发入口启动/聚焦 PR #18 的 Python 独立服务，避免长期双实现分叉。

### 尚未验证

- 尚未拿到真实测试公众号的 AppID、AppSecret、IP 白名单和草稿/素材接口权限。
- 尚未执行真实 3 图 newspic 草稿创建。
- 尚未执行 999/1000/1001 字正文的真实微信接口边界测试。
- 尚未确认 WebP、Emoji、图片大小、素材配额和微信后台编辑器展示差异。

## 二十一、TRAE 开发记录（2026-08-04，批量草稿队列 + 图片素材复用）

### 已实际验证

- 新增 `wechat-draft.js` 批量草稿队列函数：`createBatchQueue`、`getBatchQueue`、`updateBatchItem`、`updateBatchStatus`、`clearBatchQueue`，持久化到 `wechat-batch-queue.json`。
- 新增 `wechat-draft.js` 图片素材复用函数：`recordMaterialMapping`、`findReusableMediaId`，持久化到 `wechat-material-mapping.json`，按账号隔离。
- 新增 8 个单元测试覆盖批量队列和素材复用，全部通过。全量回归测试 219 个通过（含原 210 + 新增 9）。
- 新增 `server.js` 5 个 API 路由：`batch/create`、`batch/status`、`batch/process-next`、`batch/cancel`、`batch/clear`。
- 前端 `app.js` 新增批量 UI：帖子多选 checkbox、全选、批量创建按钮、测试/正式模式切换、进度面板（百分比、成功/失败/跳过计数、逐项状态）、取消和清空操作。
- `styles.css` 新增批量 UI 样式。
- 重启工作台后通过 API 验证完整批量链路：创建队列 → 逐项处理 → 状态查询 → 清空，全部正常。

### 已修改

- `src/lib/wechat-draft.js`：新增批量队列和素材复用函数及导出。
- `src/lib/wechat-draft.test.js`：新增 8 个测试。
- `src/server.js`：新增 5 个批量 API 路由。
- `src/public/app.js`：新增批量 UI 渲染、事件处理和进度面板。
- `src/public/styles.css`：新增批量 UI 样式。
- `VERSION`：0.14.27 → 0.14.28。
- `src/public/index.html`：缓存版本号同步更新。

### 功能说明

- **批量草稿队列**：用户在帖子列表中勾选多篇帖子，点击"批量创建草稿"后系统串行处理，实时显示进度。支持测试模式（dry-run）和正式模式切换。队列持久化到本地 JSON 文件，重启后可恢复。支持取消正在进行的批量任务和清空已完成记录。
- **图片素材复用**：通过 SHA-256 哈希匹配已上传的永久素材，避免相同图片重复上传。按账号隔离，不同账号的素材不混用。（映射记录函数已实现并在测试中验证，尚未集成到 `createDraftTask` 的上传流程中，属于下一步任务。）
