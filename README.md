# 本地语音识别

通过 whisper.cpp 在本机将录音或音频转换为文字，为 Linden AI 的语音转文字功能提供识别能力。

## 版本信息

- 当前版本：1.0.0
- 模组标识：`linden.local-speech-recognition`
- 更新分支：`local-speech-recognition`

## 功能

- 接收客户端准备的音频并在本机转写。
- 下载、校验和管理语音模型资源。
- 支持取消转写，完成后可在客户端编辑识别结果。

## 运行要求

需要支持 OpenCode 插件接口的 Linden AI 客户端。当前发布包包含 Linux x64 引擎；其他平台尚未发布对应引擎。首次下载语音模型需要网络连接。

## 安装与更新

在 Linden AI 的“模组管理 → Linden AI 模组”中安装。已安装后点击“检查更新”，有新版本时点击“更新”。

本分支保存可直接加载的构建产物，由 OpenCode 插件接口负责下载安装和更新：

```text
git+https://github.com/ImperatorVienna/LindenPlugins.git#local-speech-recognition
```

## 使用方法

安装后，进入“语音转文字”或点击对话中的麦克风，按界面提示下载并选择语音模型，再录音或选择音频。

## 限制与说明

- 语音模型不包含在 Git 包内，按需从固定的官方来源下载并校验。
- 识别在本机执行，音频不会由本模组上传给云端模型。
- 可解码的音频格式由客户端及系统决定。
- 识别速度和内存占用取决于语音模型与设备性能。

## 文件说明

`index.js` 为插件程序；`native/linux-x64/` 为识别引擎；`package.json` 为包信息。

## 许可证

项目许可证见 [LICENSE](LICENSE)，引擎及模型许可证见 [LICENSE-whisper.cpp](LICENSE-whisper.cpp)、[LICENSE-whisper-models](LICENSE-whisper-models)，其他组件许可证见 [licenses/](licenses/)。
