<script lang="ts">
  import { renderMeme } from '../lib/composite'
  import {
    clampPoint,
    clampRect,
    hitCorner,
    hitHandle,
    pointInPolygon,
    pointInRect,
    rectCorners,
    resizeRect,
    type Corner,
    type Handle,
  } from '../lib/geometry'
  import type { LogLevel } from '../lib/log.svelte'
  import type { MemeTemplate, Point, Rect, Slot, ToolMode } from '../lib/types'

  interface Props {
    template: MemeTemplate
    baseImage: HTMLImageElement | null
    slotImages: Record<string, HTMLImageElement>
    backfillImages: Record<string, HTMLImageElement>
    selectedSlotId: string | null
    mode: ToolMode
    onSelect: (id: string | null) => void
    onChangeRect: (id: string, rect: Rect) => void
    onChangeQuad: (id: string, points: Point[]) => void
    onCreateSlot: (points: Point[]) => void
    onEditStart: () => void
    onEditEnd: () => void
    onAttachRequest: (slotId: string) => void
    onDropImage: (slotId: string | null, file: File) => void
    onLog: (level: LogLevel, message: string) => void
  }

  let {
    template,
    baseImage,
    slotImages,
    backfillImages,
    selectedSlotId,
    mode,
    onSelect,
    onChangeRect,
    onChangeQuad,
    onCreateSlot,
    onEditStart,
    onEditEnd,
    onAttachRequest,
    onDropImage,
    onLog,
  }: Props = $props()

  let canvasElement = $state<HTMLCanvasElement | null>(null)
  let creatingPoints = $state<Point[]>([])

  type DragState =
    | { kind: 'move'; slotId: string; startPointer: Point; startRect: Rect }
    | { kind: 'resize'; slotId: string; handle: Handle; startRect: Rect }
    | { kind: 'quad-move'; slotId: string; startPointer: Point; startPoints: Point[] }
    | { kind: 'point'; slotId: string; index: Corner; points: Point[] }
    | null

  let drag = $state<DragState>(null)
  let dragMoved = false

  $effect(() => {
    const canvas = canvasElement
    const currentTemplate = template
    const base = baseImage
    const slots = slotImages
    const backfills = backfillImages
    const selected = selectedSlotId
    const points = creatingPoints
    if (!canvas || !currentTemplate) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderMeme(ctx, {
      template: currentTemplate,
      baseImage: base,
      slotImages: slots,
      backfillImages: backfills,
      showOverlays: true,
      selectedSlotId: selected,
      creatingPoints: points,
    })
  })

  $effect(() => {
    if (mode !== 'create' && creatingPoints.length > 0) {
      creatingPoints = []
    }
  })

  function toImage(event: { clientX: number; clientY: number }): Point {
    const canvas = canvasElement
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * template.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * template.height,
    }
  }

  function handleTolerance(): number {
    const canvas = canvasElement
    if (!canvas) return 12
    const rect = canvas.getBoundingClientRect()
    return (12 * template.width) / Math.max(1, rect.width)
  }

  function selectedSlot() {
    return template.slots.find((slot) => slot.id === selectedSlotId) ?? null
  }

  function slotPoints(slot: Slot): Point[] {
    if (slot.shape === 'quad' && slot.points && slot.points.length === 4) {
      return slot.points
    }
    return rectCorners(slot.rect)
  }

  function slotUnder(point: Point) {
    return (
      [...template.slots].reverse().find((slot) => {
        if (slot.shape === 'quad' && slot.points && slot.points.length === 4) {
          return pointInPolygon(point, slot.points)
        }
        return pointInRect(point, slot.rect)
      }) ?? null
    )
  }

  function handlePointerDown(event: PointerEvent): void {
    const canvas = canvasElement
    if (!canvas) return
    event.preventDefault()
    dragMoved = false
    const point = toImage(event)

    if (mode === 'create') {
      const points = [...creatingPoints, point]
      if (points.length < 4) {
        creatingPoints = points
        return
      }
      creatingPoints = []
      onCreateSlot(points)
      return
    }

    const selected = selectedSlot()
    if (selected) {
      const tolerance = handleTolerance()
      if (selected.shape === 'quad' && selected.points && selected.points.length === 4) {
        const index = hitCorner(point, selected.points, tolerance)
        if (index !== null) {
          onEditStart()
          drag = {
            kind: 'point',
            slotId: selected.id,
            index,
            points: selected.points.map((p) => ({ ...p })),
          }
          canvas.setPointerCapture(event.pointerId)
          return
        }
      } else {
        const handle = hitHandle(point, selected.rect, tolerance)
        if (handle) {
          const isCorner =
            handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw'
          if ((event.ctrlKey || event.metaKey) && isCorner) {
            const index: Corner =
              handle === 'nw' ? 0 : handle === 'ne' ? 1 : handle === 'se' ? 2 : 3
            const points = rectCorners(selected.rect)
            points[index] = clampPoint(point, template.width, template.height)
            onEditStart()
            drag = { kind: 'point', slotId: selected.id, index, points }
            onChangeQuad(selected.id, points)
            canvas.setPointerCapture(event.pointerId)
            return
          }
          onEditStart()
          drag = {
            kind: 'resize',
            slotId: selected.id,
            handle,
            startRect: { ...selected.rect },
          }
          canvas.setPointerCapture(event.pointerId)
          return
        }
      }
    }

    const hit = slotUnder(point)
    if (hit) {
      onSelect(hit.id)
      onEditStart()
      if (hit.shape === 'quad' && hit.points && hit.points.length === 4) {
        drag = {
          kind: 'quad-move',
          slotId: hit.id,
          startPointer: point,
          startPoints: hit.points.map((p) => ({ ...p })),
        }
      } else {
        drag = {
          kind: 'move',
          slotId: hit.id,
          startPointer: point,
          startRect: { ...hit.rect },
        }
      }
      canvas.setPointerCapture(event.pointerId)
      return
    }

    onSelect(null)
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!drag) return
    const point = toImage(event)

    if (drag.kind === 'move') {
      const dx = point.x - drag.startPointer.x
      const dy = point.y - drag.startPointer.y
      const threshold = handleTolerance() * 0.5
      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) dragMoved = true
      const next = clampRect(
        {
          x: drag.startRect.x + dx,
          y: drag.startRect.y + dy,
          w: drag.startRect.w,
          h: drag.startRect.h,
        },
        template.width,
        template.height,
      )
      onChangeRect(drag.slotId, next)
      return
    }

    if (drag.kind === 'resize') {
      dragMoved = true
      const next = clampRect(
        resizeRect(drag.startRect, drag.handle, point),
        template.width,
        template.height,
      )
      onChangeRect(drag.slotId, next)
      return
    }

    if (drag.kind === 'quad-move') {
      dragMoved = true
      const dx = point.x - drag.startPointer.x
      const dy = point.y - drag.startPointer.y
      const next = drag.startPoints.map((p) =>
        clampPoint({ x: p.x + dx, y: p.y + dy }, template.width, template.height),
      )
      onChangeQuad(drag.slotId, next)
      return
    }

    dragMoved = true
    const next = drag.points.map((p) => ({ ...p }))
    next[drag.index] = clampPoint(point, template.width, template.height)
    drag.points = next
    onChangeQuad(drag.slotId, next)
  }

  function handlePointerUp(event: PointerEvent): void {
    const canvas = canvasElement
    const finished = drag
    if (!finished) return
    drag = null
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        /* pointer capture may already be released */
      }
    }
    onEditEnd()
    if ((finished.kind === 'move' || finished.kind === 'quad-move') && !dragMoved) {
      const slot = template.slots.find((candidate) => candidate.id === finished.slotId)
      if (slot && !slot.imageFile) {
        onAttachRequest(slot.id)
      }
    }
  }

  function handleDoubleClick(event: MouseEvent): void {
    if (mode !== 'select') return
    const hit = slotUnder(toImage(event))
    if (hit) {
      onSelect(hit.id)
      onAttachRequest(hit.id)
    }
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault()
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onLog('warn', `Dropped file is not an image: ${file.name || 'unknown'}`)
      return
    }
    const hit = slotUnder(toImage(event))
    onDropImage(hit?.id ?? selectedSlotId ?? null, file)
  }
</script>

<div class="stage-wrap">
  <canvas
    bind:this={canvasElement}
    class:creating={mode === 'create'}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    ondblclick={handleDoubleClick}
    ondragover={handleDragOver}
    ondrop={handleDrop}
    title={mode === 'create' ? 'Click 4 points to create a slot' : 'Click a slot to select; drag to move; drag handles to resize; double-click to attach an image'}
  ></canvas>
</div>

<style>
  .stage-wrap {
    position: relative;
    min-height: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 18px;
    background:
      radial-gradient(circle at 50% 25%, rgba(76, 194, 255, 0.08), transparent 55%),
      #0b0d11;
  }

  canvas {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    cursor: default;
    touch-action: none;
    border-radius: 4px;
    box-shadow:
      0 18px 48px rgba(0, 0, 0, 0.55),
      0 0 0 1px rgba(255, 255, 255, 0.08);
    background: #000;
  }

  canvas.creating {
    cursor: crosshair;
  }
</style>
