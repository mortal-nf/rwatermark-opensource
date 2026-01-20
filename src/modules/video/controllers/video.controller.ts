import { Body, Controller, Post,Get, Query, Req, Res } from '@nestjs/common';
import { ResUtils } from '../../common/utils/res.utils';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { RWatermarkService } from '../services/index.service';
import { DownloadUrlDto, ParseWatermarkDto } from '../dto/rwatermark.dto';
import { Response } from 'express';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import { StreamDownloadService } from '../../download/services/stream-download.implementation';

@ApiTags('rwatermark')
@Controller('rwatermark')
export class RWatermarkController {
  constructor(
    private readonly rwatermarkService: RWatermarkService,
    private readonly streamDownloadService: StreamDownloadService
  ) {}

  @Post("parseWatermark")
  async parseWatermark(@Body() body:ParseWatermarkDto){
    // 简化处理，直接使用固定openid
    body.openid = "test_openid";
    let res = await this.rwatermarkService.parseWatermark(body);
    return ResUtils.success({
      data:res,
    });
  }
  @Get("download")
  @ApiQuery({ name: 'url', description: '要下载的文件URL', required: true })
  @ApiQuery({ name: 'fileName', description: '下载文件的文件名', required: false })
  async downloadFile(@Query() query: DownloadUrlDto, @Res() res: Response): Promise<void> {
    try {
      const cacheFilePath = this.streamDownloadService.getCacheFilePath(query.url);
      const range = res.req.headers.range; // 
      
      // 如果有Range请求
      if (range) {
        // 如果缓存存在，直接从缓存读取
        if (fs.existsSync(cacheFilePath)) {
          const fileStats = fs.statSync(cacheFilePath);
          const fileSize = fileStats.size;
          
          // 解析Range请求头，例如: "bytes=0-1023" 或 "bytes=1024-"
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          
          // 验证范围
          if (start >= fileSize || end >= fileSize || start > end) {
            res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
            res.end();
            return;
          }
          
          const chunksize = (end - start) + 1;
          const contentType = this.streamDownloadService.getCachedContentType(cacheFilePath) || 'application/octet-stream';
          
          // 生成文件名
          const fileName = query.fileName || `video_${Date.now()}.mp4`;

          // 设置206 Partial Content响应头
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', chunksize.toString());
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

          // 创建文件流，只读取请求的范围
          const fileStream = createReadStream(cacheFilePath, { start, end });
          
          fileStream.on('error', (error: any) => {
            console.error('文件流读取错误:', error);
            if (!res.headersSent) {
              res.status(500).end();
            }
          });
          
          fileStream.pipe(res);
          return;
        }
        
        // 缓存不存在，直接转发 Range 请求到源服务器（不等待下载完成）
        console.log('缓存不存在，直接转发 Range 请求到源服务器');
        try {
          const { stream, headers } = await this.streamDownloadService.getFileStreamWithRange(query.url, range);
          
          // 设置响应头（源服务器已经返回了正确的 206 响应头）
          res.status(206);
          Object.keys(headers).forEach(key => {
            if (headers[key]) {
              res.setHeader(key, headers[key]);
            }
          });
          
          // 同时触发后台下载（不阻塞当前请求）
          this.streamDownloadService.getFileStream(query.url).catch(err => {
            console.error('后台下载失败:', err);
          });
          
          stream.on('error', (error: any) => {
            if (error.message === 'aborted' || error.code === 'ECONNRESET') {
              console.log('客户端断开连接');
              return;
            }
            console.error('流传输错误:', error);
            if (!res.headersSent) {
              res.status(500).end();
            }
          });
          
          stream.pipe(res);
          return;
        } catch (error) {
          console.error('Range 请求转发失败:', error);
          if (!res.headersSent) {
            res.status(500).json({
              code: 500,
              msg: 'Range 请求处理失败',
            });
          }
          return;
        }
      }

      // 对于非Range请求或缓存不存在的情况，使用流式传输
      const { stream, headers: fileHeaders, isCached } = await this.streamDownloadService.getFileStream(query.url);
      
      // 设置响应头
      Object.keys(fileHeaders).forEach(key => {
        if (fileHeaders[key]) {
          res.setHeader(key, fileHeaders[key]);
        }
      });

      // 生成文件名
      const fileName = query.fileName || `video_${Date.now()}.mp4`;
      
      // 设置下载文件名
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

      // 如果使用缓存且没有Range请求，支持Range请求（设置Accept-Ranges）
      if (isCached && !range) {
        const fileStats = fs.statSync(cacheFilePath);
        res.setHeader('Accept-Ranges', 'bytes');
      }

      // 流式传输（缓存文件或透传流）
      stream.on('error', (error: any) => {
        // 客户端断开连接（aborted）是正常情况，不返回错误
        if (error.message === 'aborted' || error.code === 'ECONNRESET') {
          console.log('客户端断开连接');
          return;
        }
        console.error('流传输错误:', error);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      
      stream.pipe(res);
    } catch (error) {
      const statusCode = error.status || 500;
      if (!res.headersSent) {
        res.status(statusCode).json({
          code: statusCode,
          msg: error.message || '下载失败',
        });
      }
    }
  }
}
