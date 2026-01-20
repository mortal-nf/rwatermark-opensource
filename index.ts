import { NestFactory } from '@nestjs/core';
// 加载环境变量
import * as dotenv from 'dotenv';
dotenv.config();
import { AppModule} from './index.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 设置全局前缀
  app.setGlobalPrefix('api');
  
  // 启用CORS
  app.enableCors();
  
  // 使用验证管道
  app.useGlobalPipes(new ValidationPipe());
  
  // 配置Swagger文档
  const config = new DocumentBuilder()
    .setTitle('rwatermark API')
    .setDescription('多平台短视频无水印解析服务API文档')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);
  
  // 启动应用
  await app.listen(30002);
  console.log('应用已启动在 http://localhost:30002');
  console.log('Swagger文档地址: http://localhost:30002/swagger');
}

bootstrap();