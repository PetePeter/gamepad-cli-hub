import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const logDir = path.join(__dirname, '../../logs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// Tell winston about these colors
winston.addColors(colors);

// Define the custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Define transports
const transports: winston.transport[] = [
  // Console transport with colors
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      customFormat
    ),
  }),
  // Daily rotating file transport for all logs
  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    level: 'info',
    format: customFormat,
    datePattern: 'YYYY-MM-DD',
    maxSize: '10m',
    maxFiles: '14d',
  }),
  // Daily rotating file transport for error logs only
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    level: 'error',
    format: customFormat,
    datePattern: 'YYYY-MM-DD',
    maxSize: '10m',
    maxFiles: '14d',
  }),
];

// Create the logger instance
export const logger = winston.createLogger({
  levels,
  transports,
  level: process.env.LOG_LEVEL || 'info',
});

export default logger;
