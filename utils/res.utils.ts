/**
 * 响应工具类
 * 用于统一 API 响应格式
 */
export class ResUtils {
  static success(data?: any, message: string = 'success') {
    return {
      code: 200,
      msg: message,
      data: data,
    };
  }

  static error(message: string = 'error', code: number = 500) {
    return {
      code: code,
      msg: message,
      data: null,
    };
  }
}

