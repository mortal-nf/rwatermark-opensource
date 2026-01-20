import {  HttpException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ParseWatermarkDto } from '../../dto/rwatermark.dto';

import * as superagent from 'superagent';
import { XhsService } from './xhs.service';
import { KuaishouService } from './kuaishou.service';
import { WeiboService } from './weibo.service';
import { BilibiliService } from './bilibili.service';
import { DouyinV2Service } from './douyinV2.service';
import { ToutiaoService } from './toutiao.service';
import { TwitterService } from './twitter.service';
@Injectable()
export class RWatermarkService {
      // 缓存目录路径
      private readonly cacheDir = path.join(__dirname, '../../shortVideos');
      
      // 下载锁：存储正在下载的文件，key为文件路径，value为下载Promise
      private readonly downloadingFiles = new Map<string, Promise<{ body: Buffer; headers: any; contentType: string }>>();

      constructor(
  
        private xhsService:XhsService,
        private kuaishouService:KuaishouService,
        private weiboService:WeiboService,
        private bilibiliService:BilibiliService,
        private douyinV2Service:DouyinV2Service,
        private toutiaoService:ToutiaoService,
        private twitterService:TwitterService
    ) {
      // 确保缓存目录存在
      this.ensureCacheDir();
    }

    /**
     * 确保缓存目录存在
     */
    private ensureCacheDir() {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    }
     async parseWatermark(body:ParseWatermarkDto):Promise<any>{
        console.log("body",body);
        let matchResult =  body.url.match(/https?:\/\/v\.douyin\.com\/[a-zA-Z0-9_\-\/]+/);
        console.log("matchResult",matchResult);
        if(matchResult && matchResult[0]){
          let res = await this.douyinV2Service.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }
        //🤰🏻孕26w｜日渐圆润的小腹婆幸福日常💖 现在已经胖到... http://xhslink.com/o/5rq6q20WQmz 复制后打开【小红书】查看笔记！
        matchResult =  body.url.match(/https?:\/\/xhslink\.com\/o\/[a-zA-Z0-9_\-\/]+/);
        if(matchResult && matchResult[0]){
          console.log("matchResult",matchResult);
          let res = await this.xhsService.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }
        matchResult =  body.url.match(/https?:\/\/v\.kuaishou\.com\/[a-zA-Z0-9_\-\/]+/);
        if(matchResult && matchResult[0]){
          let res = await this.kuaishouService.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }
        // https://video.weibo.com/show?fid=1034:5250750989926459
        matchResult =  body.url.match(/https?:\/\/video\.weibo\.com\/show\?fid=[a-zA-Z0-9_\-\/\:]+/);
        if(matchResult && matchResult[0]){
          let res = await this.weiboService.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }
        matchResult =  body.url.match(/https?:\/\/www\.bilibili\.com\/video\/[a-zA-Z0-9_\-\/]+/);
        if(matchResult && matchResult[0]){
          let res = await this.bilibiliService.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }
        // 【" 昨晚party那只鸡应该不超过200块吧 ! 那你都能吃得下啊 ! "-哔哩哔哩】 https://b23.tv/rj4fIGJ
        matchResult =  body.url.match(/https?:\/\/b23\.tv\/[a-zA-Z0-9_\-\/]+/);
        if(matchResult && matchResult[0]){
          let res = await this.bilibiliService.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }
        matchResult =  body.url.match(/https?:\/\/m\.toutiao\.com\/is\/[a-zA-Z0-9_\-\/]+/);
        console.log("matchResult",matchResult)
        if(matchResult && matchResult[0]){
          let res = await this.toutiaoService.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }
        // matchResult =  body.url.match(/https?:vixiguacom[a-zA-Z0-9_]+/);
        // if(matchResult && matchResult[0]){
        //   let res = await this.xiguaService.parseWatermark(matchResult[0],body.openid,body.url);
        //   return res; 
        // }
        
        // Twitter/X平台支持
        matchResult =  body.url.match(/https?:\/\/(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/);
        if(matchResult && matchResult[0]){
          let res = await this.twitterService.parseWatermark(matchResult[0],body.openid,body.url);
          return res; 
        }

        // 没有匹配到任何支持的平台
        throw new HttpException('不支持的平台链接', 400);
     }
 
   /**
     * 转发下载文件（带缓存和重试机制）
     * @param url 要下载的文件URL
     * @returns 返回文件内容和响应头信息
     */
    async downloadFile(url: string): Promise<{ body: Buffer; headers: any; contentType: string }> {
      // 获取缓存文件路径
      const cacheFilePath = this.getCacheFilePath(url);
      
      // 检查缓存文件是否存在
      if (fs.existsSync(cacheFilePath)) {
        console.log(`使用缓存文件: ${cacheFilePath}`);
        const fileContent = fs.readFileSync(cacheFilePath);
        
        // 尝试从响应头缓存文件读取Content-Type，如果没有则使用默认值
        const contentType = this.getCachedContentType(cacheFilePath) || 'application/octet-stream';
        
        return {
          body: fileContent,
          headers: {
            'content-type': contentType,
            'content-length': fileContent.length.toString(),
            'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
          },
          contentType,
        };
      }

      // 检查是否正在下载（并发控制）
      const existingDownload = this.downloadingFiles.get(cacheFilePath);
      if (existingDownload) {
        console.log(`文件正在下载中，等待完成: ${cacheFilePath}`);
        // 等待正在进行的下载完成
        return await existingDownload;
      }

      // 创建下载任务
      const downloadPromise = this.doDownload(url, cacheFilePath);
      
      // 将下载任务加入锁
      this.downloadingFiles.set(cacheFilePath, downloadPromise);

      try {
        const result = await downloadPromise;
        return result;
      } finally {
        // 下载完成或失败后，从锁中移除
        this.downloadingFiles.delete(cacheFilePath);
      }
    }

    /**
     * 执行实际下载操作（带重试机制）
     * @param url 文件URL
     * @param cacheFilePath 缓存文件路径
     * @returns 返回文件内容和响应头信息
     */
    private async doDownload(url: string, cacheFilePath: string): Promise<{ body: Buffer; headers: any; contentType: string }> {
      const maxRetries = 2;
      let lastError: any;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // 再次检查缓存（可能在等待期间其他请求已经下载完成）
          if (fs.existsSync(cacheFilePath)) {
            console.log(`等待期间文件已下载完成，使用缓存: ${cacheFilePath}`);
            const fileContent = fs.readFileSync(cacheFilePath);
            const contentType = this.getCachedContentType(cacheFilePath) || 'application/octet-stream';
            // console.log("")
            return {
              body: fileContent,
              headers: {
                'content-type': contentType,
                'content-length': fileContent.length.toString(),
                'content-disposition': `attachment; filename="${this.getFileNameFromUrl(url)}"`,
              },
              contentType,
            };
          }

          let request = superagent
            .get(url)
            .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
            .timeout({
              response: 30000*10, // 10分钟响应超时
              deadline: 60000*10, // 10分钟总超时
            })
            if(url.includes('weibo')){
                request = request.set('Referer', 'https://weibo.com');
            }
            if(url.includes('upos-sz-mirrorhw.bilivideo.com')){
               request =request.set('Referer', 'https://upos-sz-mirrorhw.bilivideo.com');
            }
            if(url.includes('v26-web.douyinvod.com') || url.includes('www.douyin.com') || url.includes('v3-web.douyinvod.com')){
              request = request.set('Referer', 'https://www.douyin.com');
            }
            const response = await request.ok(() => true); // 允许所有状态码;
          // 检查响应状态码
          if (response.status >= 400) {
            throw new HttpException(`下载失败，状态码: ${response.status}`, response.status);
          }

          // 获取响应头
          const contentType = response.headers['content-type'] || 'application/octet-stream';
          const contentLength = response.headers['content-length'];
          const contentDisposition = response.headers['content-disposition'];
          const fileBody = Buffer.from(response.body);

          // 保存到缓存（同时保存Content-Type信息）
          this.saveToCache(cacheFilePath, fileBody, contentType);

          return {
            body: fileBody,
            headers: {
              'content-type': contentType,
              'content-length': contentLength || fileBody.length.toString(),
              'content-disposition': contentDisposition || `attachment; filename="${this.getFileNameFromUrl(url)}"`,
            },
            contentType,
          };
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
      if (lastError instanceof HttpException) {
        throw lastError;
      }
      throw new HttpException(`下载文件失败（已重试${maxRetries}次）: ${lastError?.message || '未知错误'}`, 500);
    }

    /**
     * 获取缓存文件路径
     * @param url 文件URL
     * @returns 缓存文件完整路径
     */
    private getCacheFilePath(url: string): string {
      // 对URL进行MD5加密
      const urlHash = crypto.createHash('md5').update(url).digest('hex');
      
      // 生成文件名（仅MD5，无扩展名）
      const fileName = urlHash;
      
      // 返回完整路径
      return path.join(this.cacheDir, fileName);
    }

    /**
     * 获取缓存文件的Content-Type信息
     * @param filePath 文件路径
     * @returns Content-Type，如果不存在则返回null
     */
    private getCachedContentType(filePath: string): string | null {
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
     * 保存文件到缓存
     * @param filePath 文件路径
     * @param content 文件内容
     * @param contentType Content-Type
     */
    private saveToCache(filePath: string, content: Buffer, contentType: string) {
      try {
        // 保存文件内容
        fs.writeFileSync(filePath, content);
        console.log(`文件已保存到缓存: ${filePath}`);
        
        // 保存Content-Type信息到单独文件
        const contentTypePath = filePath + '.content-type';
        fs.writeFileSync(contentTypePath, contentType);
      } catch (error) {
        console.error(`保存缓存文件失败: ${error.message}`);
        // 不抛出错误，允许继续执行
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


}



