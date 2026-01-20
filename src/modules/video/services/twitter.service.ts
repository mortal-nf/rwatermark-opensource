/**
 * Twitter视频解析服务
 */
import { Injectable, HttpException } from '@nestjs/common';
import * as superagent from 'superagent';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

@Injectable()
export class TwitterService {
  // 构造请求头
  private headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0',
    'Referer': 'https://twitsave.com/'
  };

  constructor() {}

  private log(...args: any[]) {
    console.log('twitter:', ...args);
  }

  /**
   * 解析Twitter视频
   * @param url Twitter视频链接
   * @param openid 用户标识
   * @param originUrl 原始URL
   */
  async parseWatermark(url: string, openid: string, originUrl: string) {
    try {
      this.log('解析URL:', url);

      // 使用twitsave.com的API解析Twitter视频
      const apiUrl = `https://twitsave.com/info?url=${encodeURIComponent(url)}`;
      const response = await superagent.get(apiUrl).set(this.headers);
      
      // 使用cheerio解析HTML
      const $ = cheerio.load(response.text);
      
      // 检查是否有视频
      const errorMsg = $('.text-red-500').text().trim();
      if (errorMsg) {
        throw new HttpException(`无法找到视频: ${errorMsg}`, 404);
      }

      // 提取视频信息
      const titleElement = $('.leading-tight .m-2').first();
      let title = titleElement.text().trim() || 'Twitter Video';
      
      // 提取所有视频质量选项
      const qualityButtons = $('.origin-top-right a');
      if (qualityButtons.length === 0) {
        throw new HttpException('无法获取视频下载链接', 404);
      }

      // 获取最高质量的视频URL
      const highestQualityUrl = qualityButtons.first().attr('href');
      if (!highestQualityUrl) {
        throw new HttpException('无法获取视频下载链接', 404);
      }

      // 清理标题作为文件名
      const fileName = this.cleanFileName(title) + '.mp4';

      // 构建返回结果
      const content = {
        title,
        url: highestQualityUrl,
        fileName,
        user: {
          name: '', // Twitter API需要认证才能获取用户信息
          avatar: ''
        }
      };

      return {
        type: 'twitter',
        openid,
        contentType: 'video',
        status: 1,
        originUrl,
        content
      };

    } catch (error) {
      this.log('解析失败:', error.message);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(`解析失败: ${error.message}`, 500);
    }
  }

  /**
   * 清理文件名，移除特殊字符
   * @param fileName 原始文件名
   */
  private cleanFileName(fileName: string): string {
    // 移除特殊字符，只保留字母、数字、空格
    return fileName.replace(/[^a-zA-Z0-9\s]+/g, ' ').trim();
  }

  /**
   * 获取缓存文件路径
   * @param url 文件URL
   */
  private getCacheFilePath(url: string): string {
    // 对URL进行MD5加密
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    // 返回完整路径
    return path.join(__dirname, 'shortVideos', urlHash);
  }
}