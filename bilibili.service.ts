/**
 * bilibili视频解析服务
 */
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { In, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as superagent from 'superagent';
import { ShortVideoEntity } from './entities/shortVideo.entity';

interface BilibiliApiResponse {
  code: number | string;
  data?: {
    title?: string;
    pic?: string;
    desc?: string;
    owner?: {
      name?: string;
      face?: string;
    };
    pages?: Array<{
      cid: number;
      part: string;
      duration: number;
    }>;
  };
}

interface PlayUrlResponse {
  code: number;
  data?: {
    durl?: Array<{
      url: string;
    }>;
  };
}
interface VideoInfo {
  title: string;
  duration?: number;
  durationFormat?: string;
  url?: string;
  error?: string;
  index: number;
}

@Injectable()
export class BilibiliService {
    // 构造请求头
      headers = {
            'User-Agent': `Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0`
      }
      constructor(
        @InjectRepository(ShortVideoEntity)
        private shortVideoRepository:Repository<ShortVideoEntity>,
        
    ) {}
    log(...args:any[]){
        console.log("bilibili:",...args);
    }
    async parseWatermark(url:string,openid:string,originUrl:string){
        console.log("url",url);
        let shortVideo = new ShortVideoEntity();
        shortVideo.type="bilibili";
        shortVideo.openid = openid;
        shortVideo.contentType="video";
        shortVideo.status=0;
        shortVideo.originUrl=originUrl;
        let cleanedUrl = this.cleanUrlParameters(url);
        console.log("url",url);
        let parsedUrl: URL;
         try {
            parsedUrl = new URL(cleanedUrl);
        } catch (error) {
            this.log("error",error);
            shortVideo.status=2;
            shortVideo.msg="视频链接不正确";
            await this.shortVideoRepository.save(shortVideo);
            throw new BadRequestException('视频链接不正确');
        }
        let bvid = '';
        // 处理不同的域名
        if (parsedUrl.hostname === 'b23.tv') {
            try {
            const response = await superagent
                .get(cleanedUrl)
                .redirects(1000)
                .ok(() => true);

            const redirectUrl = response.redirects && response.redirects.length > 0
                ? response.redirects[response.redirects.length - 1]
                : cleanedUrl;

            parsedUrl = new URL(redirectUrl);
            bvid = parsedUrl.pathname.replace(/\/$/, '');
            } catch (error) {
                this.log("error",error);
                shortVideo.status=2;
                shortVideo.msg="无法获取重定向 URL";
                await this.shortVideoRepository.save(shortVideo);
                throw new BadRequestException('无法获取重定向 URL');
            }
        } else if (parsedUrl.hostname === 'www.bilibili.com' || parsedUrl.hostname === 'm.bilibili.com') {
            bvid = parsedUrl.pathname;
        } else {
            this.log("视频链接好像不太对！");
            shortVideo.status=2;
            shortVideo.msg="视频链接好像不太对！";
            await this.shortVideoRepository.save(shortVideo);
            throw new BadRequestException('视频链接好像不太对！');
        }
        // 检查是否是视频链接
  if (!bvid.includes('/video/')) {
    this.log("好像不是视频链接");
    shortVideo.status=2;
    shortVideo.msg="好像不是视频链接";
    await this.shortVideoRepository.save(shortVideo);
    throw new BadRequestException('好像不是视频链接');
  }

  // 提取 bvid
  bvid = bvid.replace('/video/', '');

  // 这里填写你的B站cookie(不填解析不到1080P以上) 格式为_uuid=XXXXX
  // 建议从环境变量读取: const cookie = process.env.BILIBILI_COOKIE || '';
  const cookie = '';
  const header = ['Content-type: application/json;charset=UTF-8'];
  const useragent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36';

  // 获取解析需要的cid值和图片以及标题
  const json1 = await this.bilibili(
            `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
            header,
            useragent,
            cookie
        );

        let array: BilibiliApiResponse;
        try {
            array = JSON.parse(json1);
        } catch (error) {
            this.log("error",error);
            shortVideo.status=2;
            shortVideo.msg="解析失败！JSON 解析错误";
            await this.shortVideoRepository.save(shortVideo);
            throw new BadRequestException('解析失败！JSON 解析错误');
        }
        console.log("array",array);
        if (array.code === '0' || array.code === 0) {
            const title = array.data?.title || '';
            const cover = array.data?.pic || '';
            const desc = array.data?.desc || '';
            const owner = array.data?.owner || { name: '', face: '' };

            const videos: VideoInfo[] = [];
            let lastVideoUrl: string | null = null;
            // console.log("array.data.pages",array.data?.pages && Array.isArray(array.data.pages));
            // 循环获取所有分P的视频信息
            if (array.data?.pages && Array.isArray(array.data.pages)) {
            for (let index = 0; index < array.data.pages.length; index++) {
                const page = array.data.pages[index];
                
                // 请求视频直链API
                const apiUrl = `https://api.bilibili.com/x/player/playurl?otype=json&fnver=0&fnval=3&player=3&qn=112&bvid=${bvid}&cid=${page.cid}&platform=html5&high_quality=1`;
                const jsonResponse = await this.bilibili(apiUrl, header, useragent, cookie);
                console.log("jsonResponse",jsonResponse);
                // 解析API返回的JSON数据
                let videoInfo: PlayUrlResponse;
                try {
                videoInfo = JSON.parse(jsonResponse);
                } catch (error) {
                    videos.push({
                        title: page.part,
                        error: 'JSON 解析失败',
                        index: index + 1
                    });
                continue;
                }
                console.log("videoInfo",videoInfo);
                // 检查API响应是否正常 dash
                if (videoInfo.data?.durl && videoInfo.data.durl.length > 0 && videoInfo.data.durl[0].url) {
                const videoUrl = videoInfo.data.durl[0].url;

                // 提取真实视频地址（去除镜像前缀）
                const realVideoUrl = videoUrl.replace(/.*\.bilivideo\.com\//, 'https://upos-sz-mirrorhw.bilivideo.com/');

                lastVideoUrl = realVideoUrl;

                videos.push({
                    title: page.part,
                    duration: page.duration,
                    durationFormat: this.formatDuration(page.duration - 1),
                    url: realVideoUrl,
                    index: index + 1
                });
                } else {
                // 记录获取失败的分P
                videos.push({
                    title: page.part,
                    error: '无法获取视频链接',
                    index: index + 1
                });
                }
            }
            }

            // 根据是否有多个分P构建不同的返回结构
            if (videos.length > 1) {
                shortVideo.status=1;
                shortVideo.msg="解析成功！";
                shortVideo.content={
                    title,
                    cover,
                    description: desc,
                    url: lastVideoUrl,
                    user: {
                        name: owner.name || '',
                        avatar: owner.face || ''
                    },
                    videos,
                    totalVideos: videos.length
                }
                await this.shortVideoRepository.save(shortVideo);
                
            } else {
                shortVideo.status=1;
                shortVideo.msg="解析成功！";
                shortVideo.content={
                    title,
                    cover,
                    description: desc,
                    url: lastVideoUrl,
                    user: {
                        name: owner.name || '',
                        avatar: owner.face || ''
                    },
                    videos,
                    totalVideos: videos.length
                }
                await this.shortVideoRepository.save(shortVideo);
            }
            return {id:shortVideo.id};
        } else {
            this.log("解析失败！");
            shortVideo.status=2;
            shortVideo.msg="解析失败！";
            await this.shortVideoRepository.save(shortVideo);
            throw new BadRequestException('解析失败！');
        }
    }
    async bilibili(
        url: string,
        headers: string[],
        userAgent: string,
        cookie: string
        ): Promise<string> {
        try {
            let request = superagent.get(url).set('Referer', 'https://www.bilibili.com/')

            // 设置请求头
            headers.forEach(header => {
            const [key, ...valueParts] = header.split(': ');
            const value = valueParts.join(': ');
            if (key && value) {
                request = request.set(key.trim(), value.trim());
            }
            });

            // 设置 User-Agent
            request = request.set('User-Agent', userAgent);

            // 设置 Cookie
            if (cookie) {
            request = request.set('Cookie', cookie);
            }

            const response = await request
            .timeout(10000)
            .redirects(3)
            .ok(() => true);

            return response.text || '';
        } catch (error) {
            throw new Error(`Bilibili API 请求失败: ${error instanceof Error ? error.message : String(error)}`);
        }
        }

        /**
         * 格式化时长（秒转 H:i:s）
         * @param seconds 秒数
         * @returns 格式化后的时长字符串
         */
            formatDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

    /**
 * 清理 URL 参数
 * @param url 原始 URL
 * @returns 清理后的 URL
 */
    cleanUrlParameters(url: string): string {
    try {
        const parsed = new URL(url);

        // 处理国际化域名（Punycode转中文）
        let host = parsed.hostname;
        // Node.js 的 URL 类已经处理了 Punycode，但我们可以保留这个逻辑以防万一

        // 移除认证信息（如 user:pass@）
        host = host.replace(/^.*@/, '');

        // 构建路径（自动解码）
        let path = decodeURIComponent(parsed.pathname);
        // 去掉路径末尾的斜杠
        path = path.replace(/\/$/, '');

        // 构建 fragment
        const fragment = parsed.hash ? decodeURIComponent(parsed.hash) : '';

        // 拼接最终 URL
        return `${parsed.protocol}//${host}${parsed.port ? ':' + parsed.port : ''}${path}${fragment}`;
    } catch (error) {
        // 如果 URL 解析失败，返回原 URL
        return url;
    }
    }

}
