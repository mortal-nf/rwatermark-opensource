/**
 * 错误码常量定义
 * 用于统一管理所有错误码和错误信息
 */

export const ERROR_CODES = {
  // 通用错误
  SUCCESS: { code: 0, message: '成功' },
  INTERNAL_ERROR: { code: 50000, message: '内部服务器错误' },
  PARAM_ERROR: { code: 40000, message: '参数错误' },
  NOT_FOUND: { code: 40004, message: '资源不存在' },
  UNAUTHORIZED: { code: 40001, message: '未授权' },
  FORBIDDEN: { code: 40003, message: '禁止访问' },
  RATE_LIMITED: { code: 40029, message: '请求频率过高' },

  // 解析相关错误
  PARSE_FAILED: { code: 50001, message: '解析失败' },
  UNSUPPORTED_PLATFORM: { code: 40005, message: '不支持的平台链接' },
  INVALID_URL: { code: 40006, message: '无效的链接格式' },
  VIDEO_NOT_FOUND: { code: 40007, message: '视频不存在或已删除' },
  PARSE_TIMEOUT: { code: 50002, message: '解析超时' },

  // 下载相关错误
  DOWNLOAD_FAILED: { code: 50003, message: '下载失败' },
  DOWNLOAD_TIMEOUT: { code: 50004, message: '下载超时' },
  FILE_TOO_LARGE: { code: 40008, message: '文件过大' },
  STORAGE_ERROR: { code: 50005, message: '存储错误' },

  // Puppeteer相关错误
  PUPPETEER_ERROR: { code: 50006, message: '浏览器服务错误' },
  PAGE_TIMEOUT: { code: 50007, message: '页面加载超时' },
  BROWSER_LAUNCH_FAILED: { code: 50008, message: '浏览器启动失败' },

  // 缓存相关错误
  CACHE_ERROR: { code: 50009, message: '缓存错误' },
  CACHE_EXPIRED: { code: 40010, message: '缓存已过期' }
};

/**
 * 根据错误码获取错误信息
 * @param errorCode 错误码
 * @returns 错误信息对象
 */
export const getErrorInfo = (errorCode: keyof typeof ERROR_CODES) => {
  return ERROR_CODES[errorCode] || ERROR_CODES.INTERNAL_ERROR;
};
