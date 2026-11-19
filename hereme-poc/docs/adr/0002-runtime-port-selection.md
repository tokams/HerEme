# ADR 0002: Bind an available port and publish live connection state

Status: accepted, 2026-11-18, following the user's request that the worktree's
ordinary `run.cmd` choose a separate available port.

`server/config.js` owns runtime configuration for every launcher. Detect a Git
worktree from its repository-root `.git` file. Worktrees default to `data/preview`
and initial port 3001; main checkouts default to `data` and 3000. Explicit
`HEREME_DATA_DIR` and `PORT` remain available. A missing default preview snapshot
fails visibly. `run-preview.cmd` only dispatches explicit preview mode to run.cmd.

`server/listen.js` attempts the actual bind, avoiding a port-check/bind race. An
EADDRINUSE result logs the occupied port and advances to the next, bounded by 20
attempts and port 65535. Unexpected bind failures propagate. Exhaustion prints an
actionable error and exits. Never stop another server to claim its port.

The bound socket is canonical live connection state. Terminal URLs, API metadata
and QR codes use the actual port rather than the requested starting port. Do not
persist an available-port milestone. Different ports are separate browser origins,
so a browser may ask for a demo profile again after the port changes.
