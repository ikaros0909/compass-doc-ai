// Cross-platform launcher for `next dev` / `next start`.
//
// npm runs scripts via cmd.exe on Windows and /bin/sh on Linux. Bash-style
// parameter expansion like `${PORT:-3300}` only works on the latter, so on
// Windows the literal string reaches `next -p` and is rejected. This wrapper
// resolves PORT/HOST (with defaults) in Node and works identically everywhere.

import { spawn } from 'node:child_process'

const mode = process.argv[2] // "dev" | "start"
if (mode !== 'dev' && mode !== 'start') {
  console.error(`[run-next] expected "dev" or "start", got "${mode ?? ''}"`)
  process.exit(1)
}

const port = process.env.PORT || '3300'
const host = process.env.HOST || '0.0.0.0'

const nextBin = process.platform === 'win32' ? 'next.cmd' : 'next'

const child = spawn(nextBin, [mode, '-p', port, '-H', host], {
  stdio: 'inherit',
  shell: process.platform === 'win32', // resolve next.cmd via PATHEXT on Windows
})

child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error(`[run-next] failed to start next: ${err.message}`)
  process.exit(1)
})
