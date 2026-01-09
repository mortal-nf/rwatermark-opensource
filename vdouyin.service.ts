/**
 * 当前版本有个别视频无法解析，待优化
 */
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { In, IsNull, Repository } from 'typeorm';
import * as superagent from 'superagent';
import { ShortVideoEntity } from './entities/shortVideo.entity';

@Injectable()
export class VDouyinService {
    // 构造请求头
      headers = {
            // 'User-Agent': `Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0`
            'User-Agent': `"Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"`
      }
      constructor(
        @InjectRepository(ShortVideoEntity)
        private shortVideoRepository:Repository<ShortVideoEntity>,
        
    ) {}
    log(...args:any[]){
        console.log("douyin:",...args);
    }
     async parseWatermark(url:string,openid:string,originUrl:string){
        let shortVideo = new ShortVideoEntity();
        shortVideo.type="douyin";
        shortVideo.openid = openid;
        shortVideo.contentType="video";
        shortVideo.status=0;
        shortVideo.originUrl=originUrl;
        let id = await this.extractId(url);
        this.log("id:",id);
        if(!id){
            shortVideo.msg="视频ID不存在";
            shortVideo.status=2;
            await this.shortVideoRepository.save(shortVideo);
            return null;
        }
        const response = await superagent
                        .get('https://www.iesdouyin.com/share/video/' + id)
                        .set(this.headers);
        const pattern = /window\._ROUTER_DATA\s*=\s*(.*?)\<\/script>/s;
        const matches = response.text.match(pattern);

        if (!matches || !matches[1]) {
            shortVideo.msg="解析数据失败";
            shortVideo.status=2
            await this.shortVideoRepository.save(shortVideo);
            return null;
        }
         let videoInfo: any;
        try {
            videoInfo = JSON.parse(matches[1].trim());
        } catch (error) {
            console.log('JSON 解析失败: ' + (error instanceof Error ? error.message : String(error)));
            shortVideo.status=2
            shortVideo.msg="JSON 解析失败: " + (error instanceof Error ? error.message : String(error));
            await this.shortVideoRepository.save(shortVideo);
            return null;
            // return { code: 201, msg: 'JSON 解析失败: ' + (error instanceof Error ? error.message : String(error)) };
        }
        console.log(videoInfo);

        if (!videoInfo?.loaderData) {
            console.log('数据查找失败' + response );
            shortVideo.status=2
            shortVideo.msg="数据查找失败" + response;
            await this.shortVideoRepository.save(shortVideo);
            return null;
        }

        const itemList = videoInfo.loaderData['video_(id)/page']?.videoInfoRes?.item_list?.[0];
        if (!itemList) {
            console.log("视频信息不存在")
            shortVideo.status=2
            shortVideo.msg="视频信息不存在";
            await this.shortVideoRepository.save(shortVideo);
            return null;
            // return { code: 201, msg: '视频信息不存在' };
        }

        // 替换 "playwm" 为 "play" 获取无水印视频 URL
        const videoResUrl = itemList.video?.play_addr?.url_list?.[0]?.replace('playwm', 'play') || '';

        // 处理图片数组
        const imgurljson = itemList.images || [];
        const imgurl: string[] = [];
        if (Array.isArray(imgurljson) && imgurljson.length > 0) {
            imgurljson.forEach((item: any) => {
            if (item?.url_list && Array.isArray(item.url_list) && item.url_list.length > 0) {
                imgurl.push(item.url_list[0]);
            }
            });
        }

        // 处理音乐信息
        let music: {
            title: string;
            author: string;
            avatar: string;
            url: string;
        } | undefined;

        if (itemList.music) {
            music = {
            title: itemList.music.title || '',
            author: itemList.music.author || '',
            avatar: itemList.music.cover_large?.url_list?.[0] || '',
            url: itemList.video?.play_addr?.uri || '',
            };
        }

        // 检查是否有视频或图片
        if (!videoResUrl && imgurl.length === 0) {
            console.log('当前分享链接已失效！');
            shortVideo.status=2
            shortVideo.msg="当前分享链接已失效！";
            await this.shortVideoRepository.save(shortVideo);
            return null;
        }

        // 构造返回数据
        shortVideo.content={
            author: itemList.author?.nickname || '',
            uid: itemList.author?.unique_id || '',
            avatar: itemList.author?.avatar_medium?.url_list?.[0] || '',
            like: itemList.statistics?.digg_count || 0,
            time: itemList.create_time || 0,
            title: itemList.desc || '',
            cover: itemList.video?.cover?.url_list?.[0] || '',
            images: imgurl.length > 0 ? imgurl : '', //当前为短视频解析模式
            url: imgurl.length > 0 
                ? ''//`当前为图文解析，图文数量为:${imgurl.length}张图片` 
                : videoResUrl,
            music: music || '音乐为视频原声',
        };
        if(imgurl.length > 0){
            shortVideo.contentType='image';
        }
        shortVideo.status=1;
        shortVideo = await this.shortVideoRepository.save(shortVideo);
        return {
            id:shortVideo.id,
        };


     }
     /**
     * 从 URL 中提取视频 ID
     * @param url 抖音分享链接
     * @returns 视频 ID 或 null
     */
    async extractId(url: string): Promise<string | null> {
        try {
            // 使用 superagent 获取重定向后的 URL
            const response = await superagent
            .get(url)
            .redirects(3)
            .ok(() => true); // 允许所有状态码
            // this.log("response:",response.text);
            // 获取最终的重定向 URL
            const finalUrl = response.redirects.length > 0 
            ? response.redirects[response.redirects.length - 1]
            : url;

            // 使用正则表达式提取视频 ID
            const match = finalUrl.match(/[0-9]+|(?<=video\/)[0-9]+/);
            return match ? match[0] : null;
        } catch (error) {
            console.error("extractId error:",error);
            // 如果请求失败，尝试直接从 URL 中提取
            const match = url.match(/[0-9]+|(?<=video\/)[0-9]+/);
            return match ? match[0] : null;
        }
    }

}



interface DouyinDataResponse {
//   code: number;
//   msg: string;
//   data?: {
    author: string;
    uid: string;
    avatar: string;
    like: number;
    time: number;
    title: string;
    cover: string;
    images: string[] | string;
    url: string;
    music?: {
      title: string;
      author: string;
      avatar: string;
      url: string;
    } | string;
//   };
}

