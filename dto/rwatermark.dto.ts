import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString, IsUrl, Length, MaxLength, MinLength } from "class-validator";

export class ParseWatermarkDto{
    
    @ApiProperty({ description: 'url' })
    @IsString()
    @IsNotEmpty()
    url:string;

    
    openid:string;
}

export class FindByIdWatermarkDto{
    @IsNumber()
    @IsNotEmpty()
    id:number;
    openid:string;
}
export class DownloadUrlDto {
    @ApiProperty({ description: '要下载的文件URL' })
    @IsUrl()
    @IsNotEmpty()
    url: string;
    
    @ApiProperty({ description: '下载文件的文件名', required: false })
    @IsString()
    fileName?: string;
}