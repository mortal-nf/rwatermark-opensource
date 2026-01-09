import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * 身份验证守卫
 * 注意：这是一个基础实现，你需要根据实际项目需求实现完整的认证逻辑
 * 
 * 使用方式：
 * 1. 从请求头中获取 token
 * 2. 验证 token 的有效性
 * 3. 将用户信息附加到 request.loginUser
 */
@Injectable()
export class CheckLoginUserGatewayGuard implements CanActivate {
  constructor(private readonly role?: string) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.token || request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('缺少认证 token');
    }

    // TODO: 实现 token 验证逻辑
    // 示例：验证 token 并获取用户信息
    // const user = await this.authService.validateToken(token);
    // if (!user) {
    //   throw new UnauthorizedException('无效的 token');
    // }
    
    // 将用户信息附加到 request 对象
    // request.loginUser = user;
    
    // ⚠️ 警告：这是临时示例实现，仅用于开发测试
    // 生产环境必须实现完整的 token 验证逻辑，不要使用硬编码的 demo_openid
    // 示例实现：从 token 解析用户信息（需要实现 JWT 解析）
    if (!request.loginUser) {
      // TODO: 实现真实的 JWT 解析逻辑
      // const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // request.loginUser = { openid: decoded.openid };
      
      // ⚠️ 仅用于开发测试，生产环境必须删除此代码
      request.loginUser = {
        openid: 'demo_openid', // 临时示例值，需要替换为真实的 token 解析结果
      };
    }

    return true;
  }
}

