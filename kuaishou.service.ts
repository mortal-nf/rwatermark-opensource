/**
 * 快手视频解析服务
 */
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import * as superagent from 'superagent';

interface KuaishouData {
  author?: string;
  authorID?: string;
  title?: string;
  avatar?: string;
  cover?: string;
  url?: string;
  images?: string[];
like?: number;
time?: number;
  music?: {
    title?: string;
    author?: string;
    avatar?: string;
    url: string;
  };
}
@Injectable()
export class KuaishouService {
    // 构造请求头
      headers = {
            'User-Agent': `Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0`
      }
      constructor() {}
    log(...args:any[]){
        console.log("kuaishou:",...args);
    }
    async parseWatermark(url:string,openid:string,originUrl:string){
        console.log("url",url);
        let response = await superagent
        .get(url)
        .redirects(1000)
        .ok(() => true);
        let matches = response.text.match(/<script>\s*window\.INIT_STATE\s*=\s*({[\s\S]*?})<\/script>/i);
        let decoded: any;
        try {
            decoded = JSON.parse(matches[1]);
            } catch (error) {
            console.error('JSON 解析失败:', error instanceof Error ? error.message : String(error));
            throw new BadRequestException('JSON 解析失败');
            }
        // console.log("text",text);
        let data = null;
        for(let key in decoded){
            if(decoded[key].photo){
              data = decoded[key].photo;
            }
        }
        if(!data){
            throw new BadRequestException('解析失败');
        }
        let content:KuaishouData={
            // author: data.userName,
            // authorID: data.userId,
            // title: data.caption,
            // desc: data.caption,
            // avatar: data.headUrl,
            // cover: data.coverUrl,
            // url: data.photoUrl,
            // images: data.imageUrls,
        }
        if(data.ext_params?.atlas){
            content.images=data.ext_params.atlas.list.map((item)=>{
                return `https://${data.ext_params.atlas.cdnList[0].cdn}${item}`;
            })
            content.music={
                // title: data.ext_params.atlas.music.name,
                // author: data.ext_params.atlas.music.author,
                // avatar: data.ext_params.atlas.music.avatar,
                url: `https://${data.ext_params.atlas.musicCdnList[0].cdn}${data.ext_params.atlas.music}`,
            }
        }
        content.like=data.likeCount;
        content.author=data.userName;
        content.authorID = data.userId;
        content.title = data.caption;
        content.cover = data.coverUrls?.[0]?.url;
        content.url = data.mainMvUrls?.[0]?.url;
        content.avatar = data.headUrl;
        
        const contentType = data.photoType !== "VIDEO" ? "image" : "video";
        
        return {
            type: "kuaishou",
            openid,
            contentType,
            status: 1,
            originUrl,
            content
        };
    }

}
