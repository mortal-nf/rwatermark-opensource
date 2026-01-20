import { BeforeInsert, BeforeUpdate, Entity } from "typeorm";
import { Column } from "typeorm/decorator/columns/Column"
import { PrimaryGeneratedColumn } from "typeorm/decorator/columns/PrimaryGeneratedColumn";

@Entity({name:"short_video"})
export class ShortVideoEntity {
  @PrimaryGeneratedColumn("increment")
  id: number;
  @Column({ type: "varchar", length: 255 ,name:"openid"}) //openid
  openid: string;
  @Column({ type: "varchar", length: 255 ,name:"type"}) //类型 douyin
  type: string;
  @Column({ type: "varchar", length: 255 ,name:"content_type"}) //内容类型 video,image,audio
  contentType: string;
  @Column({ type: "varchar", length: 255 ,name:"origin_url"}) //原始链接
  originUrl: string;
  @Column({ type: "json" ,name:"content"}) //内容
  content: any;
  @Column({ type: "varchar", length: 255 ,name:"video_path"}) //视频路径
  videoPath: string;
  @Column({ type: "json" ,name:"img_paths"}) //图片路径
  imgPaths: any;
  @Column({ type: "varchar", length: 255 ,name:"music_path"}) //音乐路径
  musicPath: string;
  @Column({ type: "tinyint",name:"status",default:0}) //状态
  status: number;
  @Column({ type: "text",name:"msg"}) //消息
  msg: string;
  @Column({ type: "datetime" ,name:"deleted_at",nullable:true})
  deletedAt: Date|null;
  @Column({ type: "datetime" ,name:"created_at"})
  createdAt: Date;
  @Column({ type: "datetime" ,name:"updated_at"})
  updatedAt: Date;
  @BeforeInsert()
  beforeInsert() {
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
  @BeforeUpdate()
  beforeUpdate() {
    this.updatedAt = new Date();
  }
  
}