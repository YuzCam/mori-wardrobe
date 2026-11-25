# 沐衣 MŌRI · 个人电子衣橱

手机优先的私人电子衣橱：相册/拍照上传、自动主体提取、图片修边、品类与季节建议、多维筛选、天气和每日搭配。已针对华为 Mate 80 Pro 的高像素照片、动态浏览器工具栏与触控使用安排兼容处理；真实手机摄像头、系统权限和性能需要真机验收。

## 启动

需要 Node.js 24 与 pnpm 11.25.0。

```powershell
pnpm install
$env:MORI_NODE_PREVIEW='1'
pnpm dev
```

打开终端显示的本机地址。开发环境仅在 loopback 模拟登录，使用 `local_seedy` 测试身份。本机数据库和图片位于忽略的 `.sites-runtime/node-preview`，不会发布。

可用 workerd 的主机可以不设置 `MORI_NODE_PREVIEW`，使用原生 Cloudflare 预览；按模板说明将 `drizzle` 中的迁移应用到本机 D1。

## 检查与构建

```powershell
pnpm typecheck
pnpm test
node tests/http-smoke.mjs
pnpm build
```

HTTP 检查需本机预览运行，仅创建带 TEST 名称的测试记录并清理这些记录。它不应运行于生产站点。部署产物在 `dist`，通过 Sites 工作流私有发布，数据库迁移随发布应用。

## 模型

仓库包含经哈希校验的模型分片、标签向量与许可证，不需要付费识别密钥。首次使用会下载约 94MB 模型资源，加上浏览器推理运行时；之后缓存复用。可在设置中清理缓存。

重建模型资源：

```powershell
node scripts/prepare-models.mjs --skip-download
```

无本机缓存时移除 `--skip-download`；网络无法访问上游时可显式指定 `--mirror https://hf-mirror.com`，脚本仍校验固定哈希。详见 `docs/model-licenses.md` 与 `docs/recognition-validation.md`。

自动处理是可修改建议。U²-NetP 不是服装专用像素解析器，穿在人身上的衣物可能连同人体被保留。透明材质、复杂背景与细肩带可用圈选和画笔修正。风格、适穿季节和保暖程度由用户最终确认。

## 使用与数据

- 确认保存后，手机和电脑登录同一站点身份访问同一衣橱。
- 上传失败保留本机草稿；离线编辑后需联网保存。
- 单张输入照片上限 20MB；不支持的 HEIC 请先转 JPEG。
- 完整备份包含图片、标签、设置与搭配，当前单次图片总量上限 80MB；恢复可重试，同一备份不重复添加单品。
- 天气采用 Open-Meteo 非商业免费接口，失败时可以手动输入。
- 所有写入与图片读取都验证用户；生产没有匿名备用账户，也没有付费 API 密钥。

代码职责和存储一致性见 `docs/architecture.md`。手机验收记录见 `docs/mobile-acceptance.md`。
