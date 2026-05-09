# Hando v1 设计文档

## 1. 项目定位

Hando 是一个本地优先的 AI Agent 任务交接包工具。

Hando 的 npm 包名是 `hando-ai`，安装后的 CLI 命令名是 `hando`。

它要解决的问题是：当 Codex、Claude Code、Gemini、Cursor 等 AI Agent 做任务做到一半时，因为额度耗尽、上下文窗口不足、工具切换、会话中断等原因，用户需要把当前任务快速交接给另一个 Agent 继续完成。

Hando 不追求在任务开始时就完整管理任务，也不追求记录完整聊天历史。它只在“需要交接”时工作：用户主动要求保存现场，或者 Agent 预计自己即将中断时，创建或更新一份足够清楚的任务交接包。

Hando v1 的核心目标是：

- 让下一个 Agent 不需要阅读完整历史对话，也能快速理解任务。
- 让交接包包含背景、目标、当前实现、当前进度、后续工作、代码状态和工作目录。
- 让用户通过自然语言描述即可找到对应任务交接包。
- 保持实现轻量，本地可用，文件可读。

Hando 不是：

- 不是任务管理器。
- 不是长期代码知识库。
- 不是完整会话录制器。
- 不是远程同步平台。
- 不是自动执行代码修改的 Agent。

## 2. 核心使用场景

### 2.1 用户主动交接

用户正在使用 Codex 开发，额度快用完时说：

```text
帮我保存当前进度，后面让 Claude 接着做。
```

Codex 调用 Hando 的 `save` 工具，生成或更新当前任务交接包。

随后用户打开 Claude Code，说：

```text
继续刚才 setup token 相关的任务。
```

Claude 调用 Hando 的 `resume` 工具，按自然语言找到对应任务交接包，读取任务背景和后续工作，然后继续开发。

### 2.2 Agent 主动交接

Agent 发现当前会话可能无法继续，例如上下文即将耗尽、工具额度不足、或者任务进入明显阶段边界时，可以主动调用 `save` 保存交接包。

Agent 不需要在任务一开始就创建记录。只有在需要交接或阶段性保存现场时，才需要写入 Hando。

### 2.3 人类查看任务现场

用户可以用 CLI 查看最近可续做的任务：

```bash
hando
hando ls
```

也可以查看某个任务的完整交接包：

```bash
hando get <id>
```

## 3. v1 范围

### 3.1 v1 做什么

- 本地保存任务交接包。
- 用 Markdown 保存主要任务现场。
- 提供 MCP 工具给 AI Agent 调用。
- 提供极简 CLI 给用户查看和兜底操作。
- 支持自然语言搜索和恢复交接包。
- 支持把已完成任务移入归档目录。

### 3.2 v1 不做什么

- 不做远程同步。
- 不做多用户账号。
- 不做 Web UI。
- 不做后台监听。
- 不保存完整聊天记录。
- 不接入 LLM API。
- 不使用 SQLite。
- 不做复杂任务状态机。

## 4. 存储设计

Hando v1 使用本地文件系统作为唯一真相源。

默认目录：

```text
~/.hando/
  config.yaml
  tasks/
    <task-id>/
      task.md
  archive/
    <task-id>/
      task.md
```

### 4.1 目录语义

`tasks/` 表示当前可续做的任务交接包。

`archive/` 表示已经收起的任务交接包。

v1 不维护 `status` 字段。是否可续做完全由目录位置决定：

- 在 `tasks/` 中：默认出现在 `hando ls` 和 `resume` 候选中。
- 在 `archive/` 中：默认不出现在 `hando ls` 和 `resume` 候选中。

### 4.2 `task.md`

`task.md` 是任务交接包的唯一主文档。

它使用 Markdown + frontmatter，既适合程序解析，也适合人类和 Agent 直接阅读。

`task.md` 是 Hando 的唯一任务真相源。frontmatter 用于列表、搜索和展示，正文用于保存完整交接现场。v1 不保存独立 Git 快照文件，避免同一份 Git 状态在多个文件中重复和过期。

frontmatter 字段：

```yaml
---
id: setup-token-display
title: 优化 setup token 展示和保存
project: braincode
cwd: /Users/zhangrich/work/code-brain
git_remote: https://github.com/dolibali/braincode.git
branch: main
source_agent: codex
created_at: 2026-05-09T00:00:00+08:00
updated_at: 2026-05-09T00:30:00+08:00
tags:
  - setup
  - token
---
```

正文建议结构：

```markdown
# 优化 setup token 展示和保存

## 任务背景

为什么做这个任务，用户最初想解决什么问题。

## 任务目标

当前任务希望达到什么结果。

## 当前实现

已经采用的方案、重要设计选择、关键文件和模块。

## 当前进度

做到哪里了，哪些部分已经完成，哪些部分还没做。

## 已完成内容

- 已完成的具体修改。
- 已验证的行为。

## 后续工作

- 下一步应该做什么。
- 推荐从哪里开始。

## 当前代码状态

- 当前工作目录。
- 当前分支。
- 是否有未提交修改。
- 相关文件及变更状态。
- 如果当前目录是 Git 仓库，Hando 可在 `save` 时把轻量 Git 信息写入本章节。
- 下一个 Agent 接手后应以实时 `git status` 为准。

## 验证情况

已经运行过哪些测试或命令，结果如何。

## 阻塞点和风险

有哪些不确定性、失败尝试、需要避免的坑。

## 给下一个 Agent 的指令

请从哪里继续，优先做什么，不要做什么。
```

### 4.3 Git 轻量信息

Hando 的主要场景是 AI 开发到一半、尚未提交代码时的交接。因此 v1 不保存独立 Git 快照文件，只把必要的 Git 轻量信息写入 `task.md` 的“当前代码状态”章节。

建议写入内容：

```markdown
## 当前代码状态

- 工作目录：/Users/zhangrich/work/code-brain
- 当前分支：main
- Git remote：https://github.com/dolibali/braincode.git
- 是否有未提交修改：是
- 相关文件：
  - src/setup/setup-runner.ts：modified，未暂存
  - README.md：modified，已暂存
```

这些信息是交接时刻的参考快照，不是最终真相。下一个 Agent 接手后，应该进入对应 `cwd` 并重新运行 `git status` 或等价检查。

如果当前目录不是 Git 仓库，仍允许保存交接包，只需在“当前代码状态”中写明 Git 不可用。

## 5. 创建与更新策略

`save` 是 v1 唯一核心写入动作。

### 5.1 提供 id 时

如果调用方提供 `id`，Hando 更新对应任务目录：

```text
~/.hando/tasks/<id>/task.md
```

如果该任务已在 `archive/` 中，默认不更新，除非调用方显式恢复或指定允许更新归档任务。

### 5.2 未提供 id 时

如果调用方没有提供 `id`，Hando 先做轻量匹配：

- 标题是否相近。
- 交接说明是否相近。
- 当前 `cwd` 是否相同或相近。
- `git_remote` 是否相同。
- 最近更新时间是否接近。

为避免误更新，v1 只在 `git_remote` 或 `cwd` 相同，且标题明显相近时自动更新已有任务。

如果匹配不够确定，Hando 不应擅自覆盖已有任务；应返回候选列表，或者在 CLI 场景下创建新任务。

Hando v1 不接入 LLM，不做复杂语义判断。语义判断主要由 Agent 负责，Hando 只做轻量候选匹配和文件存储。

## 6. 搜索与恢复策略

`resume` 用于让新 Agent 找到并导入任务交接包。

输入可以是：

- 自然语言描述。
- task id。
- project。

搜索范围默认只包含 `tasks/`。

`archive/` 默认不参与搜索，除非调用方显式要求包含归档任务。

匹配字段包括：

- `id`
- `title`
- `project`
- `cwd`
- `git_remote`
- `tags`
- `task.md` 正文

v1 使用本地文本打分，不接 LLM：

- `id` 精确匹配优先级最高。
- `title`、`tags`、`project` 匹配优先级高于正文匹配。
- `cwd` 和 `git_remote` 相同会提高排序。
- 分数接近时，按 `updated_at` 较新的任务优先。

如果只有一个明确匹配，返回完整任务交接包。

如果有多个可能匹配，返回候选列表，让 Agent 或用户选择。

如果没有匹配，返回空结果和下一步提示。

## 7. MCP 接口

MCP 是 Hando v1 的主要使用入口，因为主要调用者是 AI Agent。

### 7.1 `save`

创建或更新任务交接包，并把 Git 轻量信息写入 `task.md`。

参数：

- `title`：必填，任务名。它应该描述真实任务，例如“优化 setup token 展示和保存”，不能写成“额度快没了”这类触发原因。
- `summary`：创建新任务时必填，更新已有任务时可选。它是当前交接正文，用于说明任务背景、当前进度、后续工作和注意事项。
- `id`：可选，指定任务 id。
- `project`：可选，项目名。
- `tags`：可选，标签列表。
- `agent`：可选，调用方 Agent 名称。

行为：

- 无 `id` 时先尝试匹配已有任务。
- 匹配成功则更新已有 `task.md`。
- 匹配失败则创建新任务目录。
- 创建新任务时，如果只有 `title`、没有 `summary`，MCP 必须返回校验错误；CLI 可以打开编辑器、读取 stdin，或提示用户补充交接正文。
- 每次保存都应尽量刷新 `task.md` 中的“当前代码状态”章节。

### 7.2 `resume`

按自然语言或 id 恢复任务交接包。

参数：

- `query`：可选，自然语言描述。
- `id`：可选，任务 id。
- `project`：可选，项目过滤。
- `include_archive`：可选，是否包含归档任务。

行为：

- 命中明确任务时返回完整 `task.md`。
- 命中不明确时返回候选列表。
- 无匹配时返回空结果和提示。

### 7.3 `ls`

列出或搜索任务交接包。

参数：

- `project`：可选。
- `query`：可选。
- `archive`：可选，是否查看归档目录。

默认列出 `tasks/` 中最近更新的任务。

### 7.4 `get`

读取指定任务交接包完整内容。

参数：

- `id`：必填。
- `archive`：可选，是否从归档目录读取。

### 7.5 `archive`

收起任务。

参数：

- `id`：必填。

行为：

- 将 `~/.hando/tasks/<id>/` 移动到 `~/.hando/archive/<id>/`。
- 默认不删除任何内容。
- MCP 只暴露 `archive`，不暴露 `done`；`done` 只是 CLI 的人类友好别名。

### 7.6 `restore`

恢复已收起任务。

参数：

- `id`：必填。

行为：

- 将 `~/.hando/archive/<id>/` 移动回 `~/.hando/tasks/<id>/`。

## 8. CLI 接口

CLI 是人类查看和手动兜底入口。

### 8.1 默认命令

Hando 发布到 npm 时使用包名 `hando-ai`：

```bash
npm install -g hando-ai
```

安装后使用的命令仍然是 `hando`。

```bash
hando
```

等价于：

```bash
hando ls
```

列出最近可续做任务。

### 8.2 常用命令

```bash
hando ls
hando ls --archive
hando save "优化 setup token 展示和保存"
hando save "优化 setup token 展示和保存" --summary "额度快用完了，当前实现已完成 token 生成和一次性展示，还需要补文档。"
hando resume "setup token 相关任务"
hando get <id>
hando done <id>
hando archive <id>
hando restore <id>
hando setup
hando serve
hando doctor
```

### 8.3 命令语义

- `hando ls`：列出 `tasks/` 中最近任务。
- `hando ls --archive`：列出 `archive/` 中任务。
- `hando save`：手动兜底保存当前现场；第一个参数必须是任务名，不是“额度快没了”这类原因。
- `hando resume`：按自然语言恢复任务交接包。
- `hando get`：查看完整任务交接包。
- `hando done`：`archive` 的人类友好别名。
- `hando archive`：把任务移入 `archive/`。
- `hando restore`：把任务移回 `tasks/`。
- `hando setup`：初始化配置和目录。
- `hando serve`：启动 stdio MCP 服务。
- `hando doctor`：检查本地配置和目录是否可用。

### 8.4 MCP 客户端配置

Codex 等 MCP 客户端可以不全局安装，直接通过 `npx` 启动 Hando：

```toml
[mcp_servers.hando]
command = "npx"
args = ["-y", "hando-ai", "serve"]
```

如果已经全局安装：

```toml
[mcp_servers.hando]
command = "hando"
args = ["serve"]
```

## 9. Agent 使用协议

Agent 应遵守以下规则：

1. 用户说“额度快没了”、“帮我交接”、“保存当前进度”、“让 Claude 接着做”等表达时，必须调用 `save`。
2. Agent 预计即将中断时，应主动调用 `save`。
3. 新 Agent 接手时，应先用用户自然语言描述调用 `resume`。
4. 如果 `resume` 返回候选列表，Agent 应向用户确认或根据描述选择最相关任务。
5. 任务确认结束后，Agent 可以调用 `archive`；归档后的任务默认不再干扰后续恢复。
6. `save` 内容必须足够让下一个 Agent 不读历史对话也能继续；不能只保存任务名。

`save` 的任务名必须清楚表达真实任务。

`save` 的交接说明建议包含：

- 任务背景。
- 任务目标。
- 当前实现。
- 当前进度。
- 已完成内容。
- 后续工作。
- 当前代码状态。
- 工作目录。
- 验证情况。
- 阻塞点和风险。
- 给下一个 Agent 的明确指令。

## 10. 错误处理

错误返回应清晰、结构化，便于 Agent 理解。

示例：

```json
{
  "error": "validation_failed",
  "field": "title",
  "message": "title is required for save"
}
```

常见错误：

- `title` 缺失。
- 创建新任务时 `summary` 缺失。
- `id` 不存在。
- `id` 同时存在于 `tasks/` 和 `archive/`。
- 任务目录无法读写。
- 归档目标已存在。
- 恢复目标已存在。

## 11. 测试计划

### 11.1 保存交接包

- 无 `id` 调用 `save`。
- 验证必须提供任务名。
- 验证创建新任务时必须提供交接正文，不能只保存空标题。
- 验证创建 `~/.hando/tasks/<task-id>/task.md`。
- 验证 `task.md` 包含当前代码状态。

### 11.2 更新交接包

- 对同一工作目录和相近标题再次调用 `save`。
- 验证优先更新已有 task，而不是无脑创建重复目录。
- 对不同工作目录或不同 Git remote 的相近标题调用 `save`。
- 验证不会误更新已有 task，而是返回候选或创建新 task。

### 11.3 恢复交接包

- 调用 `resume "某个自然语言任务描述"`。
- 验证命中对应 `tasks/` 中的任务。
- 验证返回完整 `task.md`，其中包含交接时刻的当前代码状态。
- 验证 `id` 精确匹配优先于自然语言匹配。
- 验证分数接近时按 `updated_at` 较新的任务优先。

### 11.4 候选列表

- 准备多个相似任务。
- 调用模糊 `resume`。
- 验证返回候选列表，不擅自选择。

### 11.5 归档任务

- 调用 `hando done <id>` 或 `archive(id)`。
- 验证任务目录从 `tasks/` 移动到 `archive/`。
- 验证默认 `ls` 和 `resume` 不再返回该任务。

### 11.6 恢复归档任务

- 调用 `hando restore <id>` 或 `restore(id)`。
- 验证任务目录从 `archive/` 移回 `tasks/`。
- 验证随后可被 `resume` 命中。

### 11.7 非 Git 场景

- 在非 Git 目录调用 `save`。
- 验证仍可保存 `task.md`。
- 验证 `task.md` 的“当前代码状态”说明 Git 不可用。

### 11.8 MCP 接力场景

- Codex 调用 `save` 保存任务现场。
- Claude 调用 `resume` 恢复任务。
- 验证 Claude 可获得背景、目标、当前实现、进度、后续工作和 Git 状态。

## 12. 默认假设

- v1 只做本地单用户。
- v1 不在任务开始时自动创建记录。
- v1 只在需要交接时创建或更新任务交接包。
- v1 不做后台监听。
- v1 不保存完整聊天记录。
- v1 不使用 SQLite。
- v1 不接入 LLM API。
- v1 使用本地 Markdown 文件作为唯一真相源。
- v1 的主要调用者是 AI Agent。
- CLI 主要用于人类查看和手动兜底。
- 默认项目名和 CLI 命令使用 `hando`，npm 包名使用 `hando-ai`。
