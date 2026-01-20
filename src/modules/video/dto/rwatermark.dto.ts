import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString, IsUrl, Length, MaxLength, MinLength, Matches, ValidateIf } from "class-validator";

// 支持的短视频平台URL正则表达式
const VIDEO_PLATFORM_URL_REGEX = /^(https?:\/\/)?(v\.douyin\.com|xhslink\.com|v\.kuaishou\.com|video\.weibo\.com|www\.bilibili\.com|b23\.tv|m\.toutiao\.com|(?:twitter|x)\.com)\/.+/i;

export class ParseWatermarkDto{
    
    @ApiProperty({ description: '视频链接', example: 'https://v.douyin.com/xxxxxxx' })
    @IsString()
    @IsNotEmpty()
    @Matches(VIDEO_PLATFORM_URL_REGEX, { message: '无效的视频链接格式，仅支持抖音、小红书、快手、微博、B站、头条、Twitter平台' })
    url:string;

    
    @ApiProperty({ description: '用户唯一标识', required: false })
    @ValidateIf(o => o.openid !== undefined)
    @IsString()
    @Length(1, 50, { message: 'openid长度必须在1-50个字符之间' })
    openid:string;
}

export class FindByIdWatermarkDto{
    @ApiProperty({ description: '视频ID' })
    @IsNumber({}, { message: 'id必须是数字' })
    @IsNotEmpty()
    id:number;
    
    @ApiProperty({ description: '用户唯一标识', required: false })
    @ValidateIf(o => o.openid !== undefined)
    @IsString()
    @Length(1, 50, { message: 'openid长度必须在1-50个字符之间' })
    openid:string;
}
export class DownloadUrlDto {
    @ApiProperty({ description: '要下载的文件URL' })
    @IsUrl({ require_protocol: true, require_valid_protocol: true }, { message: '无效的URL格式' })
    @IsNotEmpty()
    url: string;
    
    @ApiProperty({ description: '下载文件的文件名', required: false })
    @ValidateIf(o => o.fileName !== undefined)
    @IsString()
    @MaxLength(255, { message: '文件名长度不能超过255个字符' })
    fileName?: string;
}