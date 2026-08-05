# AIX 本地打包与体积校验

本文说明 Moment One 当前的本地 `.aix` 生成方式、资源范围、10 MB 限制、验证步骤和发布边界。

## 1. 当前结论

项目可以在本地生成可被 AIX Reader 读取的 `.aix` 文件：

```bash
npm run pack:aix
```

默认输出：

```text
dist/moment-one-<package.json version>.aix
```

例如当前版本 `0.3.2` 的默认产物为：

```text
dist/moment-one-0.3.2.aix
```

`dist/` 已被 `.gitignore` 忽略，打包产物默认不会提交到 Git。

## 2. 环境要求

本地打包脚本依赖：

- 符合 `package.json#engines` 要求的 Node.js；
- npm；
- macOS 系统自带的 `/usr/bin/zip`。

运行前建议确认项目静态检查通过：

```bash
npm install
npm run check
```

如果 `/usr/bin/zip` 不存在，当前脚本会打包失败。其他操作系统需要先调整 `scripts/pack-aix.mjs` 中的压缩命令。

## 3. 打包命令

### 3.1 使用默认输出路径

```bash
npm run pack:aix
```

脚本会读取 `package.json` 中的 `version`，并生成：

```text
dist/moment-one-<version>.aix
```

如果同名文件已经存在，脚本会覆盖旧产物。

### 3.2 指定输出路径

可以把自定义 `.aix` 路径作为参数传入：

```bash
npm run pack:aix -- build/MomentOne-preview.aix
```

输出文件必须使用 `.aix` 扩展名，否则脚本会返回非零退出码。

## 4. 包内资源

当前打包脚本只复制运行和智能体描述所需资源，不会直接压缩整个仓库。

### 4.1 必需资源

以下任一资源缺失都会导致打包失败：

| 路径 | 用途 |
|---|---|
| `AGENTS.md` | 智能体身份、能力和产品规则 |
| `app.js` | 应用生命周期与全局逻辑 |
| `app.json` | 页面路由和全局窗口配置 |
| `pages/` | AIUI `.ink` 页面 |
| `services/` | Moment 存储、理解和格式化逻辑 |

### 4.2 可选资源

存在时会自动加入包中：

| 路径 | 用途 |
|---|---|
| `assets/` | 图片、音频等静态资源 |
| `prompts/` | 版本化模型提示词 |

### 4.3 自动生成资源

打包阶段会在临时目录中生成：

```text
VERSION
```

其内容是每次打包重新生成的唯一 UUID，例如：

```text
8dd9a8ff-50c9-4fca-a4e5-6a0fcf921af7
```

`package.json#version` 只用于 AIX 文件名和产品版本；`VERSION` 用于设备缓存校验，禁止改为固定语义版本号。

源代码目录中不需要手工维护 `VERSION` 文件。

### 4.4 不会进入 AIX 的内容

当前脚本不会加入以下开发或敏感资源：

- `.env`、`.env.example`；
- `node_modules/`；
- `dev/` 和 `docs/`；
- `dist-preview/`；
- `package-lock.json`；
- Git 元数据和本地日志。

新增运行时目录后，必须同步更新 `scripts/pack-aix.mjs` 的资源清单，否则该目录不会进入 AIX。

> `pages/` 中的文件被打入包内，不代表页面会自动成为可访问路由。实际注册页面仍以 `app.json#pages` 为准。

## 5. 10 MB 硬限制

最终 `.aix` 文件不得超过：

```text
10 MB = 10,000,000 字节
```

这里使用十进制 MB，不使用 `10 × 1024 × 1024` 字节的 MiB 口径。

`npm run pack:aix` 在生成文件后会立即检查包体积：

- 小于或等于 `10,000,000` 字节：打包成功；
- 大于 `10,000,000` 字节：返回非零退出码，禁止提交发布。

发布前仍必须独立执行一次体积校验：

```bash
npm run check:aix-size -- dist/moment-one-0.3.2.aix
```

也可以检查目录中的全部 `.aix` 文件：

```bash
npm run check:aix-size -- dist
```

目录中任意 AIX 超限，命令都会失败。

## 6. 完整本地验证流程

推荐按照以下顺序执行：

```bash
# 1. 检查 app.json、JavaScript 和 .ink 页面
npm run check

# 2. 生成 AIX
npm run pack:aix

# 3. 独立检查 10 MB 限制
npm run check:aix-size -- dist

# 4. 查看包内文件
unzip -l dist/moment-one-0.3.2.aix

# 5. 检查包内版本
unzip -p dist/moment-one-0.3.2.aix VERSION
```

如果包名版本不是 `0.3.2`，请把示例路径替换成实际的 `package.json#version`；`VERSION` 文件内容仍应是 UUID。

## 7. 当前验证结果

以下结果必须以最近一次本地执行输出为准；历史示例不作为发布证明：

| 项目 | 结果 |
|---|---|
| `npm run check` | 通过 |
| AIX 生成 | 通过 |
| 产物 | `dist/moment-one-0.3.2.aix` |
| 文件大小 | 以 `npm run pack:aix` 的最新输出为准，必须低于或等于 10 MB |
| 10 MB 校验 | 通过 |
| 包内 `VERSION` | 每次打包生成的唯一 UUID |
| AIX Reader 解析 | 通过 |
| Reader 识别标题 | `一刻 · Moment One` |
| Reader 识别注册页面 | 以 `app.json#pages` 为准，当前入口为 `pages/index/index` |

该大小仅代表当时的项目内容。页面、服务、提示词或静态资源变化后，应以最新打包结果为准。

## 8. 常见失败

### 8.1 缺少必需资源

示例：

```text
AIX 打包失败：缺少必需资源 app.json。
```

确认资源存在于项目根目录，且名称和大小写完全一致。

### 8.2 输出扩展名错误

示例：

```text
AIX 打包失败：输出文件必须使用 .aix 扩展名。
```

改用 `.aix` 文件名：

```bash
npm run pack:aix -- dist/moment-one-test.aix
```

### 8.3 未找到 AIX 文件

如果直接运行体积检查但还没有打包，会出现：

```text
AIX 大小校验失败：未找到 .aix 文件。
```

先执行：

```bash
npm run pack:aix
```

### 8.4 包体积超过 10 MB

优先检查：

1. `assets/` 是否包含高分辨率图片、长音频或视频；
2. 是否误把调试数据、模型文件或重复资源加入运行时目录；
3. 图片是否可以降低分辨率和质量；
4. 音频是否可以缩短、降低码率或改为运行时获取；
5. 是否可以删除未被页面和服务引用的资源。

不要通过修改或绕过 `10,000,000` 字节常量来发布超限包。

## 9. 隐私与安全检查

Moment One 处理私人生活记忆。打包前必须确认：

- AIX 内没有 `.env`、API Key、访问令牌或账号凭据；
- 没有真实用户的照片、录音、Moment 数据或调试导出；
- 示例数据不包含可识别个人身份的信息；
- 页面和服务只携带运行所需代码与静态资源。

可以使用以下命令人工审查包内清单：

```bash
unzip -l dist/moment-one-0.3.2.aix
```

## 10. 本地打包与正式发布的边界

当前实现完成的是：

- 本地生成 `.aix` 文件；
- 自动生成 `VERSION`；
- 使用 AIX Reader 读取包内容；
- 执行 10 MB 体积限制；
- 检查包内资源清单。

当前实现不代表已经完成：

- 官方 AIX CLI 的签名或平台专用处理；
- Rokid 灵珠平台上传与审核；
- 商店发布；
- Rokid Glasses 真机安装和运行验收。

因此，本地校验通过只能说明包可生成、可解析且体积合规。正式发布前仍需在官方工具链、发布平台和真机环境中完成最终验证。

## 11. 发布前检查清单

- [ ] `package.json#version` 已更新；
- [ ] `AGENTS.md` 中的版本与产品说明正确；
- [ ] `app.json#pages` 只注册需要发布的页面；
- [ ] `npm run check` 通过；
- [ ] `npm run pack:aix` 通过；
- [ ] `npm run check:aix-size -- dist` 通过；
- [ ] `unzip -l` 中没有密钥、用户数据或开发文件；
- [ ] 包内 `VERSION` 是本次打包新生成的唯一 UUID，且与上一次产物不同；
- [ ] 已完成 AIX Reader 解析验证；
- [ ] 已在官方发布平台和真机环境完成最终验收。
