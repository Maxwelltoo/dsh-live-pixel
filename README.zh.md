# 动态像素主题

[English](<README.md>)

为 DeepSeek Harness 提供四种动态像素风景，可切换场景并调节可读性。WebGL 不可用时，当前主题会使用纯色背景，并保留界面配色。

![极光、深井、霓虹和深海的 WebGL 实际渲染预览](<docs/live-pixel.gif>)

[查看四个主题在 DSH 聊天界面中的实际效果](<https://github.com/Maxwelltoo/dsh-live-pixel/blob/main/docs/live-pixel-in-dsh.gif>)。

## 安装与使用

1. 打开 **插件 → 添加插件**，输入 `dsh-live-pixel` 并确认安装。选择「立即启用」，按界面提示重启。
2. 打开 **设置 → 动态像素主题**，选择场景。如果背景让文字难以辨认，可以降低「风景强度」或提高「卡片纸色」。

如果已下载发布包，也可以在「添加插件」中输入它在 DSH 宿主机上的绝对路径。需要卸载时，在「插件」页打开此插件并选择「卸载」。

## 四种主题

| 主题 | 场景 | 明暗配色 |
| --- | --- | --- |
| **极光** | 流星划过夜幕，极光映在山间湖面。浅色模式呈现双色孔版印刷风格的黎明。 | 明暗两套配色 |
| **深井** | 井底吊灯、藤蔓、水面倒影和落石。 | 共用一套夜景配色 |
| **霓虹** | 酒吧临街的窗户、霓虹招牌、雨丝和酒瓶。 | 共用一套夜景配色 |
| **深海** | 深海光柱、游过的蓝鲸、水母和海草。 | 共用一套夜景配色 |

页面不可见时，动画会暂停。开启系统「减少动态效果」时，场景会显示静帧。

## 可读性设置

| 控件 | 默认 | 作用 |
| --- | --- | --- |
| 风景强度 | 100% | 背景风景的可见程度 |
| 卡片纸色 | 93% | 卡片、输入框、消息气泡和代码块的底色不透明度 |
| 侧栏纸色 | 90% | 会话列表和右侧面板的底色不透明度 |
| 底部柔光 | 60% | 输入框上方渐隐层的强度 |

每个主题的设置独立保存在本机。「恢复默认」只重置当前主题。

## 兼容性

- **DSH Desktop 0.2.2-rc.3** 已验证主题切换、修改设置、窗口最小化后恢复。
- **DSH Web 0.2.2-rc.1** 已在隔离配置中验证插件 2.1.0 的安装、场景与明暗切换、偏好保存、禁用和卸载。

## 开发

以[极光主题模块](<themes/borealis.js>)为模板，复制为 `themes/<id>.js`。为主题指定以字母开头的唯一 kebab-case ID，并提供中英文名称、明暗着色器配色（`colors`，两套均须包含 `uPaper`）、界面配色（`palette`）和片段着色器（`fragment`）。可选填主题说明和滑块默认值。引擎提供 `uRes`、`uTime`、`uPointer` 和 `uNight`。

在项目根目录运行以下命令。构建脚本会自动发现并校验主题模块。

```sh
node scripts/build.mjs           # 生成 client.js
node scripts/build.mjs --check   # 检查生成产物是否与源码一致
node tests/smoke.mjs             # 使用 DOM、React 和 WebGL 测试桩
node tests/render.real.mjs       # 使用 React 18 和 jsdom 挂载设置页
```

缺少 React 18、react-dom 或 jsdom 时，设置页测试会跳过。要检查实际 WebGL 渲染，先生成诊断页并启动项目根目录的静态服务，然后打开[着色器检查页](<http://127.0.0.1:8400/tests/shader-check/>)、[引擎检查页](<http://127.0.0.1:8400/tests/shader-check/boot.html?theme=well>)或[场景一览](<http://127.0.0.1:8400/tests/shader-check/gallery.html>)。

```sh
node scripts/shader-check.mjs
python3 -m http.server 8400
```

## 许可与鸣谢

本项目采用 MIT 许可。极光主题的着色器移植了 Adolanium 的 hermes-borealis 场景结构和调色板。[MIT 许可证](<LICENSE>) · [第三方许可说明](<THIRD_PARTY_NOTICES.md>) · [hermes-borealis](<https://github.com/Adolanium/hermes-borealis>)
