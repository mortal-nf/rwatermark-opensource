/**
 * 今日头条视频解析服务
 */
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import * as superagent from 'superagent';

@Injectable()
export class ToutiaoService {

      constructor() {}
    log(...args:any[]){
        console.log("toutiao:",...args);
    }
    async parseWatermark(url:string,openid:string,originUrl:string){
        console.log("url",url);
        let contentType = "video";
        
        try {
            let renderData = await this.getRenderData(url);
            console.log("renderData",renderData);
            const content = {
                 author: renderData.articleInfo?.mediaUser?.screenName || '',
                uid: renderData.articleInfo?.creatorUid,
                avatar: renderData.articleInfo?.mediaUser?.avatarUrl || '',
                like: 0,
                time: 0,
                title: renderData.articleInfo?.title || '',
                description:renderData.articleInfo?.content || '',
                cover: renderData.articleInfo?.posterUrl || '',
                url: '',
                images: []
            };
            // = playInfo.MainPlayUrl;
            let playInfo = null;
            if(renderData.GetPlayInfoToken){
                let res = await this.getGetPlayInfo(renderData.GetPlayInfoToken);
                console.log("res",res);
                let PlayInfoList = res.Result.Data.PlayInfoList;
                playInfo = PlayInfoList[PlayInfoList.length - 1];
                // playInfo.url = playInfo.MainPlayUrl;
                content.url = playInfo.MainPlayUrl;
            }
            if(renderData.redirectUrl.startsWith("https://m.toutiao.com/article")){
            }
            if(renderData.redirectUrl.startsWith("https://m.toutiao.com/w")){
                // 微头条
                renderData.$(".weitoutiao-html").html();
                content.description = renderData.$(".weitoutiao-content").html();
                content.images = [];
                contentType = "image";
                let bodyHtml = renderData.$("body").html();
                console.log("bodyHtml",bodyHtml);
                let images = renderData.$(".image-list-src")
                // console.log("images",images);
                for(let i = 0; i < images.length; i++){
                    let image = images.eq(i).css("background-image").match(/url\((.*?)\)/)[1];
                    if(image){
                        content.images.push(image);
                    }
                }
            }
            if(renderData.redirectUrl.startsWith("https://m.toutiao.com/video")){

            }
            
            return {
                type: "toutiao",
                openid,
                contentType,
                status: 1,
                originUrl,
                content
            };
            
        } catch (error) {
            console.error('解析失败:', error instanceof Error ? error.message : String(error));
            throw new BadRequestException('解析失败！');
        }
    }
    async getGetPlayInfo(GetPlayInfoToken:string){
        let res = await superagent.get("https://vod.bytedanceapi.com/?"+GetPlayInfoToken)
        return res.body;
    }
    async getRenderData(url: string): Promise<any> {
        try {
            const response = await superagent
            .get(url)
            .redirects(4) // 不自动跟随重定向
            .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1')
            .set('Referer', 'https://www.toutiao.com/')
            .set("accept","text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7")
            .set("accept-language","zh-CN,zh;q=0.9")
            .set("cache-control","max-age=0")
            .set("sec-ch-ua","\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not=A?Brand\";v=\"24\"")
            .set("sec-ch-ua-mobile","?0")
            .set("sec-ch-ua-platform","\"macOS\"")
            .set("sec-fetch-dest","empty")
            .set("sec-fetch-mode","cors")
            .timeout(10*1000)
            .ok(() => true);
            //   console.log("response",response.redirects);
            //   console.log("response.text",response.text);
            const $ = cheerio.load(response.text);
            let  videoToken = $('#RENDER_DATA').text();
            let renderData = JSON.parse(decodeURIComponent(videoToken));
            let playAuthTokenV2 = renderData.articleInfo.playAuthTokenV2
            if(playAuthTokenV2){
                playAuthTokenV2 = Buffer.from(playAuthTokenV2,'base64').toString()
                // console.log("playAuthTokenV2",JSON.parse(playAuthTokenV2));
                renderData.GetPlayInfoToken = JSON.parse(playAuthTokenV2).GetPlayInfoToken;
            }
            // console.log("videoToken",videoToken);
            renderData.redirectUrl = response.redirects[response.redirects.length - 1];
            renderData.$ =$;
            return renderData
        } catch (error) {
            console.log("error",error);
            // 如果请求失败，返回空字符串
            return error;
        }
        }

}
