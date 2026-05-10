# Windows 源码方式配置 Hando MCP

这份文档用于在 Hando 最新代码尚未发布到 npm 时，在另一台 Windows 电脑上通过拉源码的方式测试 Codex 和 Claude Code 的 MCP 集成。

## 前置要求

在 PowerShell 中确认以下命令可用：

```powershell
node -v
npm -v
git --version
```

要求：

- Node.js `>= 20.11`
- npm 可用
- Git 建议安装并加入 `PATH`

如果 Git 不可用，Hando 仍能保存任务，但会把分支标记为 `not_a_git_repository`。

## 1. 拉取源码并构建

```powershell
cd C:\Users\<你>\work
git clone https://github.com/dolibali/hando.git
cd hando
npm install
npm run build
```

如果已经 clone 过：

```powershell
cd C:\Users\<你>\work\hando
git pull
npm install
npm run build
```

## 2. 本地 CLI 烟测

```powershell
node dist/src/main.js setup
node dist/src/main.js doctor
node dist/src/main.js save "Windows source smoke test" --summary "Testing Hando from source on Windows."
node dist/src/main.js ls
node dist/src/main.js resume "Windows source"
```

默认数据目录：

```text
C:\Users\<你>\.hando
```

任务文件会保存在：

```text
C:\Users\<你>\.hando\tasks\<task-id>\task.md
C:\Users\<你>\.hando\archive\<task-id>\task.md
```

## 3. 配置 Codex

编辑：

```text
C:\Users\<你>\.codex\config.toml
```

加入：

```toml
[mcp_servers.hando]
command = "node"
args = ["C:\\Users\\<你>\\work\\hando\\dist\\src\\main.js", "serve"]
enabled = true
```

注意：TOML 双引号中的 Windows 路径建议把 `\` 写成 `\\`。

配置后重启 Codex，然后让 Codex 测试：

```text
请使用 Hando MCP 列出当前可续做任务。
```

或：

```text
帮我用 Hando 保存当前任务交接，任务名是 Windows Codex MCP 测试，并写清楚背景、进度、后续工作。
```

## 4. 配置 Claude Code

执行：

```powershell
claude mcp add --transport stdio --scope user hando -- node C:\Users\<你>\work\hando\dist\src\main.js serve
```

验证：

```powershell
claude mcp list
claude mcp get hando
```

进入 Claude Code 后也可以运行：

```text
/mcp
```

确认 `hando` 连接成功，并能看到工具：

```text
save
resume
ls
get
archive
restore
```

## 5. 更新源码后刷新 MCP

每次拉取最新代码后：

```powershell
cd C:\Users\<你>\work\hando
git pull
npm install
npm run build
```

然后重启 Codex 或 Claude Code。因为 MCP 配置指向的是 `dist/src/main.js`，重启后会使用最新 build。

## 常见问题

### `node` 或 `git` 找不到

确认 Node.js 和 Git 已加入 Windows `PATH`。重新打开 PowerShell 后再试：

```powershell
where node
where git
```

### Codex 或 Claude Code 看不到工具

先确认源码版 MCP 可以直接启动：

```powershell
node C:\Users\<你>\work\hando\dist\src\main.js serve
```

这个命令启动后会等待 MCP 客户端握手，终端没有普通日志输出是正常的。测试完可按 `Ctrl+C` 结束。

然后检查：

- 路径是否写错。
- 是否已经运行 `npm run build`。
- Codex / Claude Code 是否已经重启。
- Windows 路径在 Codex TOML 中是否使用了 `\\`。

### 想改用 npm 包

等最新代码发布到 npm 后，可以把配置改回：

```toml
[mcp_servers.hando]
command = "cmd"
args = ["/c", "npx", "-y", "hando-ai", "serve"]
enabled = true
```

Claude Code 对应命令：

```powershell
claude mcp add --transport stdio --scope user hando -- cmd /c npx -y hando-ai serve
```
