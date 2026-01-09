/**
 * 抖音视频解析服务
 */
import { HttpException, Injectable, OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as superagent from 'superagent';
import { ShortVideoEntity } from './entities/shortVideo.entity';
import { Browser, Page } from 'puppeteer-core';
import { getBrowser } from './puppeteer/puppeteer';

@Injectable()
export class DouyinV2Service implements OnModuleInit {
     private browser:Browser;
    private pagePool: Page[] = []; // 页面池
     private pagePoolSize = 5; // 页面池大小，可根据实际情况调整
    // 构造请求头
      headers = {
            'User-Agent': `Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/122.0.0.0`
      }
      constructor(
        @InjectRepository(ShortVideoEntity)
        private shortVideoRepository:Repository<ShortVideoEntity>,
        
    ) {}
    async onModuleInit(){
        console.log("DouyinV2Service onModuleInit");
        if(process.env.NODE_ENV=='local'){
            return null;
        }
        // this.initBrowser();
        
    }
    async initBrowser(){
       this.browser = await getBrowser(true);
       this.browser.on("disconnected",() => {
            this.log('浏览器连接断开，尝试重新连接...');
            this.browser = null;
            this.initBrowser();
        });
        this.log("get browser success");
        await this.initPagePool();
        console.log("DouyinV2Service onModuleInit success");
    }
    /**
     * 初始化页面池
     */
    private async initPagePool() {
        this.pagePool=[];
        if (!this.browser) return;
        
        try {
            // 预创建几个页面
            let pages = await this.browser.pages();
            for(let i=0;i<pages.length;i++){
                let page = pages[i];
                await page.setViewport({ width: 1920, height: 1080 });
                await this.enableCache(page);
                page.goto("https://www.douyin.com").catch(() => {});
                // await page.setUserAgent(this.userAgent);
                this.pagePool.push(page);
            }
            for (let i = 0; i < Math.min(this.pagePoolSize, 2); i++) {
                const page = await this.browser.newPage();
                // 设置一些默认配置
                await page.setViewport({ width: 1920, height: 1080 });
                await this.enableCache(page);
                page.goto("https://www.douyin.com").catch(() => {});
                // await page.setUserAgent(this.userAgent);
                this.pagePool.push(page);
            }
            this.log(`页面池初始化完成，当前页面数: ${this.pagePool.length}`);
        } catch (error) {
            this.log('页面池初始化失败:', error);
        }
    }
    // 新增方法：启用页面缓存
    private async enableCache(page: Page) {
        try {
            const client = await page.target().createCDPSession();
            // 启用网络域和缓存
            await client.send('Network.enable');
            await client.send('Network.setCacheDisabled', { cacheDisabled: false });
            // 设置缓存大小（可选）
            await client.send('Network.setBypassServiceWorker', { bypass: false });
        } catch (error) {
            this.log('启用缓存失败:', error);
        }
    }

    
    /**
     * 从页面池获取页面
     */
    private async getPageFromPool(): Promise<Page> {
        // 如果池中有可用页面，直接返回
        if (this.pagePool.length > 0) {
            console.log("getPageFromPool pagePool:",this.pagePool.length);
            const page = this.pagePool.pop()!;
            // 检查页面是否已关闭
            if (page.isClosed()) {
                // 如果页面已关闭，创建新页面
                return await this.createNewPage();
            }
            
            return page;
        }
        
        // 如果池中没有页面，创建新页面
        return await this.createNewPage();
    }
    
    /**
     * 创建新页面
     */
    private async createNewPage(): Promise<Page> {
        if (!this.browser) {
            throw new Error("browser not found");
        }
        
        const page = await this.browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await this.enableCache(page);
        page.goto("https://www.douyin.com").catch(() => {});
        // await page.setUserAgent(this.userAgent);
        return page;
    }
    
    /**
     * 将页面归还到页面池
     */
    private async returnPageToPool(page: Page) {
        try {
            // 清理页面状态
            if (!page.isClosed()) {
                // 清除所有cookies和缓存
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCache');
                await client.send('Network.clearBrowserCookies');
                
                // 导航到空白页，清理页面状态
                await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
            }
            
            // 如果页面池未满，且页面未关闭，则归还
            if (this.pagePool.length < this.pagePoolSize && !page.isClosed()) {
                this.pagePool.push(page);
            } else {
                // 如果池已满或页面已关闭，直接关闭页面
                if (!page.isClosed()) {
                    await page.close().catch(() => {});
                }
            }
        } catch (error) {
            // 如果归还失败，尝试关闭页面
            this.log('归还页面到池失败:', error);
            if (!page.isClosed()) {
                await page.close().catch(() => {});
            }
        }
    }
    
    log(...args:any[]){
        console.log("douyin:",...args);
    }
     async parseWatermark(url:string,openid:string,originUrl:string){
        if(!this.browser){
            throw new Error("browser not found");
        }
        let page: Page | null = null;
        let shortVideo = new ShortVideoEntity();
        shortVideo.type="douyin";
        shortVideo.openid = openid;
        shortVideo.contentType="video";
        shortVideo.status=0;
        shortVideo.originUrl=originUrl;
        let id = await this.extractId(url);
        try{
            this.log("id:",id);
            page = await this.getPageFromPool();
            await page.goto(url,{
                waitUntil: 'domcontentloaded', // 或 'networkidle2'（最多2个连接）
                // timeout: 1000*60 // 增加到60秒
            });
            let pageUrl = page.url();
            console.log("pageUrl:",pageUrl);
            if(pageUrl.startsWith("https://www.iesdouyin.com/share/video/")){
                // let id = pageUrl.split("/").pop();
                await page.goto(`https://www.douyin.com/video/${id}`,{
                    waitUntil: 'domcontentloaded', // 或 'networkidle2'（最多2个连接）
                    // timeout: 1000*60 // 增加到60秒
                });
            }
            pageUrl = page.url();
            console.log("pageUrl2:",pageUrl);
            // https://www.iesdouyin.com/share/note
            if(pageUrl.startsWith("https://www.douyin.com/video") ){
                    this.log("waitForResponse:aweme/v1/web/aweme/detail/");
                    // 先获取文本内容，然后手动解析 JSON（避免响应体被消费的问题）
                    let textData: string='';
                    let retryCount = 0;
                    const maxRetries = 3;
                    let content = await page.content();
                    // console.log("content:",content);
                    while (retryCount < maxRetries) {
                        try {
                            let response2 = await page.waitForResponse(response => {
                                const url = response.url();
                                const method = response.request().method();
                                const isValid = url.startsWith("https://www.douyin.com/aweme/v1/web/aweme/detail") 
                                && method === 'GET' 
                                && response.ok();
                                return isValid;
                            }, {
                                timeout: 1000*15 // 增加到15秒
                            });
                            // 检查响应状态
                            if (!response2.ok()) {
                                this.log(`响应状态异常: ${response2.status()} ${response2.statusText()}`);
                                throw new HttpException(`请求失败，状态码: ${response2.status()}`, response2.status());
                            }
                            textData = await response2.text();                                                        
                            this.log(`响应文本长度: ${textData ? textData.length : 0}, 重试次数: ${retryCount}`);
                            this.log(`响应文本: ${textData}`);
                            // 如果文本不为空，跳出循环
                            if (textData && textData.trim().length > 0) {
                                break;
                            }
                            
                            // 如果文本为空且还有重试机会，等待后重试
                            if (retryCount < maxRetries - 1) {
                                this.log(`响应文本为空，等待 ${(retryCount + 1) * 1000}ms 后重试...`);
                                await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
                                retryCount++;
                            } else {
                                // 最后一次重试仍然为空
                                this.log("响应文本为空，已重试所有次数");
                                // 记录更多调试信息
                                this.log(`响应 URL: ${response2.url()}`);
                                this.log(`响应状态: ${response2.status()}`);
                                throw new HttpException('响应文本为空', 500);
                            }
                        } catch (error) {
                            if (retryCount < maxRetries - 1) {
                                this.log(`获取响应文本失败: ${error.message}，等待 ${(retryCount + 1) * 1000}ms 后重试...`);
                                await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
                                retryCount++;
                            } else {
                                this.log(`获取响应文本失败: ${error.message}`);
                                throw new HttpException(`获取响应文本失败: ${error.message}`, 500);
                            }
                        }
                    }
                    
                    // 检查文本是否为空
                    if (!textData || textData.trim().length === 0) {
                        this.log("响应文本为空");
                        throw new HttpException('响应文本为空', 500);
                    }
                    
                    // 手动解析 JSON
                    let data: any;
                    try {
                        data = JSON.parse(textData);
                    } catch (error) {
                        this.log(`JSON 解析失败: ${error.message}`);
                        this.log(`响应文本前500字符: ${textData.substring(0, 500)}`);
                        throw new HttpException(`JSON 解析失败: ${error.message}`, 500);
                    }
                    
                    // 检查数据是否有效
                    if (!data || !data.aweme_detail) {
                        this.log("响应数据无效或缺少 aweme_detail");
                        throw new HttpException('响应数据无效', 500);
                    }
                    await page.close();
                    // console.log("data", JSON.stringify(data));
                    // let res = await superagent.get(url).redirects(3);
                    // console.log(res.text);
                    // 发送请求获取视频信息
                    // console.log("data", JSON.stringify(data));
                 
                    shortVideo.content={
                        author: data.aweme_detail.video?.nickname || '',
                        uid: data.aweme_detail.author?.sec_uid || '',
                        avatar: data.aweme_detail.author?.avatar_thumb?.url_list?.[0] || '',
                        like: data.aweme_detail.statistics?.digg_count || 0,
                        time: data.aweme_detail.create_time || 0,
                        title: data.aweme_detail?.desc || '',
                        cover: data.aweme_detail?.cover_hd?.cover?.url_list?.[0] || '',
                        images: data.aweme_detail?.images?.length > 0 ? data.aweme_detail?.images : '', //当前为短视频解析模式
                        url: data.aweme_detail?.images?.length > 0 
                            ? ''//`当前为图文解析，图文数量为:${imgurl.length}张图片` 
                            : data.aweme_detail?.video?.play_addr?.url_list?.[0] || '',
                        music: {
                            title: data.aweme_detail?.music?.title || '',
                            author: data.aweme_detail?.music?.author || '',
                            avatar: data.aweme_detail?.music?.cover_hd?.cover?.url_list?.[0] || '',
                            url: data.aweme_detail?.music?.play_url?.url_list?.[0] || '',
                        }
                    };
                    shortVideo.status=1;
                    shortVideo = await this.shortVideoRepository.save(shortVideo);
                    return {
                        id:shortVideo.id,
                    };
            }
            await page.close();
        }catch(err){
            this.log('parseWatermark error:', err);
            throw err;
        }finally{
            if(page){
                await this.returnPageToPool(page);
            }
        }
        
        if(!id){
            shortVideo.msg="视频ID不存在";
            shortVideo.status=2;
            await this.shortVideoRepository.save(shortVideo);
            return null;
        }
        const response = await (await superagent.post('https://www.iesdouyin.com/share/video/' + id).set(this.headers));
        // console.log(response.text);
                // 提取 window._ROUTER_DATA 的内容
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
        // console.log(videoInfo);

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
                url: itemList.music?.play_addr?.url_list[0] || '',
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
            .redirects(30)
            .ok(() => true); // 允许所有状态码
            // this.log("response:",response.text);
            // 获取最终的重定向 URL
            const finalUrl = response.redirects.length > 0 
            ? response.redirects[response.redirects.length - 1]
            : url;

            // 使用正则表达式提取视频 ID
            console.log("finalUrl:",finalUrl);
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

