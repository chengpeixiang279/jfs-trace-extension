# JFS 请求抓包器

Chrome 扩展，用于在 JFS（J&T Cargo 巴西快运系统）中自动拦截所有 XHR/fetch 请求，记录请求体和响应体，一键导出 JSON 用于排查报错。

## 功能

- 自动拦截 XHR 和 fetch 请求（method、URL、request body、HTTP 状态码、response body）
- 失败请求自动标红（HTTP ≥400 或后端 code != 1）
- 悬浮按钮可自由拖动，位置自动记忆（localStorage）
- 面板可通过标题栏拖动
- URL 过滤、只看失败
- 一键导出 JSON 文件
- 最多保留 2000 条请求

## 安装（开发者模式）

1. 下载本仓库代码
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 右上角打开"开发者模式"
4. 把文件夹拖进页面，或点"加载已解压的扩展程序"选择本目录
5. 打开 `https://jfs.jtcargo.com.br`，右下角出现蓝色圆形按钮即安装成功

## 使用

1. 正常操作 JFS，所有请求自动记录
2. 遇到报错时，按钮变红
3. 点按钮弹出面板，勾选"只看失败"
4. 点击红色请求行，展开 REQUEST/RESPONSE 详情
5. 点"导出 JSON"下载日志文件

## 文件结构

```
jfs-trace-extension/
├── manifest.json      # Chrome 扩展配置（Manifest V3）
└── content_script.js  # 拦截器 + 悬浮 UI
```

## 技术说明

- 使用 Manifest V3 的 `world: "MAIN"` 模式直接在页面主世界注入，能 hook 到 Vue/axios 发出的请求
- 只匹配 `https://jfs.jtcargo.com.br/*`
- 自动过滤噪音请求（userAccessLog、checkToken、notice）
