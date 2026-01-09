# RWatermark - 多平台无水印视频解析服务

一个基于 nodejs/NestJS 的多平台短视频无水印解析服务，支持从抖音、小红书、快手、微博、B站、头条等平台提取无水印视频。

## ✨ 特性

- 🎯 **多平台支持**：支持抖音、小红书、快手、微博、B站、头条等多个主流短视频平台
- 🚀 **流式下载**：支持大文件流式传输，节省内存
- 💾 **智能缓存**：自动缓存已下载文件，支持断点续传（Range 请求）
- 🔄 **自动清理**：定时清理超过 24 小时的缓存文件
- 🛡️ **并发控制**：防止同一文件重复下载
- 📊 **数据持久化**：解析记录保存到数据库，支持查询和管理

## 🎬 支持的平台

| 平台 | 支持状态 | URL 格式示例 |
|------|---------|-------------|
| 抖音 | ✅ | `https://v.douyin.com/xxx` |
| 小红书 | ✅ | `https://xhslink.com/o/xxx` |
| 快手 | ✅ | `https://v.kuaishou.com/xxx` |
| 微博 | ✅ | `https://video.weibo.com/show?fid=xxx` |
| B站 | ✅ | `https://www.bilibili.com/video/xxx` 或 `https://b23.tv/xxx` |
| 头条 | ✅ | `https://m.toutiao.com/is/xxx` |

## 📱 客户端

本项目提供客户端应用，扫码即可使用：

<img src="imgs/f2838ca8ea2dca0dfd657fefc354c250.jpg" alt="客户端二维码" width="200" />


扫码后即可体验完整功能，无需手动配置 API 接口。

## 📋 前置要求

- Node.js >= 16.x
- TypeScript
- NestJS
- TypeORM
- Puppeteer（用于抖音解析）
- 数据库（MySQL/PostgreSQL 等）

## 🚀 快速开始

### 安装依赖， 运行服务

```bash
自己复制到nest的项目内，查看文件需要什么依赖 自己安装
```

### 环境配置

配置数据库连接和相关环境变量。


## 📡 API 接口

### 1. 解析视频水印

**接口地址：** `POST /api/rwatermark/parseWatermark`

**请求头：**
```
token: JWT token
```

### 2. 获取视频列表

**接口地址：** `POST /api/rwatermark/findShortVideoList`

**请求头：**
```
token: JWT token
```

**响应示例：**
```json
{
  "code": 200,
  "data": {
    "rows": [
      {
        "id": 1,
        "type": "douyin",
        "title": "视频标题",
        "cover": "封面图片URL",
        "videoUrl": "视频URL",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 3. 获取视频详情

**接口地址：** `POST /api/rwatermark/findShortVideoDetail`

**请求头：**
```
token: JWT token
```

**请求体：**
```json
{
  "id": 1
}
```

### 4. 删除视频记录

**接口地址：** `POST /api/rwatermark/deleteShortVideo`

**请求头：**
```
token: JWT token
```

**请求体：**
```json
{
  "id": 1
}
```

### 5. 下载文件

**接口地址：** `GET /api/rwatermark/download?url={文件URL}`

**说明：**
- 支持 Range 请求（断点续传）
- 自动缓存文件，提高下载速度
- 支持流式传输，节省服务器内存

**示例：**
```
GET /api/rwatermark/download?url=https://example.com/video.mp4
```

## 🏗️ 项目结构

```
rwatermark-opensource/
├── dto/                    # 数据传输对象
│   └── rwatermark.dto.ts
├── entities/               # 数据库实体
│   └── shortVideo.entity.ts
├── puppeteer/              # Puppeteer 相关工具
│   ├── puppeteer.ts
│   ├── tools.ts
│   └── types.ts
├── imgs/                   # 图片资源
│   └── f2838ca8ea2dca0dfd657fefc354c250.jpg
├── bilibili.service.ts     # B站解析服务
├── douyinV2.service.ts     # 抖音解析服务
├── kuaishou.service.ts     # 快手解析服务
├── toutiao.service.ts      # 头条解析服务
├── vdouyin.service.ts      # 抖音旧版服务
├── weibo.service.ts        # 微博解析服务
├── xhs.service.ts          # 小红书解析服务
├── index.controller.ts     # 控制器
├── index.service.ts        # 主服务
├── index.module.ts         # 模块定义
└── stream-download.implementation.ts  # 流式下载实现
```

## 🔧 核心功能

### 1. 视频解析

服务会自动识别 URL 所属平台，并调用对应的解析服务：

```typescript
// 自动识别平台并解析
await rwatermarkService.parseWatermark({
  url: "https://v.douyin.com/xxx",
  openid: "user_openid"
});
```

### 2. 流式下载

支持大文件的流式传输，避免内存溢出：

- 自动缓存已下载文件
- 支持 HTTP Range 请求（断点续传）
- 并发下载控制，避免重复下载
- 自动重试机制（最多 2 次）

### 3. 缓存管理

- 文件缓存路径：`shortVideos/` 目录
- 缓存文件命名：URL 的 MD5 值
- 自动清理：每小时清理超过 24 小时的缓存文件

## ⚙️ 配置说明

### Puppeteer 配置

抖音解析需要使用 Puppeteer，确保已正确配置浏览器路径。

### 代理配置

某些平台（如小红书）可能需要配置代理才能正常解析，可在对应服务中配置 `proxyurl`。

## 📝 注意事项

1. **合规使用**：请遵守各平台的使用条款，仅用于个人学习和研究
2. **频率限制**：建议控制请求频率，避免被平台封禁
3. **缓存目录**：确保 `shortVideos/` 目录有足够的存储空间
4. **数据库**：需要配置 TypeORM 数据库连接
5. **认证**：接口需要 JWT token 认证（除下载接口外）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目采用 MIT 许可证。


---

**免责声明**：本项目仅供学习交流使用，请勿用于商业用途。使用本工具产生的任何后果由使用者自行承担。

