import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listClassesQueryOptions } from '@/features/classes/queries'
import { ClassDetail } from './ClassDetail'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, ChevronLeft, ChevronRight, AlertCircle, Blocks } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClassBrowserProps {
  sessionId: string
}

const PAGE_SIZE = 100

export function ClassBrowser({ sessionId }: ClassBrowserProps) {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery(
    listClassesQueryOptions(sessionId, query, PAGE_SIZE, page * PAGE_SIZE)
  )

  const handleSearch = useCallback(() => {
    setQuery(searchInput.trim())
    setPage(0)
    setSelectedClass(null)
  }, [searchInput])

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col w-80 shrink-0 border-r border-border overflow-hidden">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search classes..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch()
                }}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSearch}>
              <Search className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-xs">{error.message}</span>
          </div>
        )}

        {data && !isLoading && (
          <>
            <div className="px-3 py-1.5 border-b border-border shrink-0">
              <span className="text-[10px] text-muted-foreground">
                {data.total.toLocaleString()} classes
                {query && (
                  <>
                    {' '}
                    matching <span className="text-foreground font-medium">"{query}"</span>
                  </>
                )}
              </span>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {data.classes.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <Blocks className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-xs">No classes found</p>
                </div>
              ) : (
                <div>
                  {data.classes.map((cls) => {
                    const parts = cls.split('.')
                    const name = parts.pop()!
                    const pkg = parts.join('.')
                    return (
                      <button
                        key={cls}
                        onClick={() => setSelectedClass(cls)}
                        className={cn(
                          'flex flex-col w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors',
                          selectedClass === cls && 'bg-muted'
                        )}
                      >
                        <span className="text-xs font-mono text-foreground truncate">{name}</span>
                        {pkg && (
                          <span className="text-[10px] font-mono text-muted-foreground truncate">
                            {pkg}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-1.5 border-t border-border shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedClass ? (
          <ClassDetail sessionId={sessionId} className={selectedClass} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Blocks className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Select a class to inspect</p>
            <p className="text-xs mt-1">Search for classes by package name or keyword</p>
          </div>
        )}
      </div>
    </div>
  )
}
