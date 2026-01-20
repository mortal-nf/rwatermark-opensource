import { Module } from '@nestjs/common';
import { RWatermarkController } from './src/controllers/index.controller';
import { RWatermarkService } from './src/services/index.service';

import { XhsService } from './src/services/xhs.service';
import { KuaishouService } from './src/services/kuaishou.service';
import { WeiboService } from './src/services/weibo.service';
import { BilibiliService } from './src/services/bilibili.service';
import { DouyinV2Service } from './src/services/douyinV2.service';
import { StreamDownloadService } from './src/services/stream-download.implementation';
import { ToutiaoService } from './src/services/toutiao.service';
import { TwitterService } from './src/services/twitter.service';

@Module({
  imports: [],
  controllers: [RWatermarkController],
  providers: [
    RWatermarkService,
    XhsService, KuaishouService,
    WeiboService, BilibiliService, DouyinV2Service,
    StreamDownloadService, ToutiaoService, TwitterService
  ],
})
export class AppModule {}
