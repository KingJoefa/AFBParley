'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { parseCommand, getHelpText, validateMatchup, getTeamTheme, applyTheme, DEFAULT_THEME } from '@/lib/terminal/ui'
import type { ParsedCommand, TeamTheme } from '@/lib/terminal/ui'

interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error' | 'system' | 'agent'
  content: string
  timestamp: number
}

interface TerminalProps {
  onMatchup?: (away: string, home: string) => Promise<void>
  onBuild?: (args: string[], flags: Record<string, string | boolean>) => Promise<void>
  onBet?: (args: string[], flags: Record<string, string | boolean>) => Promise<void>
}

export function Terminal({ onMatchup, onBuild, onBet }: TerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [theme, setTheme] = useState<TeamTheme>(DEFAULT_THEME)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastCommand, setLastCommand] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Apply theme
  useEffect(() => {
    if (typeof window !== 'undefined') {
      applyTheme(theme)
    }
  }, [theme])

  // Initialize terminal
  useEffect(() => {
    addLine('system', '~/swantail terminal                                    Opus 4.5')
    addLine('system', '─────────────────────────────────────────────────────────────────')
    addLine('system', 'initializing agents...')
    addLine('agent', '├─ weather    ready')
    addLine('agent', '├─ pressure   ready')
    addLine('agent', '├─ epa        ready')
    addLine('agent', '├─ qb         ready')
    addLine('agent', '├─ hb         ready')
    addLine('agent', '├─ wr         ready')
    addLine('agent', '└─ te         ready')
    addLine('system', '')
    addLine('system', 'Type a matchup (e.g., "SF @ SEA") or "help" for commands.')
  }, [])

  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    setLines(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      content,
      timestamp: Date.now(),
    }])
  }, [])

  const handleCommand = useCallback(async (cmd: ParsedCommand) => {
    setIsProcessing(true)

    try {
      switch (cmd.type) {
        case 'matchup': {
          const [away, home] = cmd.args
          const validation = validateMatchup(away, home)

          if (!validation.valid) {
            addLine('error', `Error: ${validation.error}`)
            break
          }

          // Apply team theme
          const homeTheme = getTeamTheme(home)
          setTheme(homeTheme)

          addLine('system', '')
          addLine('system', `∴ ${away} @ ${home}`)
          addLine('system', '')
          addLine('system', '🔍 Scanning agents...')

          if (onMatchup) {
            await onMatchup(away, home)
          } else {
            addLine('output', '(Demo mode - connect onMatchup handler for live scanning)')
          }
          break
        }

        case 'build': {
          addLine('system', '')
          addLine('system', '🔧 Building parlay scripts...')

          if (onBuild) {
            await onBuild(cmd.args, cmd.flags)
          } else {
            addLine('output', '(Demo mode - connect onBuild handler for parlay generation)')
          }
          break
        }

        case 'bet': {
          addLine('system', '')
          addLine('system', '📊 Organizing betting ladders...')

          if (onBet) {
            await onBet(cmd.args, cmd.flags)
          } else {
            addLine('output', '(Demo mode - connect onBet handler for ladder generation)')
          }
          break
        }

        case 'help': {
          addLine('output', getHelpText())
          break
        }

        case 'theme': {
          if (cmd.args.length === 0) {
            addLine('output', `Current theme: ${theme.name} (${theme.abbreviation})`)
            addLine('output', 'Usage: theme [team] - e.g., "theme SF" or "theme Seahawks"')
          } else {
            const newTheme = getTeamTheme(cmd.args[0])
            if (newTheme !== DEFAULT_THEME || cmd.args[0].toUpperCase() === 'SWT') {
              setTheme(newTheme)
              addLine('output', `Theme changed to ${newTheme.name}`)
            } else {
              addLine('error', `Unknown team: ${cmd.args[0]}`)
            }
          }
          break
        }

        case 'retry': {
          if (lastCommand) {
            addLine('system', `Retrying: ${lastCommand}`)
            const retryCmd = parseCommand(lastCommand)
            await handleCommand(retryCmd)
          } else {
            addLine('error', 'No previous command to retry')
          }
          break
        }

        case 'clear': {
          setLines([])
          break
        }

        case 'unknown': {
          addLine('error', `Unknown command: ${cmd.raw}`)
          addLine('output', 'Type "help" for available commands.')
          break
        }
      }
    } catch (error) {
      addLine('error', `Error: ${(error as Error).message}`)
    } finally {
      setIsProcessing(false)
    }
  }, [addLine, lastCommand, onMatchup, onBuild, onBet, theme])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isProcessing) return

    // Add input to history
    setHistory(prev => [...prev, input])
    setHistoryIndex(-1)

    // Display input
    addLine('input', `∴ ${input}`)

    // Parse and execute
    const cmd = parseCommand(input)

    // Save for retry (except retry itself)
    if (cmd.type !== 'retry') {
      setLastCommand(input)
    }

    handleCommand(cmd)

    // Clear input
    setInput('')
  }, [input, isProcessing, addLine, handleCommand])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const newIndex = historyIndex === -1
          ? history.length - 1
          : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setInput(history[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1
        if (newIndex >= history.length) {
          setHistoryIndex(-1)
          setInput('')
        } else {
          setHistoryIndex(newIndex)
          setInput(history[newIndex])
        }
      }
    }
  }, [history, historyIndex])

  const getLineClassName = (type: TerminalLine['type']): string => {
    const base = 'font-mono whitespace-pre-wrap'
    switch (type) {
      case 'input':
        return `${base} text-terminal-accent`
      case 'output':
        return `${base} text-terminal-text`
      case 'error':
        return `${base} text-terminal-error`
      case 'system':
        return `${base} text-terminal-muted`
      case 'agent':
        return `${base} text-terminal-success`
      default:
        return base
    }
  }

  return (
    <div
      className="flex flex-col h-full bg-terminal-bg text-terminal-text font-mono"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-4 space-y-1"
      >
        {lines.map(line => (
          <div key={line.id} className={getLineClassName(line.type)}>
            {line.content}
          </div>
        ))}

        {isProcessing && (
          <div className="text-terminal-warning animate-pulse">
            Processing...
          </div>
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t border-terminal-muted/20 p-4">
        <div className="flex items-center gap-2">
          <span className="text-terminal-accent">∴</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            className="flex-1 bg-transparent outline-none text-terminal-text placeholder-terminal-muted"
            placeholder={isProcessing ? 'Processing...' : 'Enter command...'}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </form>
    </div>
  )
}

export default Terminal
