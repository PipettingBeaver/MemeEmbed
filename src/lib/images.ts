const imageCache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(source: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(source)
  if (cached) return cached
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('could not decode image'))
    img.src = source
  })
  imageCache.set(source, promise)
  promise.catch(() => imageCache.delete(source))
  return promise
}

export function extensionFromDataUrl(dataUrl: string): string {
  const match = /^data:image\/([a-zA-Z0-9+.-]+);/i.exec(dataUrl)
  if (!match) return 'png'
  const sub = match[1].toLowerCase()
  if (sub === 'jpeg' || sub === 'jpg') return 'jpg'
  if (sub === 'svg+xml') return 'svg'
  return sub
}

export function extensionFromName(name: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

export function assetNameForSlot(slotId: string, dataUrl: string): string {
  const ext = extensionFromDataUrl(dataUrl)
  const safe = slotId.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `slot-${safe}.${ext}`
}

export function assetNameForBase(originalName: string, dataUrl: string): string {
  const fromName = extensionFromName(originalName)
  const ext = fromName || extensionFromDataUrl(dataUrl)
  return `base.${ext}`
}

export function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || 'meme'
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'meme'
  )
}
