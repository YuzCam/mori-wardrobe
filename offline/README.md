# 沐衣离线版

此目录为离线衣橱界面与数据层，采用 React、TypeScript、IndexedDB 和内置 ONNX 模型。最终交付目标是鸿蒙应用，不依赖原网站、服务器接口、ChatGPT 登录或付费服务。

## 文件结构

```text
offline/
  index.html
  src/
    app.tsx          衣橱、详情、筛选、回收站与设置
    editor.tsx       图片导入、编辑、识别、草稿与保存
    components.tsx   对话框、图片读取与分类标签
    store.ts         本机数据库、原子写入与恢复
    backup.ts        分卷备份、校验、旧版备份兼容
    platform.ts      系统文件保存桥接与返回键约定
    recognition.ts   可取消的本机识别任务
    filter.ts        搜索与多维筛选
    color-picker.tsx 调色板、颜色值与图片取色
    looks.tsx        手动搭配画布、保存与草稿
    looks-model.ts   搭配数据校验
    look-images.ts   透明单品与搭配预览生成
    types.ts         数据结构
    styles.css       手机优先的界面样式
  tests/             数据、备份、筛选及文件传输验证
harmonyos/           鸿蒙宿主工程（位于上一级）
```

## 开发命令

在项目根目录运行，无需为离线版另装一套依赖：

```text
node node_modules/vite/bin/vite.js --config vite.offline.config.ts
node node_modules/typescript/bin/tsc --noEmit -p offline/tsconfig.json
node --experimental-strip-types --test offline/tests/*.test.ts
node scripts/build-offline.mjs
node scripts/package-offline.mjs
node scripts/offline-doctor.mjs
```

本地预览是开发验收用途，地址只在电脑本机有效，不是手机安装包，也没有在线同步。首次无衣物；测试数据不随安装工程分发。

构建产物位于 `outputs/offline-web`，鸿蒙离线资源位于 `harmonyos/entry/src/main/resources/rawfile/offline`。工程归档 `outputs/MoriOffline-HarmonyOS-project.zip` 不包含账号、签名密钥或用户照片，**不是可直接安装的HAP**。

## 当前验证边界

0.2.1新增回收站逐件永久删除和本机图片占用统计。永久删除清除记录、4类图片和对应编辑草稿；关联搭配及其草稿须单独勾选确认，避免产生悬空引用。相册原件和已导出备份不变。照片保存在应用私有 IndexedDB，占用手机存储容量；图片Blob统计不包含安装资源、模型或数据库额外空间。新增删除事务、关联确认、并发修改防护、失败回滚、删除后备份及统计测试，当前50项测试和两套类型检查通过。

0.2.0数据库版本2兼容版本1衣橱，备份格式版本2兼容原有版本1。42项测试覆盖新增细分类、自定义色系、数据库升级、搭配保存/修订/回收、完整备份与编号冲突重映射。手机已确认新分类和搭配入口；完整新功能操作在本机窄屏预览中使用程序生成的示例图片验证，测试数据不随安装包分发。

本机浏览器模型运行通过，数据库测试使用独立测试库和 fake-indexeddb 验证事务逻辑；这些验证不能代替 HarmonyOS ArkWeb 的数据持久性、系统相机、选择器、模型及覆盖更新真机验收。鸿蒙构建和安装步骤见 `../harmonyos/README.md`。
