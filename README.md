# 记忆管理增强

让支持工具调用的模型在对话中保存、修改和删除用户的长期记忆，与 Linden AI 的“记忆管理”共用同一份记忆。

## 版本信息

- 当前版本：1.0.1
- 模组标识：`linden.memory-management-enhancement`
- 更新分支：`memory-management-enhancement`

## 功能

- 提供 `linden_memory_save`、`linden_memory_update`、`linden_memory_delete` 三个工具，每条记忆包含简短标题和正文。
- 记忆以 OpenCode 原生指令的形式提供给所有模型，换用模型后仍然有效。
- 模型保存、修改或删除记忆后，客户端在对话中显示变更提示。

## 运行要求

需要支持 OpenCode 插件接口的 Linden AI 客户端。主动保存记忆需要模型支持工具调用；不支持的模型仍可读取记忆。

## 安装与更新

本模组随 Linden AI 客户端内置，启动时自动安装，版本跟随客户端，在“模组管理”中显示为“内置”，不可删除。本分支保存同版本的构建产物，供核对与独立加载：

```text
git+https://github.com/ImperatorVienna/LindenPlugins.git#memory-management-enhancement
```

## 使用方法

在对话中告诉模型“记住……”或“忘掉……”，支持工具调用的模型会调用相应工具；也可在“记忆管理”中手动添加、编辑和删除记忆。

## 限制与说明

- 仅支持全局记忆，适用于所有聊天和工作；暂不区分工作项目。
- 每条标题最多 40 字、正文最多 500 字，最多 200 条；超出时拒绝保存并提示原因。
- 记忆保存在本机 OpenCode 配置目录，不上传云端；但会随请求发送给当前使用的模型服务商，请勿保存密码、密钥等敏感信息。
- 默认放行时模型会直接保存，工作模式选择“询问”审批时才弹出确认。

## 文件说明

`index.js` 为插件程序（已包含记忆存储逻辑）；`package.json` 为包信息。

## 许可证

项目许可证见 [LICENSE](LICENSE)。
