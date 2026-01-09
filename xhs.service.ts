/*
    小红书笔记解析服务
 */
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { In, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as superagent from 'superagent';
import { ShortVideoEntity } from './entities/shortVideo.entity';

@Injectable()
export class XhsService {
    // 构造请求头
     proxyurl:string = ''; // 如果是香港服务器，需要设置 代理URL，否则无法解析
     userAgent:string = ` 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.128 Safari/537.36'`;
      constructor(
        @InjectRepository(ShortVideoEntity)
        private shortVideoRepository:Repository<ShortVideoEntity>,
        
    ) {}
    log(...args:any[]){
        console.log("xhs:",...args);
    }
    async parseWatermark(url:string,openid:string,originUrl:string){
        console.log("url",url);
        let shortVideo = new ShortVideoEntity();
        shortVideo.type="xhs";
        shortVideo.openid = openid;
        shortVideo.contentType="video";
        shortVideo.status=0;
        shortVideo.originUrl=originUrl;
        let finalUrl = url;
        let id: string | null = null;
        try {
            // 解析 URL 获取域名
            const urlObj = new URL(url);
            const host = urlObj.hostname;
            // www.xiaohongshu.com
            if (host === 'www.xiaohongshu.com') {
                id = this.extractId(url);
            } else {
            // 获取重定向后的 URL
                finalUrl = await this.getRedirectedUrl(url);
                console.log("finalUrl",finalUrl);
                id = this.extractId(finalUrl);
            }

            if (!id) {
            //    return output(400, '无法提取笔记 ID');
              shortVideo.status=2;
              shortVideo.msg="无法提取笔记 ID";
              await this.shortVideoRepository.save(shortVideo);
              return null;
            }

            // 发送请求获取视频信息
            const response = await this.get_curl(finalUrl, '');
            if (!response) {
                shortVideo.status=2;
                shortVideo.msg="请求失败";
                await this.shortVideoRepository.save(shortVideo);
                return null;
            //    return output(400, '请求失败');
            }

            // 匹配 window.__INITIAL_STATE__ 的内容
            const pattern = /<script>\s*window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/i;
            const matches = response.match(pattern);

            if (!matches || !matches[1]) {
            //    return output(400, '匹配json数据失败');
                shortVideo.status=2;
                shortVideo.msg="匹配json数据失败";
                await this.shortVideoRepository.save(shortVideo);
               return null;
            }

            // 将 undefined 替换为 null
            let jsonData = matches[1].replace(/undefined/g, 'null');

            let decoded: any;
            try {
            decoded = JSON.parse(jsonData);
            } catch (error) {
            //    return output(400, '匹配到的内容不是有效的 JSON 数据');
                shortVideo.status=2;
                shortVideo.msg="匹配到的内容不是有效的 JSON 数据";
                await this.shortVideoRepository.save(shortVideo);
                return null;
            }

            if (!decoded) {
            //    return output(400, '匹配到的内容不是有效的 JSON 数据');
                shortVideo.status=2;
                shortVideo.msg="匹配到的内容不是有效的 JSON 数据";
                await this.shortVideoRepository.save(shortVideo);
                return null;
            }
            console.log("decoded",decoded.note);
            // 安全获取视频URL
            const videoH264Url = this.safeGet(decoded, ['note', 'noteDetailMap', id, 'note', 'video', 'media', 'stream', 'h264', 0, 'backupUrls', 0]);
            const videoH265Url = this.safeGet(decoded, ['noteData', 'data', 'noteData', 'video', 'media', 'stream', 'h265', 0, 'masterUrl']);
            const videourl = videoH265Url || videoH264Url;

            // 获取图片数据（作为备用数据源）
            const imageData = this.safeGet(decoded, ['note', 'noteDetailMap', id, 'note']);

            // 获取作者信息
            let author = this.safeGet(decoded, ['noteData', 'data', 'noteData', 'user', 'nickName']);
            author = author || this.safeGet(imageData, ['user', 'nickname'], '');

            let authorID = this.safeGet(decoded, ['noteData', 'data', 'noteData', 'user', 'userId']);
            authorID = authorID || this.safeGet(imageData, ['user', 'userId'], '');

            // 获取标题和描述
            let title = this.safeGet(decoded, ['noteData', 'data', 'noteData', 'title']);
            title = title || this.safeGet(imageData, ['title'], '');

            let desc = this.safeGet(decoded, ['noteData', 'data', 'noteData', 'desc']);
            desc = desc || this.safeGet(imageData, ['desc'], '');
            desc = desc || this.safeGet(decoded, ['note', 'noteDetailMap', id, 'note', 'desc'], '');

            // 获取头像和封面
            let avatar = this.safeGet(decoded, ['noteData', 'data', 'noteData', 'user', 'avatar']);
            avatar = avatar || this.safeGet(imageData, ['user', 'avatar'], '');

            let cover = this.safeGet(decoded, ['noteData', 'data', 'noteData', 'imageList', 0, 'url']);
            cover = cover || this.safeGet(decoded, ['note', 'noteDetailMap', id, 'note', 'imageList', 0, 'urlDefault'], '');

            // 如果有视频 URL
            if (videourl) {
                const data: XhsData = {
                    author: author || '',
                    authorID: authorID || '',
                    title: title || '',
                    description: desc || '',
                    avatar: avatar || '',
                    cover: cover || '',
                    url: videourl,
                };
                shortVideo.content=data;
                shortVideo.status=1;
                shortVideo.msg="解析成功";
                shortVideo =await this.shortVideoRepository.save(shortVideo);
                return {id:shortVideo.id};
            } 
            // 如果有图片数据
            else if (imageData && imageData.imageList) {
                  const images: string[] = [];
               if (Array.isArray(imageData.imageList)) {
                imageData.imageList.forEach((item: any) => {
                    if (item && item.urlDefault) {
                        images.push(item.urlDefault);
                    }
                });
            }

                const data: XhsData = {
                    author: author || '',
                    authorID: authorID || '',
                    title: title || '',
                    description: desc || '',
                    avatar: avatar || '',
                    cover: cover || '',
                    images: images,
                };
                shortVideo.status=1;
                shortVideo.msg="解析成功";
                shortVideo.contentType="image";
                shortVideo.content=data;
                shortVideo = await this.shortVideoRepository.save(shortVideo);
                return {id:shortVideo.id};
            } 
            // 都没有
            else {
                shortVideo.status=2;
                shortVideo.msg="解析失败，未获取到视频链接";
                await this.shortVideoRepository.save(shortVideo);
                return null;
                // return output(404, '解析失败，未获取到视频链接');
            }
        } catch (error) {
            this.log(error)
            shortVideo.status=2;
            shortVideo.msg="解析过程出错: " + (error instanceof Error ? error.message : String(error));
            await this.shortVideoRepository.save(shortVideo);
            return null;
            // return output(400, '解析过程出错: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

/**
 * 从 URL 中提取笔记 ID
 * @param url 小红书链接
 * @returns 笔记 ID 或 null
 */
   extractId(url: string): string | null {
            // 定义多个正则表达式模式以匹配不同格式的URL
            const patterns = [
                /discovery\/item\/([a-zA-Z0-9]+)/,     // 原始模式
                /explore\/([a-zA-Z0-9]+)/,             // 匹配探索页面链接
                /item\/([a-zA-Z0-9]+)/,                // 匹配项目详情链接
                /note\/([a-zA-Z0-9]+)/,                // 匹配笔记链接
            ];

            // 依次尝试每个模式
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match && match[1]) {
                return match[1];
                }
            }

            return null;
    }
        /**
         * 获取重定向后的 URL
         * @param url 原始 URL
         * @returns 重定向后的 URL
         */
        async getRedirectedUrl(url: string): Promise<string> {
            // let {url,proxyHost} = this.getProxyUrl(url2);
            // console.log("getProxyUrl",url,proxyHost);
            try {
                        const response = await superagent
                        .get(url)
                        .redirects(1000)
                        .ok(() => true);
                        console.log("response.redirects",response.redirects);
                        // 获取最终的重定向 URL
                        if (response.redirects && response.redirects.length > 0) {
                        return response.redirects[response.redirects.length - 1];
                        }
                        return url;
                    } catch (error) {
                        // 如果 HEAD 请求失败，尝试 GET 请求
                        try {
                        const response = await superagent
                            .get(url)
                            .redirects(10)
                            .ok(() => true);
                        
                        if (response.redirects && response.redirects.length > 0) {
                            return response.redirects[response.redirects.length - 1];
                        }
                        return url;
                        } catch (err) {
                        return url;
                        }
                    }
        }
    
        /**
         * 发送 HTTP 请求
         * @param url 请求 URL
         * @param cookie Cookie 字符串
         * @returns 响应文本或 null
         */
        async get_curl(url: string, cookie: string = ''): Promise<string | null> {
                try {
                    if(url.includes("http://xhslink.com")){
                    url = url.replace("http://xhslink.com",this.proxyurl);
                    }
                    if(url.includes("https://www.xiaohongshu.com")){
                    url = url.replace("https://www.xiaohongshu.com",this.proxyurl);
                    }
                    let request = superagent
                    .get(url)
                    .set({
                        "x-api-proxy-host":url.includes("http://xhslink.com") ? "http://xhslink.com" : "https://www.xiaohongshu.com"
                    })
                    .set('User-Agent',this.userAgent)
                    .set('Accept-Encoding', 'gzip,deflate')
                    .timeout(5000)
                    .redirects(3)
                    .ok(() => true);

                    if (cookie) {
                    request = request.set('Cookie', cookie);
                    }

                    const response = await request;
                    return response.text || null;
                } catch (error) {
                    console.error('请求失败:', error instanceof Error ? error.message : String(error));
                    return null;
                }
        }

    /**
     * 安全获取嵌套对象的值
     * @param obj 对象
     * @param keys 键数组
     * @param defaultValue 默认值
     * @returns 获取到的值或默认值
     */
    safeGet(obj: any, keys: (string | number)[], defaultValue: any = null): any {
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined || !(key in current)) {
        return defaultValue;
        }
        current = current[key];
    }
    return current;
    }

}


interface XhsData {
  author: string;
  authorID: string;
  title: string;
  description: string;
  avatar: string;
  cover: string;
  url?: string;
  images?: string[];
}