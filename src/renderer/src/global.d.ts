export type CheckResult =
  | { ok: true; source: string; updateAvailable: boolean; version?: string }
  | { ok: false; error: string }

export type UpdateEvent = {
  type: string
  payload?: Record<string, unknown>
}

declare global {
  interface Window {
    api: {
      platform: string
      getAppVersion(): Promise<string>
      isPortable(): Promise<boolean>
      checkUpdate(source?: 'auto' | 'github' | 'gitee'): Promise<CheckResult>
      installUpdate(): Promise<void>
      openReleases(): Promise<void>
      onUpdaterEvent(callback: (event: UpdateEvent) => void): () => void
    }
  }
}

export {}
