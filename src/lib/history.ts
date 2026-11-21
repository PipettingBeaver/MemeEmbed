export class History<T> {
  private undoStack: T[] = []
  private redoStack: T[] = []
  private lastKey = ''
  private lastTime = 0
  private transactionActive = false
  private transactionRecorded = false

  constructor(
    private readonly limit = 50,
    private readonly coalesceMs = 800,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get isTransactionActive(): boolean {
    return this.transactionActive
  }

  beginTransaction(): void {
    this.transactionActive = true
    this.transactionRecorded = false
  }

  endTransaction(): void {
    this.transactionActive = false
    this.transactionRecorded = false
    this.lastKey = ''
    this.lastTime = 0
  }

  reset(): void {
    this.undoStack = []
    this.redoStack = []
    this.lastKey = ''
    this.lastTime = 0
    this.transactionActive = false
    this.transactionRecorded = false
  }

  /**
   * Stores the state *before* a mutation. Repeated changes with the same key
   * inside the coalesce window (sliders, typing) collapse into one entry, and a
   * drag transaction records only its first change.
   */
  record(snapshot: T, key: string): boolean {
    if (this.transactionActive) {
      if (this.transactionRecorded) return false
      this.undoStack.push(snapshot)
      this.transactionRecorded = true
      this.afterPush()
      return true
    }

    const now = Date.now()
    if (key === this.lastKey && now - this.lastTime < this.coalesceMs) {
      this.lastTime = now
      return false
    }

    this.undoStack.push(snapshot)
    this.lastKey = key
    this.lastTime = now
    this.afterPush()
    return true
  }

  undo(current: T): T | null {
    if (this.transactionActive) return null
    const snapshot = this.undoStack.pop()
    if (snapshot === undefined) return null
    this.redoStack.push(current)
    this.lastKey = ''
    this.lastTime = 0
    return snapshot
  }

  redo(current: T): T | null {
    if (this.transactionActive) return null
    const snapshot = this.redoStack.pop()
    if (snapshot === undefined) return null
    this.undoStack.push(current)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.lastKey = ''
    this.lastTime = 0
    return snapshot
  }

  private afterPush(): void {
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }
}
