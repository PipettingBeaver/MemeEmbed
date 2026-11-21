export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error'

export interface LogEntry {
  id: number
  time: string
  level: LogLevel
  message: string
  detail?: string
}

class LogStore {
  entries = $state<LogEntry[]>([])
  private nextId = 1

  add(level: LogLevel, message: string, detail?: string): void {
    const entry: LogEntry = {
      id: this.nextId++,
      time: new Date().toLocaleTimeString(),
      level,
      message,
      detail,
    }
    this.entries = [...this.entries, entry]
    if (this.entries.length > 500) {
      this.entries = this.entries.slice(-500)
    }
    const line = detail ? `${message} :: ${detail}` : message
    if (level === 'error') console.error(`[MemeEmbed] ${line}`)
    else if (level === 'warn') console.warn(`[MemeEmbed] ${line}`)
    else console.info(`[MemeEmbed] ${line}`)
  }

  clear(): void {
    this.entries = []
  }

  toText(): string {
    return this.entries
      .map((entry) => {
        const detail = entry.detail ? ` | ${entry.detail}` : ''
        return `${entry.time} [${entry.level.toUpperCase()}] ${entry.message}${detail}`
      })
      .join('\n')
  }
}

export const logs = new LogStore()

export function logError(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : String(error)
  const detail = error instanceof Error ? error.stack : undefined
  logs.add('error', `${context}: ${message}`, detail)
}
