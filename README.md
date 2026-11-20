# PushDesk

Windows / macOS CodePush 发布工作台，支持 Android 与可选的 iOS 热更新。Electron + React + TypeScript，SQLite 保存配置与任务。

## 启动

需要 Node.js 22.12+、Git。项目构建依赖 npm 或 Corepack/Yarn。

```sh
npm ci
npm run dev
```

已有依赖时直接 `npm run dev`。`npm run build && npm start` 运行生产界面。

```sh
npm test
npm run pack       # 生成当前系统的桌面应用目录
npm run dist:mac   # macOS DMG / ZIP
npm run dist:win   # Windows NSIS，建议在 Windows 运行
```

Mac 打包复用 `node_modules/electron/dist` 中已安装的 Electron，减少重复下载导致的网络错误。`yarn dist:mac` 或 `npm run dist:mac` 均可生成 DMG 和 ZIP；默认产物架构与本机安装的 Electron 一致。若依赖尚未安装，请先安装依赖。

macOS 当前产物位于 `release/mac-arm64/PushDesk.app`。未配置正式代码签名和公证；Windows 安装包需在 Windows 验证。

## 首次配置

1. 在“服务与设置”保存内网地址、Node.js 和 Git 路径。自动定位 PATH、NVM、fnm、Volta、asdf 和常见安装目录中的 Node.js，并保存验证成功的绝对路径。也可手动填写绝对路径。安装依赖、RN 构建及依赖脚本统一继承该 Node 路径，避免桌面启动时出现 spawn node ENOENT。
2. 填入 Token，点击“验证并更新 Token”。使用与现有 CLI 相同的 `code-push@2.0.7` 管理 SDK，不改变用户全局 CLI 登录。Token 经 Electron safeStorage 加密保存在本机，界面与日志脱敏。
3. 添加项目，选择本地 React Native Git 仓库，填真实 CodePush 应用名。
4. 绑定用途、远端 origin 分支、Deployment、目标版本、环境文件。默认正式 master、灰度 gray 都指向 Production；示例版本请改成实际版本。预发布使用 Staging，测试使用 Deployment。
5. 刷新线上数据，再去发布工作台填写更新说明（选填）、检查并构建。生产/灰度在确认弹窗输入项目名称后上传；测试/预发布默认构建完成即上传，可在项目规则中启用二次确认。

编辑项目时选择发布用途，会联动填入以下默认值，之后仍可手动修改；目标版本号保持手动填写。已有配置在打开表单时保留原值，重新选择用途后应用默认值。

| 发布用途 | 来源分支 | Deployment | 环境文件        |
| -------- | -------- | ---------- | --------------- |
| 测试     | test     | Deployment | .env.test       |
| 预发布   | release  | Staging    | .env.stage      |
| 生产灰度 | gray     | Production | .env.production |
| 生产正式 | master   | Production | .env.production |

目标版本第一版只接受明确 semver（如 1.0.2），不接受通配范围。服务端已有范围版本仍可查询匹配；如果范围同时覆盖不同用途，发布会被阻止。标记存储在本机配置，不会改变服务端历史。

## 执行流程

验证 Node 可执行文件 → 远端 fetch → 固定 FETCH_HEAD commit → detached worktree → 锁定依赖安装 → RN bundle → 按项目配置生成 Hermes 字节码 → 冻结 ZIP + SHA256 → 按配置确认（生产/灰度强制） → 重新查询历史并检查变化 → 上传同一 ZIP → 根据任务标识回查服务端。

构建重用当前 `@shm-open/code-push-cli@2.6.5` 的 bundle / Hermes 适配器。历史查询直接运行当前 CodePush CLI 的命令解析器和 `deployment history` 执行器；凭证只在子进程内存中注入，不写入全局 CLI 登录配置。终端展示查询命令及 JSON 原始输出，以及 Git、安装、构建和上传的执行内容。发布任务日志持久化到本机 SQLite。依赖安装和 App 构建输出默认折叠，终端保留阶段进度、实际命令及结果；可手动展开详情，失败时自动展开。复制终端日志包含保留的详细输出。日志达到容量上限时优先移除较早的构建详情，保留命令及阶段状态。

环境文件必须存在于所选 commit 的根目录；工具不隐式复制当前开发目录的未提交文件。需要私有 npm registry 时，请先确保本机已有访问权限。首次构建安装过程可能运行项目自己的依赖安装脚本，仅添加可信项目。

发布结果未知时不自动重传；更新 Token 后先回查。应用重启后，未完成上传会转成“结果待回查”，中断构建转成失败。未确认任务可以放弃，独立工作目录随之移除。已确认的产物保留以供核对。

## 数据与边界

数据位于 Electron userData：macOS 通常为 `~/Library/Application Support/pushdesk`，Windows 为 `%APPDATA%/pushdesk`。凭证不可跨用户/设备直接复制使用。

“当前匹配的有效更新”指最近查询中匹配目标版本、未禁用且 rollout 不为零的最新发布；部分灰度比例会明确展示。客户端安装状态不等于服务端上传状态。

这是本机管理工具，不提供多人共享审计。已有服务端历史若未保存 commit，无法反推代码来源。历史通过本机任务标识关联来源分支；未记录来源的历史明确显示“分支未记录”，无法可靠反推分支。相同应用、Deployment 和版本号在 CodePush 客户端仍匹配最新有效更新，分支不是客户端分流条件；原生应用实际 deployment key 需要与配置一致。

## 验证范围

包含版本冲突、参数安全、脱敏、SQLite 恢复测试。已进行 macOS arm64 构建和界面验证；真实内网鉴权/构建/发布需使用实际应用和凭证联调，尚未执行线上发布。Windows 需进行原生环境验收。

## 工程结构与代码风格

- `src/main.tsx`：界面启动入口。
- `src/App.tsx`：页面导航、工作空间状态与操作协调。
- `src/pages/`：线上版本、发布表单、服务设置。
- `src/components/`：项目配置、发布确认、任务记录与通用弹窗。
- `src/api.ts`：桌面通信类型与调用边界。
- `src/release-presets.ts`：发布用途联动默认值。
- `electron/main.cjs`：桌面窗口、任务流程与操作入口。
- `electron/codepush-client.cjs`：管理服务调用与凭证传递。
- `electron/artifacts.cjs`：构建产物归档。
- `electron/core.cjs`、`store.cjs`：校验、命令执行与持久化。

更新说明可留空，强制更新默认勾选，可手动取消。发布确认会明确显示最终更新策略；说明留空时仍保留工具内部任务标识，用于结果回查。

统一使用 Prettier：`npm run format` 格式化源码，`npm run format:check` 检查格式。`npm run build` 包含 TypeScript 检查，`npm test` 执行回归测试。

## iOS 热更新

在创建或编辑项目时勾选“启用 iOS 热更新”，填写独立的 iOS CodePush 应用名。Android 与 iOS 共用用途、来源分支、部署目标、目标版本及环境文件规则，平台在项目栏切换。查询缓存、构建产物、发布确认和历史记录均区分平台；已有项目和旧任务按 Android 处理。

常规使用只需启用 iOS 并填写应用名；入口文件、Bundle 和 Hermes 沿用当前安装的 CodePush CLI 默认行为。自定义选项收在默认折叠的高级设置中，可一键恢复命令默认值。iOS 默认输出 `main.jsbundle`，入口自动选择 `index.ios.js` 或 `index.js`，也可在高级设置填写项目内相对路径。构建以 `--platform ios` 执行 JS 和资源打包，不构建 IPA、不调用 Xcode，不改变原生工程。

Hermes 默认调用当前 CLI 的 `getiOSHermesEnabled`，与现有 `release-react ... ios` 使用同一套检测逻辑，不额外增加手动确认门槛。高级设置中的启用/关闭仅用于明确需要覆盖默认行为的项目；启用时使用所选 commit 安装的 React Native 对应 Hermes 编译器。

完整流程与 Android 一致：拉取远端代码成功 → 固定 commit → 独立工作目录安装和打包 → 按配置确认（生产/灰度强制） → 上传固定 ZIP → 回查所选平台应用的发布结果。终端展示平台、入口、Hermes、实际构建命令及等价发布命令。iOS 客户端需事先接入对应服务和 deployment key；工具不会自动修改原生客户端集成。

## 日常版本维护

发布配置以同一项目中的“版本号 + 来源分支”为唯一项，允许同版本的不同分支共存，重复组合不能保存。线上版本卡片可直接修改包版本号、来源分支与备注标签，点击“保存并同步”更新项目配置。发布工作台、命令预览、构建任务和确认页面读取同一份版本配置。卡片的“发布”直接带入该版本。

修改版本号或来源分支后，旧的待发布产物会标记为“版本已变更，需重新构建”；只修改备注标签不作废产物。已发布的服务端历史和历史任务不会被改写，旧版本的正式/灰度标记及备注保留在本机版本记录中。版本号在同一应用的同一部署目标下作为包版本标识，不同平台的服务端应用分别管理。

## 部署目标历史查询

服务端发布历史按所选部署目标独立查询，支持 `Production`、`Staging`、`Deployment` 及项目自定义目标。切换项目、平台、部署目标会自动重新查询，仅显示对应目标返回的记录，不把多个目标合并为一张表。查询失败会显示错误，不使用其他目标的数据填充。支持手动刷新，终端展示 `code-push deployment history <app> <deployment> --format json` 的执行与输出。

## 确认策略与托盘快捷发布

生产、灰度、指向 `Production` 或使用 `master` / `gray` 分支的规则始终需要二次确认，后端校验不可由界面选项绕过。测试/预发布默认无需确认，可在规则里勾选“发布前二次确认”。这套策略对 Android 和 iOS 一致。

最小化或关闭窗口会收起到系统托盘（macOS 菜单栏）。托盘按项目与平台提供 `test` / `release` 分支的测试、预发布快捷入口，不提供生产/灰度直发入口。菜单读取最新配置中的版本及标签；使用默认强制更新策略，更新说明留空。启用二次确认的规则会在构建后唤起确认页面；未启用则自动上传并回查。

确认发布成功后会发送系统通知和应用内反馈，通知点击可唤起窗口。通知被系统关闭时，仍可在托盘的最近结果与发布记录中查看。任务执行中禁用重复快捷操作，结果未知时不自动重传。通过托盘“退出”可真正结束应用，执行任务时会阻止退出。

界面控件统一使用 Ant Design，明暗主题通过 ConfigProvider 与原生标题栏同步。顶部使用可拖动的自定义主题栏，macOS 保留原生交通灯按钮，Windows 使用原生窗口按钮覆盖层。
