declare namespace DebugLogfmt {
  interface DebugOptions {
    levels?: string[]
  }

  interface DurationLogger {
    (...args: any[]): boolean
    error(...args: any[]): boolean
    info(...args: any[]): boolean
  }

  interface DebugLogger {
    (...args: any[]): void
    duration(...args: any[]): DurationLogger
    [level: string]: ((...args: any[]) => void) | DurationLogger | ((...args: any[]) => DurationLogger)
  }
}

declare function createDebugLogger(env: string, options?: DebugLogfmt.DebugOptions): DebugLogfmt.DebugLogger

export = createDebugLogger
