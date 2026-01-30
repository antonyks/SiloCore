export class Logger {
  error(message: string, error?: any): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
  }

  warn(message: string): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
  }

  info(message: string): void {
    console.info(`[INFO] ${new Date().toISOString()} - ${message}`);
  }
}

export const logger = new Logger();