import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { createLogger } from './src/modules/logger/utils/logger.config';

import { RWatermarkController } from './src/modules/video/controllers/video.controller';
import { RWatermarkService } from './src/modules/video/services/index.service';
import { RedisService } from './src/modules/cache/services/redis.service';

import { XhsService } from './src/modules/video/services/xhs.service';
import { KuaishouService } from './src/modules/video/services/kuaishou.service';
import { WeiboService } from './src/modules/video/services/weibo.service';
import { BilibiliService } from './src/modules/video/services/bilibili.service';
import { DouyinV2Service } from './src/modules/video/services/douyinV2.service';
import { StreamDownloadService } from './src/modules/download/services/stream-download.implementation';
import { ToutiaoService } from './src/modules/video/services/toutiao.service';
import { TwitterService } from './src/modules/video/services/twitter.service';

@Module({
  imports: [
    WinstonModule.forRoot({
      instance: createLogger()
    })
  ],
  controllers: [RWatermarkController],
  providers: [
    RWatermarkService,
    RedisService,
    XhsService, KuaishouService,
    WeiboService, BilibiliService, DouyinV2Service,
    StreamDownloadService, ToutiaoService, TwitterService
  ],
  exports: [WinstonModule]
})
export class AppModule {}
