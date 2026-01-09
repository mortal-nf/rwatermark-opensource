import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RWatermarkController } from './index.controller';
import { RWatermarkService } from './index.service';
import { VDouyinService } from './vdouyin.service';
import { ShortVideoEntity } from './entities/shortVideo.entity';
import { XhsService } from './xhs.service';
import { KuaishouService } from './kuaishou.service';
import { WeiboService } from './weibo.service';
import { BilibiliService } from './bilibili.service';
import { DouyinV2Service } from './douyinV2.service';
import { StreamDownloadService } from './stream-download.implementation';
import { ToutiaoService } from './toutiao.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShortVideoEntity
    ]),
  ],
  controllers: [RWatermarkController],
  providers: [RWatermarkService,
    VDouyinService,XhsService,KuaishouService,
    WeiboService,BilibiliService,DouyinV2Service,
    StreamDownloadService,ToutiaoService
  ],
})
export class RWatermarkModule {}
