/**
 * 微博视频解析服务
 */
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import * as superagent from 'superagent';

@Injectable()
export class WeiboService {
    
      constructor() {}
    log(...args:any[]){
        console.log("weibo:",...args);
    }
    async parseWatermark(url:string,openid:string,originUrl:string){
        console.log("url",url);
        let id = '';
        // 模式1: show?fid=
        if (url.includes('show?fid=')) {
            const match = url.match(/fid=(.*)/);
            if (match && match[1]) {
                id = match[1];
            }
        }else {
            const match = url.match(/\d+:\d+/);
            if (match && match[0]) {
                id = match[0];
            }
        }

        if (!id) {
            throw new BadRequestException('解析失败！');
        }
        console.log("id",id);
        try {
            const responseText = await this.weibo_curl(id);
            const arr: WeiboApiResponse = JSON.parse(responseText);
            console.log("arr",arr);
            if (arr && arr.data?.Component_Play_Playinfo) {
            const playInfo = arr.data.Component_Play_Playinfo;
            
            // 获取第一个可用的视频 URL
            const urls = playInfo.urls || {};
            const qualityKeys = Object.keys(urls);
            if (qualityKeys.length === 0) {
                throw new BadRequestException('解析失败！');
            }
            
                const one = qualityKeys[0];
                const video_url = urls[one];
                const content = {
                        author: playInfo.author || '',
                        avatar: ('https:'+(playInfo.avatar || '')),
                        time: playInfo.real_date || '',
                        title: playInfo.text || playInfo.title || '',
                        cover: ('https:' + (playInfo.cover_image || '')),
                        url: ('https:' + video_url)
                };
                
                return {
                    type: "weibo",
                    openid,
                    contentType: "video",
                    status: 1,
                    originUrl,
                    content
                };
            }

            throw new BadRequestException('解析失败！');
        } catch (error) {
            console.error('解析失败:', error instanceof Error ? error.message : String(error));
            throw new BadRequestException('解析失败！');
        }
    }
    /**
         * 发送 HTTP 请求到微博 API
         * @param id 视频 ID
         * @returns API 响应文本
         */
        async weibo_curl(id: string): Promise<string> {
        const postData = `data={"Component_Play_Playinfo":{"oid":"${id}"}}`;
        const url = `https://weibo.com/tv/api/component?page=/tv/show/${id}`;

        try {
            const response = await superagent
            .post(url)
            .set('Referer', `https://weibo.com/tv/show/${id}`)
            .set('Accept-Encoding', 'gzip,deflate')
            .send(postData)
            .timeout(5000)
            .ok(() => true);

            return response.text || '';
        } catch (error) {
            throw new Error(`微博 API 请求失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
   
}

interface WeiboApiResponse {
  code?: number | string;
  data?: {
    Component_Play_Playinfo?: {
      author: string;
      avatar: string;
      real_date: string;
      title: string;
      text: string;
      cover_image: string;
      urls: Record<string, string>;
    };
  };
}