# 文档解析器

在本机提取文档内容，为 Linden AI 提供可供模型阅读的文字和表格数据。

## 版本信息

- 当前版本：1.0.0
- 模组标识：`linden.document-parser`
- 更新分支：`document-parser`

## 功能

- PDF：提取文本层内容。
- Word：支持 DOC、DOCX，提取正文和表格文字。
- Excel：支持 XLS、XLSX，提取工作表、单元格地址、公式文本和缓存值。
- PowerPoint：支持 PPT、PPTX，提取幻灯片文字和演讲备注。
- 纯文本与代码：读取文本内容。

## 运行要求

需要支持 OpenCode 插件接口的 Linden AI 客户端。当前已在 Linux 上验证；Windows、macOS 和移动端尚未完成验证。无需安装 Office、LibreOffice 或浏览器 Canvas。

## 安装与更新

在 Linden AI 的“模组管理 → Linden AI 模组”中安装。已安装后点击“检查更新”，有新版本时点击“更新”。

本分支保存可直接加载的构建产物，由 OpenCode 插件接口负责下载安装和更新：

```text
git+https://github.com/ImperatorVienna/LindenPlugins.git#document-parser
```

## 使用方法

安装后，在对话中添加文档。客户端根据模型的文件接收规则决定直传原文件或调用本模组提取内容。

## 限制与说明

- 单个文件小于 50 MB，文本输出最多 400,000 字符。
- 不包含 OCR；无文本层的扫描 PDF 需要先进行 OCR。
- 不还原页面排版、图表或动画；旧版 PPT 可能包含母版占位文字。
- Excel 公式不重新计算，缓存值可能不是最新结果。
- 不执行宏或嵌入对象；加密及不支持的文件会返回明确错误。

## 文件说明

`index.js`、`worker.js`、`rpc.js` 为插件程序；`assets/pdf/` 为 PDF 资源；`package.json` 为包信息。

## 许可证

项目许可证见 [LICENSE](LICENSE)，第三方组件许可证及版本信息见 [licenses/](licenses/)。
