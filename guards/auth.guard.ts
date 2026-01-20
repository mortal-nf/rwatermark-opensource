import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * 身份验证守卫
 * 注意：这是一个基础实现，支持JWT验证和简单token验证
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

    // 将用户信息附加到 request 对象
    request.loginUser = this.validateToken(token);

    return true;
  }

  /**
   * 验证token并返回用户信息
   * @param token 认证token
   * @returns 用户信息
   */
  private validateToken(token: string): { openid: string } {
    // 开发环境：使用简单的token验证
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
      // 简单token格式：openid_xxx
      if (token.startsWith('openid_')) {
        return {
          openid: token.substring(7),
        };
      }
      // 默认使用demo_openid
      return {
        openid: 'demo_openid',
      };
    }

    // 生产环境：实现JWT验证
    try {
      // 这里需要安装jsonwebtoken库并实现真正的JWT验证
      // const jwt = require('jsonwebtoken');
      // const secret = process.env.JWT_SECRET || 'your-secret-key';
      // const decoded = jwt.verify(token, secret);
      // return {
      //   openid: decoded.openid,
      // };
      
      // 临时实现：实际生产环境必须替换为真正的JWT验证
      throw new UnauthorizedException('生产环境需要实现JWT验证');
    } catch (error) {
      throw new UnauthorizedException('无效的 token');
    }
  }
}

