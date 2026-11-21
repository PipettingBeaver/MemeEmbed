import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { History } from './history'

describe('History', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('undoes and redoes snapshots in order', () => {
    const history = new History<string>()
    history.record('a', 'one')
    vi.advanceTimersByTime(1000)
    history.record('b', 'two')

    expect(history.undo('c')).toBe('b')
    expect(history.undo('b')).toBe('a')
    expect(history.undo('a')).toBeNull()
    expect(history.redo('a')).toBe('b')
    expect(history.redo('b')).toBe('c')
    expect(history.redo('c')).toBeNull()
  })

  it('coalesces rapid changes with the same key', () => {
    const history = new History<string>()
    history.record('a', 'feather')
    vi.advanceTimersByTime(100)
    history.record('b', 'feather')
    vi.advanceTimersByTime(100)
    history.record('c', 'feather')

    expect(history.undo('d')).toBe('a')
    expect(history.undo('a')).toBeNull()
  })

  it('starts a new entry after the coalesce window', () => {
    const history = new History<string>(50, 200)
    history.record('a', 'feather')
    vi.advanceTimersByTime(300)
    history.record('b', 'feather')

    expect(history.undo('c')).toBe('b')
    expect(history.undo('b')).toBe('a')
  })

  it('records one entry per drag transaction', () => {
    const history = new History<string>()
    history.beginTransaction()
    history.record('a', 'rect')
    history.record('b', 'rect')
    history.record('c', 'rect')
    history.endTransaction()

    expect(history.undo('d')).toBe('a')
    expect(history.undo('a')).toBeNull()
  })

  it('clears redo when a new change is recorded', () => {
    const history = new History<string>()
    history.record('a', 'one')
    vi.advanceTimersByTime(1000)
    history.record('b', 'two')
    expect(history.undo('c')).toBe('b')
    history.record('b', 'three')
    expect(history.canRedo).toBe(false)
  })

  it('respects the history limit', () => {
    const history = new History<string>(2)
    history.record('a', 'one')
    vi.advanceTimersByTime(1000)
    history.record('b', 'two')
    vi.advanceTimersByTime(1000)
    history.record('c', 'three')

    expect(history.undo('d')).toBe('c')
    expect(history.undo('c')).toBe('b')
    expect(history.undo('b')).toBeNull()
  })

  it('resets everything', () => {
    const history = new History<string>()
    history.record('a', 'one')
    history.undo('b')
    history.reset()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
