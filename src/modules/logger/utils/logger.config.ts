/**
 * Winston日志配置
 */

import * as winston from 'winston';
import * as path from 'path';

// 日志级别：error > warn > info > http > verbose > debug > silly
export const loggerConfig = {
  // 应用名称，用于区分多个应用的日志
  appName: 'rwatermark',
  // 日志级别
  level: process.env.LOG_LEVEL || 'info',
  // 是否启用控制台输出
  consoleEnable: true,
  // 是否启用文件输出
  fileEnable: true,
  // 日志文件目录
  logDir: path.join(__dirname, '../../logs'),
  // 日志文件最大大小（单位：MB）
  maxSize: 50 * 1024 * 1024,
  // 日志文件最大保留天数
  maxFiles: 14
};

/**
 * 创建Winston日志实例
 */
export const createLogger = () => {
  const transports: winston.transport[] = [];

  // 控制台输出配置
  if (loggerConfig.consoleEnable) {
    transports.push(
      new winston.transports.Console({
        level: loggerConfig.level,
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
          }),
          winston.format.printf(info => {
            return `${info.timestamp} [${info.level}] [${loggerConfig.appName}] ${info.message}`;
          })
        )
      })
    );
  }

  // 文件输出配置
  if (loggerConfig.fileEnable) {
    // 确保日志目录存在
    const fs = require('fs');
    if (!fs.existsSync(loggerConfig.logDir)) {
      fs.mkdirSync(loggerConfig.logDir, { recursive: true });
    }

    // 错误日志文件
    transports.push(
      new winston.transports.File({
        level: 'error',
        filename: path.join(loggerConfig.logDir, 'error.log'),
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
          }),
          winston.format.json()
        ),
        maxsize: loggerConfig.maxSize,
        maxFiles: loggerConfig.maxFiles
      })
    );

    // 所有日志文件
    transports.push(
      new winston.transports.File({
        level: loggerConfig.level,
        filename: path.join(loggerConfig.logDir, 'combined.log'),
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
          }),
          winston.format.json()
        ),
        maxsize: loggerConfig.maxSize,
        maxFiles: loggerConfig.maxFiles
      })
    );
  }

  return winston.createLogger({
    level: loggerConfig.level,
    transports
  });
};
