import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ChevronLeft, Eye, EyeOff, Check, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { fetchSettings, updateSettings } from '@/features/settings/api'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const PROVIDERS = [
  { key: 'api_key_openai', label: 'OpenAI', placeholder: 'sk-...' },
  { key: 'api_key_anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { key: 'api_key_google', label: 'Google', placeholder: 'AIza...' },
] as const

function SettingsPage() {
  const router = useRouter()
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [success, setSuccess] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchSettings()
      .then((data) => setSaved(data))
      .catch(() => {})
  }, [])

  function handleChange(key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }))
    setSuccess((prev) => ({ ...prev, [key]: false }))
  }

  async function handleSave(key: string) {
    const value = drafts[key]
    if (value === undefined) return

    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      const result = await updateSettings({ [key]: value })
      setSaved(result)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setSuccess((prev) => ({ ...prev, [key]: true }))
      setTimeout(() => setSuccess((prev) => ({ ...prev, [key]: false })), 2000)
    } catch {
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  async function handleRemove(key: string) {
    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      const result = await updateSettings({ [key]: '' })
      setSaved(result)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch {
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.history.back()}
              className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h1 className="text-lg font-bold tracking-tight">Settings</h1>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-lg space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">API Keys</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Configure provider API keys to enable the AI assistant. Keys are stored locally and
              never leave this device.
            </p>

            <div className="space-y-4">
              {PROVIDERS.map(({ key, label, placeholder }) => {
                const hasSaved = !!saved[key]
                const draft = drafts[key]
                const isDirty = draft !== undefined
                const displayValue = isDirty ? draft : hasSaved ? saved[key] : ''
                const isVisible = visible[key]

                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground">{label}</label>
                      {hasSaved && !isDirty && (
                        <span className="text-[10px] text-emerald-500 font-medium">Configured</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type={isVisible ? 'text' : 'password'}
                          value={displayValue}
                          onChange={(e) => handleChange(key, e.target.value)}
                          placeholder={placeholder}
                          className="pl-8 pr-8 h-9 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setVisible((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isVisible ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {isDirty ? (
                        <Button
                          size="sm"
                          className="h-9 px-3"
                          onClick={() => handleSave(key)}
                          disabled={saving[key] || !draft.trim()}
                        >
                          {success[key] ? <Check className="h-3.5 w-3.5" /> : 'Save'}
                        </Button>
                      ) : hasSaved ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 px-3 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(key)}
                          disabled={saving[key]}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold text-foreground mb-1">Appearance</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Toggle between light and dark mode.
            </p>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  )
}
