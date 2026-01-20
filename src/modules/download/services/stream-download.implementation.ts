/**
 * 流式下载和Range请求支持的完整实现
 * 用于优化大文件下载，支持视频播放器的seek功能和图片的渐进式加载
 */

import { Injectable } from '@nestjs/common';
import { BusinessException, SystemException } from '../../common/utils/custom.exception';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createWriteStream, createReadStream } from 'fs';
import * as superagent from 'superagent';
import { PassThrough } from 'stream';

// 缓存元数据接口
interface CacheMetadata {
  createdAt: number; // 创建时间戳
  expiresAt: number; // 过期时间戳
  url: string; // 原始URL
}

// 缓存配置
const CACHE_CONFIG = {
  // 默认缓存过期时间：7天（单位：毫秒）
  DEFAULT_EXPIRY: 7 * 24 * 60 * 60 * 1000,
  // 缓存大小限制：10GB（单位：字节）
  MAX_SIZE: 10 * 1024 * 1024 * 1024,
  // 清理间隔：1小时（单位：毫秒）
  CLEANUP_INTERVAL: 60 * 60 * 1000
};
/**
 * Service层：流式下载实现
 */
@Injectable()
export class StreamDownloadService {
  // 将缓存目录设置为项目内部的shortVideos目录
  private readonly cacheDir: string=path.join(__dirname, '../../shortVideos');
  private readonly downloadingFiles = new Map<string, Promise<void>>();

  constructor() {
    // this.cacheDir = cacheDir;
    this.ensureCacheDir();
    // 启动定时清理任务
    this.startCleanupTask();
  }

  /**
   * 确保缓存目录存在
   */
  private ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 保存缓存元数据
   * @param filePath 缓存文件路径
   * @param url 原始URL
   */
  private saveCacheMetadata(filePath: string, url: string): void {
    try {
      const metadataPath = filePath + '.meta';
      const now = Date.now();
      const metadata: CacheMetadata = {
        createdAt: now,
        expiresAt: now + CACHE_CONFIG.DEFAULT_EXPIRY,
        url
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error(`保存缓存元数据失败: ${error.message}`);
      // 保存元数据失败不影响主流程
    }
  }

  /**
   * 获取缓存元数据
   * @param filePath 缓存文件路径
   * @returns 缓存元数据，如果不存在或解析失败则返回null
   */
  private getCacheMetadata(filePath: string): CacheMetadata | null {
    try {
      const metadataPath = filePath + '.meta';
      if (fs.existsSync(metadataPath)) {
        const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
        return JSON.parse(metadataContent) as CacheMetadata;
      }
    } catch (error) {
      console.error(`获取缓存元数据失败: ${error.message}`);
    }
    return null;
  }

  /**
   * 检查缓存是否过期
   * @param filePath 缓存文件路径
   * @returns 是否已过期
   */
  private isCacheExpired(filePath: string): boolean {
    const metadata = this.getCacheMetadata(filePath);
    if (!metadata) {
      // 没有元数据的旧缓存，默认过期
      return true;
    }
    return Date.now() > metadata.expiresAt;
  }

  /**
   * 删除缓存文件及其关联的元数据文件
   * @param filePath 缓存文件路径
   */
  private deleteCacheFile(filePath: string): void {
    try {
      // 删除主缓存文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // 删除ContentType文件
      const contentTypePath = filePath + '.content-type';
      if (fs.existsSync(contentTypePath)) {
        fs.unlinkSync(contentTypePath);
      }
      // 删除元数据文件
      const metadataPath = filePath + '.meta';
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
      console.log(`已删除缓存文件: ${filePath}`);
    } catch (error) {
      console.error(`删除缓存文件失败: ${error.message}`);
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCache(): void {
    console.log('开始清理过期缓存...');
    try {
      const files = fs.readdirSync(this.cacheDir);
      let deletedCount = 0;
      
      for (const file of files) {
        // 只处理主缓存文件，跳过.meta和.content-type文件
        if (file.endsWith('.meta') || file.endsWith('.content-type')) {
          continue;
        }
        
        const filePath = path.join(this.cacheDir, file);
        if (this.isCacheExpired(filePath)) {
          this.deleteCacheFile(filePath);
          deletedCount++;
        }
      }
      
      console.log(`清理完成，共删除 ${deletedCount} 个过期缓存文件`);
    } catch (error) {
      console.error(`清理过期缓存失败: ${error.message}`);
    }
  }

  /**
   * 启动定时清理任务
   */
  private startCleanupTask(): void {
    console.log(`启动缓存清理任务，清理间隔: ${CACHE_CONFIG.CLEANUP_INTERVAL / 1000 / 60} 分钟`);
    setInterval(() => {
      this.cleanupExpiredCache();
    }, CACHE_CONFIG.CLEANUP_INTERVAL);
    
    // 立即执行一次清理
    this.cleanupExpiredCache();
  }

  /**
   * 获取文件信息（返回文件路径，不加载到内存）
   * @param url 要下载的文件URL
   * @returns 返回文件路径和响应头信息
   */
  async getFileInfo(url: string): Promise<{ filePath: string; headers: any; contentType: string }> {
    // 获取缓存文件路径
    const cacheFilePath = this.getCacheFilePath(url);
    
    // 检查缓存文件是否存在且未过期
    if (fs.existsSync(cacheFilePath) && !this.isCacheExpired(cacheFilePath)) {
      console.log(`使用缓存文件: ${cacheFilePath}`);
      const fileStats = fs.statSync(cacheFilePath);
      const contentType = this.getCachedContentType(cacheFilePath) || 'application/octet-stream';
      
      return {
        filePath: cacheFilePath,
        headers: {
          'content-type': contentType,
          'content-length': fileStats.size.toString(),
          'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
          'accept-ranges': 'bytes', // 支持Range请求
        },
        contentType,
      };
    } else if (fs.existsSync(cacheFilePath)) {
      // 缓存过期，删除过期缓存
      console.log(`缓存文件已过期，删除: ${cacheFilePath}`);
      this.deleteCacheFile(cacheFilePath);
    }

    // 检查是否正在下载（并发控制）
    const existingDownload = this.downloadingFiles.get(cacheFilePath);
    if (existingDownload) {
      console.log(`文件正在下载中，等待完成: ${cacheFilePath}`);
      // 等待正在进行的下载完成
      await existingDownload;
      // 下载完成后返回文件路径
      const fileStats = fs.statSync(cacheFilePath);
      const contentType = this.getCachedContentType(cacheFilePath) || 'application/octet-stream';
      return {
        filePath: cacheFilePath,
        headers: {
          'content-type': contentType,
          'content-length': fileStats.size.toString(),
          'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
          'accept-ranges': 'bytes',
        },
        contentType,
      };
    }

    // 创建下载任务
    const downloadPromise = this.doStreamDownload(url, cacheFilePath);
    
    // 将下载任务加入锁
    this.downloadingFiles.set(cacheFilePath, downloadPromise);

    try {
      await downloadPromise;
      // 下载完成后返回文件路径
      const fileStats = fs.statSync(cacheFilePath);
      const contentType = this.getCachedContentType(cacheFilePath) || 'application/octet-stream';
      return {
        filePath: cacheFilePath,
        headers: {
          'content-type': contentType,
          'content-length': fileStats.size.toString(),
          'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
          'accept-ranges': 'bytes',
        },
        contentType,
      };
    } finally {
      // 下载完成或失败后，从锁中移除
      this.downloadingFiles.delete(cacheFilePath);
    }
  }

  /**
   * 执行流式下载操作（带重试机制）
   * 使用流式下载，避免大文件占用过多内存
   * @param url 文件URL
   * @param cacheFilePath 缓存文件路径
   * @returns Promise<void> 下载完成
   */
  private async doStreamDownload(url: string, cacheFilePath: string): Promise<void> {
    console.log("doStreamDownload",url,cacheFilePath);
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 再次检查缓存（可能在等待期间其他请求已经下载完成）
        if (fs.existsSync(cacheFilePath)) {
          console.log(`等待期间文件已下载完成，使用缓存: ${cacheFilePath}`);
          return;
        }

        // 创建临时文件路径（下载中）
        const tempFilePath = cacheFilePath + '.tmp';
        
        // 构建请求
        let request = superagent
          .get(url)
          .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
          .timeout({
            response: 300000, // 5分钟响应超时
            deadline: 600000, // 10分钟总超时
          });
          
        if (url.includes('weibo')) {
          request = request.set('Referer', 'https://weibo.com');
        }
        if (url.includes('upos-sz-mirrorhw.bilivideo.com')) {
          request = request.set('Referer', 'https://upos-sz-mirrorhw.bilivideo.com');
        }
        if (url.includes('v26-web.douyinvod.com') || url.includes('www.douyin.com') || url.includes('v3-web.douyinvod.com')) {
          request = request.set('Referer', 'https://www.douyin.com');
        }

        // 使用流式下载，直接写入文件
        return await new Promise<void>((resolve, reject) => {
          const writeStream = createWriteStream(tempFilePath);
          let contentType = 'application/octet-stream';
          // writeStream.on("pip")
          request
            .ok(() => true) // 允许所有状态码
            .on('response', (response) => {
              console.log("response",response.status);
              // 检查响应状态码
              if (response.status >= 400) {
                writeStream.destroy();
                fs.unlinkSync(tempFilePath)
                reject(new BusinessException('DOWNLOAD_FAILED', `下载失败，状态码: ${response.status}`));
                return;
              }

              // 获取响应头信息
              contentType = response.headers['content-type'] || 'application/octet-stream';
            })
            .pipe(writeStream)
            .on('finish', async () => {
              console.log("finish");
              try {
                writeStream.close();
                
                // 下载完成后，将临时文件重命名为正式文件
                fs.renameSync(tempFilePath, cacheFilePath);
                
                // 保存Content-Type信息
                this.saveContentTypeOnly(cacheFilePath, contentType);
                
                console.log(`文件下载完成: ${cacheFilePath}`);
                resolve();
              } catch (error) {
                // 清理临时文件
                if (fs.existsSync(tempFilePath)) {
                  fs.unlinkSync(tempFilePath)
                }
                reject(error);
              }
            })
            .on('error', (error) => {
              writeStream.destroy();
              // 清理临时文件
              if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath)
              }
              reject(error);
            });
        });
      } catch (error) {
        lastError = error;
        
        // 如果是最后一次尝试，抛出错误
        if (attempt >= maxRetries) {
          break;
        }
        
        // 等待后重试（递增延迟：1s, 2s）
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    // 所有重试都失败
    if (lastError instanceof BusinessException || lastError instanceof SystemException) {
      throw lastError;
    }
    throw new SystemException('DOWNLOAD_FAILED', `下载文件失败（已重试${maxRetries}次）: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 获取缓存文件路径（公开方法，供Controller使用）
   * @param url 文件URL
   * @returns 缓存文件完整路径
   */
  public getCacheFilePath(url: string): string {
    // 对URL进行MD5加密
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    
    // 生成文件名（仅MD5，无扩展名）
    const fileName = urlHash;
    
    // 返回完整路径
    return path.join(this.cacheDir, fileName);
  }

  /**
   * 获取缓存文件的Content-Type信息（公开方法，供Controller使用）
   * @param filePath 文件路径
   * @returns Content-Type，如果不存在则返回null
   */
  public getCachedContentType(filePath: string): string | null {
    try {
      const contentTypePath = filePath + '.content-type';
      if (fs.existsSync(contentTypePath)) {
        return fs.readFileSync(contentTypePath, 'utf-8').trim();
      }
    } catch (error) {
      // 忽略错误
    }
    return null;
  }

  /**
   * 获取正在下载的Promise（公开方法，供Controller使用）
   * @param cacheFilePath 缓存文件路径
   * @returns 正在下载的Promise，如果不存在则返回null
   */
  public getDownloadingPromise(cacheFilePath: string): Promise<void> | null {
    return this.downloadingFiles.get(cacheFilePath) || null;
  }

  /**
   * 确保文件已下载完成（公开方法，供Controller使用）
   * @param url 文件URL
   * @returns Promise<void> 下载完成
   */
  public async ensureFileDownloaded(url: string): Promise<void> {
    const cacheFilePath = this.getCacheFilePath(url);
    
    // 如果文件已存在，直接返回
    if (fs.existsSync(cacheFilePath)) {
      return;
    }
    
    // 检查是否正在下载
    const existingDownload = this.downloadingFiles.get(cacheFilePath);
    if (existingDownload) {
      // 等待正在进行的下载完成
      await existingDownload;
      return;
    }
    
    // 触发下载
    const downloadPromise = this.doStreamDownload(url, cacheFilePath);
    this.downloadingFiles.set(cacheFilePath, downloadPromise);
    
    try {
      await downloadPromise;
    } finally {
      // 下载完成或失败后，从锁中移除
      this.downloadingFiles.delete(cacheFilePath);
    }
  }

  /**
   * 获取支持 Range 请求的文件流（直接转发 Range 请求到源服务器）
   * 当缓存不存在时，直接转发 Range 请求到源服务器，无需等待完整下载
   * @param url 文件URL
   * @param rangeHeader Range 请求头，如 "bytes=0-1023"
   * @returns 返回文件流和响应头
   */
  public async getFileStreamWithRange(
    url: string, 
    rangeHeader: string
  ): Promise<{
    stream: NodeJS.ReadableStream;
    headers: any;
    contentType: string;
  }> {
    // 构建请求，直接转发 Range 请求头到源服务器
    let request = superagent
      .get(url)
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      .set('Range', rangeHeader) // 转发 Range 请求
      .timeout({
        response: 300000, // 5分钟响应超时（视频文件可能需要更长时间）
        deadline: 600000, // 10分钟总超时
      });
      
    if (url.includes('weibo')) {
      request = request.set('Referer', 'https://weibo.com');
    }
    if (url.includes('upos-sz-mirrorhw.bilivideo.com')) {
      request = request.set('Referer', 'https://upos-sz-mirrorhw.bilivideo.com');
    }
    if (url.includes('v26-web.douyinvod.com') || url.includes('www.douyin.com') || url.includes('v3-web.douyinvod.com')) {
      request = request.set('Referer', 'https://www.douyin.com');
    }

    return new Promise((resolve, reject) => {
      const passThrough = new PassThrough();
      let contentType = 'application/octet-stream';
      let contentRange: string | undefined;
      let contentLength: string | undefined;
      let resolved = false;

      request
        .ok(() => true)
        .on('response', (response) => {
          console.log("Range请求响应状态:", response.status);
          
          if (response.status >= 400) {
            passThrough.destroy();
            if (!resolved) {
              resolved = true;
              reject(new BusinessException('DOWNLOAD_FAILED', `Range请求失败，状态码: ${response.status}`));
            }
            return;
          }

          contentType = response.headers['content-type'] || 'application/octet-stream';
          contentRange = response.headers['content-range'];
          contentLength = response.headers['content-length'];

          // 监听响应流本身的错误（连接重置等）
          response.on('error', (error: any) => {
            console.error(`Range请求响应流错误: ${error.message}`);
            // 如果是客户端断开连接（aborted），只清理资源，不 reject Promise
            if (error.message === 'aborted' || error.code === 'ECONNRESET') {
              passThrough.destroy();
              return;
            }
            
            // 其他错误才 reject
            passThrough.destroy();
            if (!resolved) {
              resolved = true;
              reject(error);
            }
          });

          // 立即返回流
          if (!resolved) {
            resolved = true;
            resolve({
              stream: passThrough,
              headers: {
                'content-type': contentType,
                'content-range': contentRange || '',
                'content-length': contentLength || '',
                'accept-ranges': 'bytes',
              },
              contentType,
            });
          }
        })
        .on('error', (error: any) => {
          console.error(`Range请求错误: ${error.message}`);
          // 如果是超时错误，记录但不影响已返回的流
          if (error.timeout || error.code === 'ECONNABORTED' || error.code === 'ETIME') {
            console.error(`Range请求超时: ${error.message}`);
            passThrough.destroy();
            if (!resolved) {
              resolved = true;
              reject(error);
            }
            return;
          }
          passThrough.destroy();
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        })
        .pipe(passThrough)
        .on('error', (error: any) => {
          console.error(`Range请求pipe流错误: ${error.message}`);
          // 如果是客户端断开连接，只清理资源
          if (error.message === 'aborted' || error.code === 'ECONNRESET') {
            passThrough.destroy();
            return;
          }
          passThrough.destroy();
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        });

      // 监听 passThrough 流的错误（客户端断开连接等情况）
      passThrough.on('error', (error: any) => {
        console.error(`passThrough流错误: ${error.message}`);
        // 客户端断开连接不影响，只清理资源
        // 不调用 reject，因为流已经返回给 Controller
      });
    });
  }

  /**
   * 仅保存Content-Type信息（不保存文件内容）
   */
  private saveContentTypeOnly(filePath: string, contentType: string) {
    try {
      const contentTypePath = filePath + '.content-type';
      fs.writeFileSync(contentTypePath, contentType);
    } catch (error) {
      console.error(`保存Content-Type失败: ${error.message}`);
    }
  }

  /**
   * 从URL中提取文件名
   */
  private getFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split('/').pop() || 'download';
      return decodeURIComponent(fileName);
    } catch {
      return 'download';
    }
  }

  /**
   * 获取文件流（流式透传，不等待完整下载）
   * 如果缓存存在，返回文件流；如果不存在，返回源URL的流并后台缓存
   * @param url 要下载的文件URL
   * @returns 返回文件流、响应头和是否使用缓存
   */
  async getFileStream(url: string): Promise<{
    stream: NodeJS.ReadableStream;
    headers: any;
    contentType: string;
    isCached: boolean;
  }> {
    const cacheFilePath = this.getCacheFilePath(url);
    
    // 如果缓存存在且未过期，直接返回文件流
    if (fs.existsSync(cacheFilePath) && !this.isCacheExpired(cacheFilePath)) {
      console.log(`使用缓存文件: ${cacheFilePath}`);
      // 清理可能存在的残留 Promise（如果文件已经存在，说明下载已完成）
      this.downloadingFiles.delete(cacheFilePath);
      
      const fileStats = fs.statSync(cacheFilePath);
      const contentType = this.getCachedContentType(cacheFilePath) || 'application/octet-stream';
      
      return {
        stream: createReadStream(cacheFilePath),
        headers: {
          'content-type': contentType,
          'content-length': fileStats.size.toString(),
          'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
          'accept-ranges': 'bytes',
        },
        contentType,
        isCached: true,
      };
    } else if (fs.existsSync(cacheFilePath)) {
      // 缓存过期，删除过期缓存
      console.log(`缓存文件已过期，删除: ${cacheFilePath}`);
      this.deleteCacheFile(cacheFilePath);
    }

    // 缓存不存在，检查是否正在下载
    console.log("downloadingFiles",this.downloadingFiles.keys());
    const existingDownload = this.downloadingFiles.get(cacheFilePath);
    if (existingDownload) {
      console.log(`文件正在下载中，等待完成: ${cacheFilePath}`);
      try {
        await existingDownload;
        // 等待完成后，再次检查文件是否存在
        if (fs.existsSync(cacheFilePath)) {
          const fileStats = fs.statSync(cacheFilePath);
          const contentType = this.getCachedContentType(cacheFilePath) || 'application/octet-stream';
          return {
            stream: createReadStream(cacheFilePath),
            headers: {
              'content-type': contentType,
              'content-length': fileStats.size.toString(),
              'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
              'accept-ranges': 'bytes',
            },
            contentType,
            isCached: true,
          };
        } else {
          // 等待完成后文件不存在，清理锁并抛出错误
          this.downloadingFiles.delete(cacheFilePath);
          throw new SystemException('DOWNLOAD_FAILED', '文件下载完成但文件不存在');
        }
      } catch (error) {
        // 下载失败，清理锁
        this.downloadingFiles.delete(cacheFilePath);
        throw error;
      }
    }

    // 缓存不存在且没有正在下载，创建流式透传 + 后台缓存
    return this.createStreamWithBackgroundCache(url, cacheFilePath);
  }

  /**
   * 创建流式透传，同时后台缓存（使用 buffer 模式）
   * @param url 文件URL
   * @param cacheFilePath 缓存文件路径
   * @returns 返回源URL的流和响应头
   */
  private async createStreamWithBackgroundCache(
    url: string,
    cacheFilePath: string
  ): Promise<{
    stream: NodeJS.ReadableStream;
    headers: any;
    contentType: string;
    isCached: boolean;
  }> {
    console.log("createStreamWithBackgroundCache",url,cacheFilePath);
    
    // 构建请求（用于前端流式传输）
    let request = superagent
      .get(url)
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      .timeout({
        response: 600000, // 10分钟响应超时
        deadline: 600000, // 10分钟总超时
      });
      
    if (url.includes('weibo')) {
      request = request.set('Referer', 'https://weibo.com');
    }
    if (url.includes('upos-sz-mirrorhw.bilivideo.com')) {
      request = request.set('Referer', 'https://upos-sz-mirrorhw.bilivideo.com');
    }
    if (url.includes('v26-web.douyinvod.com') || url.includes('www.douyin.com') || url.includes('v3-web.douyinvod.com')) {
      request = request.set('Referer', 'https://www.douyin.com');
    }

    // 创建下载Promise（用于并发控制）- 使用 buffer 模式
    const downloadPromise = this.downloadWithBuffer(url, cacheFilePath).catch(err => {
      console.error(`后台缓存下载失败: ${err.message}`);
      // 后台下载失败不影响前端流
    });

    // 将下载任务加入锁（在请求发送前就加入，避免并发问题）
    this.downloadingFiles.set(cacheFilePath, downloadPromise);

    return new Promise((resolve, reject) => {
      let contentType = 'application/octet-stream';
      let contentLength: string | undefined;
      let resolved = false;

      // 创建透传流（用于返回给前端）
      const passThrough = new PassThrough();

      // 设置事件监听器
      request
        .ok(() => true)
        .on('response', (response) => {
          console.log("response",response.status);
          
          if (response.status >= 400) {
            passThrough.destroy();
            this.downloadingFiles.delete(cacheFilePath);
            if (!resolved) {
              resolved = true;
              reject(new BusinessException('DOWNLOAD_FAILED', `下载失败，状态码: ${response.status}`));
            }
            return;
          }

          contentType = response.headers['content-type'] || 'application/octet-stream';
          contentLength = response.headers['content-length'];
          
          // 保存Content-Type（即使文件还没下载完）
          this.saveContentTypeOnly(cacheFilePath, contentType);

          // 监听响应流本身的错误（连接重置等）
          response.on('error', (error: any) => {
            console.error(`响应流错误: ${error.message}`);
            // 如果是客户端断开连接（aborted），只清理资源
            if (error.message === 'aborted' || error.code === 'ECONNRESET') {
              passThrough.destroy();
              return;
            }
            
            // 其他错误才 reject
            passThrough.destroy();
            this.downloadingFiles.delete(cacheFilePath);
            if (!resolved) {
              resolved = true;
              reject(error);
            }
          });

          // 立即返回流，不等待下载完成
          if (!resolved) {
            resolved = true;
            resolve({
              stream: passThrough,
              headers: {
                'content-type': contentType,
                'content-length': contentLength || '',
                'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
                'accept-ranges': 'bytes',
              },
              contentType,
              isCached: false,
            });
          }
        })
        .on('error', (error: any) => {
          console.error(`请求错误: ${error.message}`);
          passThrough.destroy();
          this.downloadingFiles.delete(cacheFilePath);
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        })
        .pipe(passThrough)
        .on('error', (error: any) => {
          console.error(`pipe流错误: ${error.message}`);
          // 如果是客户端断开连接，只清理资源
          if (error.message === 'aborted' || error.code === 'ECONNRESET') {
            passThrough.destroy();
            return;
          }
          passThrough.destroy();
          this.downloadingFiles.delete(cacheFilePath);
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        });

      // 监听 passThrough 流的错误（客户端断开连接等情况）
      passThrough.on('error', (error: any) => {
        console.error(`passThrough流错误: ${error.message}`);
        // 客户端断开连接不影响后台缓存，只清理资源
      });
    });
  }

  /**
   * 使用 buffer 模式下载文件并保存到缓存（后台任务）
   * @param url 文件URL
   * @param cacheFilePath 缓存文件路径
   * @returns Promise<void> 下载完成
   */
  private async downloadWithBuffer(url: string, cacheFilePath: string): Promise<void> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 再次检查缓存（可能在等待期间其他请求已经下载完成）
        if (fs.existsSync(cacheFilePath)) {
          console.log(`等待期间文件已下载完成，使用缓存: ${cacheFilePath}`);
          return;
        }

        // 构建请求
        let request = superagent
          .get(url)
          .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
          .timeout({
            response: 300000*30, // 5分钟响应超时
            deadline: 600000*10, // 10分钟总超时
          });
          
        if (url.includes('weibo')) {
          request = request.set('Referer', 'https://weibo.com');
        }
        if (url.includes('upos-sz-mirrorhw.bilivideo.com')) {
          request = request.set('Referer', 'https://upos-sz-mirrorhw.bilivideo.com');
        }
        if (url.includes('v26-web.douyinvod.com') || url.includes('www.douyin.com') || url.includes('v3-web.douyinvod.com')) {
          request = request.set('Referer', 'https://www.douyin.com');
        }

        const response = await request.ok(() => true);

        // 检查响应状态码
        if (response.status >= 400) {
          throw new BusinessException('DOWNLOAD_FAILED', `下载失败，状态码: ${response.status}`);
        }

        // 获取响应头
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        const fileBody = Buffer.from(response.body);

        // 保存到缓存（同时保存Content-Type信息）
        this.saveToCache(cacheFilePath, fileBody, contentType, url);

        console.log(`后台缓存完成: ${cacheFilePath}`);
        return;
      } catch (error) {
        lastError = error;
        
        // 如果是最后一次尝试，抛出错误
        if (attempt >= maxRetries) {
          break;
        }
        
        // 等待后重试（递增延迟：1s, 2s）
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    // 所有重试都失败
    if (lastError instanceof BusinessException || lastError instanceof SystemException) {
      throw lastError;
    }
    throw new SystemException('DOWNLOAD_FAILED', `后台下载文件失败（已重试${maxRetries}次）: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 获取缓存目录的总大小
   * @returns 缓存目录大小（字节）
   */
  private getCacheSize(): number {
    let totalSize = 0;
    
    try {
      const files = fs.readdirSync(this.cacheDir);
      
      for (const file of files) {
        // 只计算主缓存文件的大小，跳过.meta和.content-type文件
        if (file.endsWith('.meta') || file.endsWith('.content-type')) {
          continue;
        }
        
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }
    } catch (error) {
      console.error(`计算缓存大小失败: ${error.message}`);
    }
    
    return totalSize;
  }

  /**
   * 按LRU原则清理旧缓存
   * @param targetSize 目标大小（清理后缓存大小不超过此值）
   */
  private cleanupCacheByLRU(targetSize: number): void {
    console.log(`开始按LRU原则清理缓存，目标大小: ${targetSize} 字节`);
    
    try {
      const files = fs.readdirSync(this.cacheDir);
      const cacheFiles: Array<{ filePath: string; createdAt: number; size: number }> = [];
      
      // 收集所有主缓存文件及其创建时间和大小
      for (const file of files) {
        if (file.endsWith('.meta') || file.endsWith('.content-type')) {
          continue;
        }
        
        const filePath = path.join(this.cacheDir, file);
        const metadata = this.getCacheMetadata(filePath);
        const stats = fs.statSync(filePath);
        
        cacheFiles.push({
          filePath,
          createdAt: metadata?.createdAt || 0,
          size: stats.size
        });
      }
      
      // 按创建时间排序（旧的在前，新的在后）
      cacheFiles.sort((a, b) => a.createdAt - b.createdAt);
      
      let currentSize = this.getCacheSize();
      let deletedCount = 0;
      
      // 开始清理旧文件，直到达到目标大小
      for (const cacheFile of cacheFiles) {
        if (currentSize <= targetSize) {
          break;
        }
        
        this.deleteCacheFile(cacheFile.filePath);
        currentSize -= cacheFile.size;
        deletedCount++;
      }
      
      console.log(`LRU清理完成，共删除 ${deletedCount} 个文件，当前缓存大小: ${currentSize} 字节`);
    } catch (error) {
      console.error(`LRU清理缓存失败: ${error.message}`);
    }
  }

  /**
   * 检查并清理超出大小限制的缓存
   */
  private checkAndCleanupCacheSize(): void {
    const currentSize = this.getCacheSize();
    console.log(`当前缓存大小: ${currentSize} 字节，限制: ${CACHE_CONFIG.MAX_SIZE} 字节`);
    
    if (currentSize > CACHE_CONFIG.MAX_SIZE) {
      // 清理到限制大小的80%
      const targetSize = Math.floor(CACHE_CONFIG.MAX_SIZE * 0.8);
      this.cleanupCacheByLRU(targetSize);
    }
  }

  /**
   * 保存文件到缓存
   * @param filePath 文件路径
   * @param content 文件内容
   * @param contentType Content-Type
   * @param url 原始URL
   */
  private saveToCache(filePath: string, content: Buffer, contentType: string, url: string): void {
    try {
      // 保存文件内容
      fs.writeFileSync(filePath, content);
      console.log(`文件已保存到缓存: ${filePath}`);
      
      // 保存Content-Type信息到单独文件
      const contentTypePath = filePath + '.content-type';
      fs.writeFileSync(contentTypePath, contentType);
      
      // 保存元数据
      this.saveCacheMetadata(filePath, url);
      
      // 检查并清理超出大小限制的缓存
      this.checkAndCleanupCacheSize();
    } catch (error) {
      console.error(`保存缓存文件失败: ${error.message}`);
      throw error;
    }
  }
}