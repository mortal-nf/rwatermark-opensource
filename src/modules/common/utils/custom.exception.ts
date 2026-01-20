import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from './error.constants';

/**
 * 自定义HTTP异常类
 * 用于统一API错误响应格式
 */
export class CustomHttpException extends HttpException {
  constructor(
    errorCode: keyof typeof ERROR_CODES,
    message?: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST
  ) {
    const errorInfo = ERROR_CODES[errorCode] || ERROR_CODES.INTERNAL_ERROR;
    const response = {
      code: errorInfo.code,
      msg: message || errorInfo.message
    };
    super(response, statusCode);
  }
}

/**
 * 业务异常类
 * 用于处理业务逻辑错误
 */
export class BusinessException extends CustomHttpException {
  constructor(
    errorCode: keyof typeof ERROR_CODES,
    message?: string
  ) {
    super(errorCode, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * 系统异常类
 * 用于处理系统级错误
 */
export class SystemException extends CustomHttpException {
  constructor(
    errorCode: keyof typeof ERROR_CODES,
    message?: string
  ) {
    super(errorCode, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
