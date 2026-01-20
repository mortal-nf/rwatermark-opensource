import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;
  private isConnected: boolean = false;

  constructor() {
    // 创建Redis连接
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      // 连接超时设置
      connectTimeout: 5000,
      // 重试策略
      retryStrategy: (times: number) => {
        // 最多重试3次，每次间隔1秒
        return times > 3 ? null : 1000;
      }
    });

    // 监听连接事件
    this.redisClient.on('connect', () => {
      console.log('Redis连接成功');
      this.isConnected = true;
    });

    // 监听错误事件
    this.redisClient.on('error', (error: any) => {
      console.error('Redis连接错误:', error.message);
      this.isConnected = false;
    });

    // 监听关闭事件
    this.redisClient.on('close', () => {
      console.log('Redis连接已关闭');
      this.isConnected = false;
    });
  }

  /**
   * 模块初始化时调用
   */
  async onModuleInit() {
    // 尝试连接Redis
    try {
      await this.redisClient.ping();
      console.log('Redis ping成功');
    } catch (error) {
      console.error('Redis ping失败:', error.message);
    }
  }

  /**
   * 模块销毁时调用
   */
  async onModuleDestroy() {
    // 关闭Redis连接
    await this.redisClient.quit();
    console.log('Redis连接已关闭');
  }

  /**
   * 检查Redis是否连接
   * @returns 是否连接成功
   */
  isRedisConnected(): boolean {
    return this.isConnected;
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒）
   * @returns 设置结果
   */
  async set(key: string, value: any, ttl: number = 86400): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await this.redisClient.set(key, stringValue, 'EX', ttl);
      return true;
    } catch (error) {
      console.error('Redis set失败:', error.message);
      return false;
    }
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      const value = await this.redisClient.get(key);
      if (value === null) {
        return null;
      }

      // 尝试解析JSON
      try {
        return JSON.parse(value) as T;
      } catch {
        // 如果不是JSON格式，直接返回字符串
        return value as unknown as T;
      }
    } catch (error) {
      console.error('Redis get失败:', error.message);
      return null;
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   * @returns 删除结果
   */
  async del(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis del失败:', error.message);
      return false;
    }
  }

  /**
   * 设置缓存过期时间
   * @param key 缓存键
   * @param ttl 过期时间（秒）
   * @returns 设置结果
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.redisClient.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('Redis expire失败:', error.message);
      return false;
    }
  }

  /**
   * 生成缓存键
   * @param prefix 前缀
   * @param data 数据（用于生成唯一键）
   * @returns 缓存键
   */
  generateCacheKey(prefix: string, data: any): string {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return `${prefix}:${Buffer.from(dataStr).toString('base64')}`;
  }
}
