export type FitMode = 'cover' | 'contain' | 'stretch'
export type TrimColorMode = 'auto' | 'white' | 'black'
export type ShapeType = 'rect' | 'quad'
export type BackfillMode = 'none' | 'color' | 'image'
export type ToolMode = 'select' | 'create'
export type MaskMode = 'rect' | 'rounded' | 'auto'
export type AutoMaskSource = 'auto' | 'surround' | 'center'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface BackfillSettings {
  mode: BackfillMode
  color: string
  imageFile: string | null
}

export interface MaskSettings {
  mode: MaskMode
  cornerRadius: number
  inset: number
  autoSource: AutoMaskSource
  tolerance: number
}

export interface BlendSettings {
  trimEdges: boolean
  trimThreshold: number
  trimColor: TrimColorMode
  feather: number
  tint: boolean
  tintStrength: number
  glowEnabled: boolean
  glowColor: string
  glowSize: number
  glowOpacity: number
  downscale: number
  blur: number
  brightness: number
  saturation: number
  opacity: number
}

export interface GuideSettings {
  outlines: boolean
  thirds: boolean
  center: boolean
  measurements: boolean
  handles: boolean
}

export interface ImageTransform {
  zoom: number
  offsetX: number
  offsetY: number
}

export interface Slot {
  id: string
  name: string
  shape: ShapeType
  rect: Rect
  points?: Point[]
  fit: FitMode
  imageFile: string | null
  transform?: ImageTransform
  mask: MaskSettings
  backfill: BackfillSettings
  blend: BlendSettings
}

export interface TextLayer {
  enabled: boolean
  text: string
  fontFamily: string
  fontSize: number
  color: string
  strokeColor: string
  strokeWidth: number
  uppercase: boolean
  lineSpacing: number
}

export interface MemeTemplate {
  schemaVersion: number
  id: string
  name: string
  description?: string
  sourceUrl?: string
  width: number
  height: number
  baseImageFile: string
  slots: Slot[]
  text: {
    top: TextLayer
    bottom: TextLayer
  }
  createdAt: string
  updatedAt: string
}

export interface TemplateSummary {
  id: string
  name: string
  width: number
  height: number
  slotCount: number
  updatedAt: string | null
  hasBaseImage: boolean
}

export interface LoadedTemplate {
  template: MemeTemplate
  assets: Record<string, string>
}

export interface SaveResult {
  id: string
  name: string
  template: MemeTemplate
}

export interface SelfTestItem {
  name: string
  ok: boolean
  detail: string
}

export interface SaveTemplateOptions {
  template: MemeTemplate
  assets: Record<string, string>
  asCopy: boolean
  copyName: string | null
}

export interface TemplateBundle {
  format: 'memeembed-template'
  version: number
  template: MemeTemplate
  assets: Record<string, string>
}
