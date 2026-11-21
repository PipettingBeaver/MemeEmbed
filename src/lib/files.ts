export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(blob)
  })
}

export function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file)
}

/**
 * Opens the browser file picker without rendering a permanent input. Resolves
 * to null when the user cancels.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.opacity = '0'

    let settled = false
    const finish = (file: File | null): void => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onWindowFocus)
      input.remove()
      resolve(file)
    }

    const onWindowFocus = (): void => {
      window.setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null)
      }, 300)
    }

    input.onchange = () => finish(input.files?.[0] ?? null)
    input.oncancel = () => finish(null)
    document.body.appendChild(input)
    window.addEventListener('focus', onWindowFocus)
    input.click()
  })
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(
  text: string,
  fileName: string,
  type = 'application/json',
): void {
  downloadBlob(new Blob([text], { type }), fileName)
}
