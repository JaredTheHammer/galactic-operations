# Security Audit Report

**Date:** 2026-03-07
**Scope:** Full codebase (`packages/engine`, `packages/client`, `packages/server`, `scripts/`, `data/`, CI/CD)
**Methodology:** Static analysis across input validation, auth boundaries, secrets handling, and injection vectors

---

## Executive Summary

The codebase has a **strong overall security posture** for a client-side game application. No critical vulnerabilities were found. The application runs entirely in-browser with no backend communication, which eliminates most server-side attack surface. The findings below are organized by severity.

---

## Findings

### MEDIUM-1: No Runtime Action Validation in Game Engine

**Severity:** Medium
**Location:** `packages/engine/src/turn-machine-v2.ts:1402-1980`
**Category:** Input Validation

`executeActionV2()` accepts a `GameAction` discriminated union but performs no runtime validation of the payload shape before the switch statement. TypeScript types are erased at runtime, meaning:

- `action.figureId` is checked for existence (line 1407-1408, returns early if not found), but action payloads (`path`, `targetIds`, `weaponId`) are used without verifying they reference valid game entities
- Move action `path` coordinates are not bounds-checked against map dimensions
- `targetIds` and `weaponId` are not verified to exist in `gameData` before use
- No validation that the acting figure has sufficient `actionsRemaining` or `maneuversRemaining` before consuming them

**Risk:** If the multiplayer server is implemented, a malicious client could send crafted actions with invalid IDs or out-of-bounds coordinates. Currently mitigated by the single-player/AI-only architecture.

**Remediation:**
```typescript
function validateGameAction(action: GameAction, state: GameState, data: GameData): boolean {
  // Verify figureId exists and belongs to active player
  // Verify targetIds reference existing figures
  // Verify weaponId exists in gameData
  // Verify move path coordinates are within map bounds
  // Verify figure has sufficient actions/maneuvers remaining
}
```

---

### MEDIUM-1a: Unchecked Array Access on Move Coordinates

**Severity:** Medium
**Location:** `packages/engine/src/movement.ts:297-310`
**Category:** Input Validation / DoS

The `moveFigure()` function accesses map tiles directly using path coordinates without bounds checking:

```typescript
// Line 297 -- no bounds check
const oldTile = updatedMap.tiles[figure.position.y][figure.position.x];
// Line 306 -- no bounds check
const newTile = updatedMap.tiles[newPosition.y][newPosition.x];
```

If coordinates are negative or exceed map dimensions, this produces `TypeError: Cannot read properties of undefined`. Notably, `hasLineOfSight()` in `los.ts:83` does perform bounds checking, but `moveFigure()` does not.

**Risk:** Crafted move actions with out-of-bounds coordinates crash the game engine. In a multiplayer context, a malicious client could use this for denial of service.

**Remediation:**
```typescript
if (newPosition.x < 0 || newPosition.x >= updatedMap.width ||
    newPosition.y < 0 || newPosition.y >= updatedMap.height) {
  return gameState; // reject invalid move
}
```

---

### MEDIUM-2: Campaign Deserialization Without Error Handling

**Severity:** Medium
**Location:** `packages/engine/src/campaign-v2.ts:1184-1187`
**Category:** Input Validation

```typescript
export function campaignFromJSON(json: string): CampaignState {
  const saveFile: CampaignSaveFile = JSON.parse(json);  // No try-catch
  return loadCampaign(saveFile);
}
```

`JSON.parse()` is called without try-catch on imported campaign data. The downstream `loadCampaign()` performs minimal structural validation but does not check numeric bounds (credits, wounds, strain) or validate string values against known enums.

**Risk:** A corrupted or maliciously crafted save file (imported via the client's campaign import feature) could crash the application or put the game into an inconsistent state.

**Remediation:**
- Wrap `JSON.parse()` in try-catch
- Add schema validation (e.g., zod) for deserialized campaign state
- Validate numeric fields are within expected bounds
- Validate enum fields against known values

---

### MEDIUM-3: Server Package -- Stub With No Security Implementation

**Severity:** Medium (future risk)
**Location:** `packages/server/package.json`
**Category:** Auth Boundaries

The server package declares dependencies on `express@5.2.1`, `socket.io@4.8.3`, and `cors@2.8.6` but contains zero implementation code. When multiplayer is implemented, the following must be addressed before deployment:

- **Authentication:** No auth mechanism exists. Socket.IO connections would be unauthenticated.
- **Authorization:** No checks that a player can only control their own figures.
- **Input validation:** All game actions received via Socket.IO must be validated server-side (see MEDIUM-1).
- **CORS:** The `cors` package with default config allows all origins.
- **Rate limiting:** No protection against action spam or DoS.
- **Game state authority:** The server must be authoritative over game state, not trust client-submitted state.

**Remediation:** Before implementing multiplayer:
1. Design auth strategy (JWT, session-based, or OAuth)
2. Implement server-side action validation using the engine's state machine
3. Configure CORS with explicit origin allowlist
4. Add rate limiting middleware (e.g., `express-rate-limit`)
5. Ensure game state is computed server-side, not forwarded from clients

---

### LOW-1: Source Maps Enabled in Production Build

**Severity:** Low
**Location:** `tsconfig.base.json:15` (`sourceMap: true`)
**Category:** Information Disclosure

Source maps are enabled globally and the Vite build config does not explicitly disable them for production. Source maps expose original TypeScript source to anyone who opens browser DevTools on the deployed GitHub Pages site.

**Risk:** Minimal for an open-source project. If the project ever contains proprietary logic, source maps would leak it.

**Remediation:** Add to `packages/client/vite.config.ts` build section:
```typescript
build: {
  sourcemap: false,
}
```

---

### LOW-2: No Content Security Policy

**Severity:** Low
**Location:** `packages/client/index.html`
**Category:** Defense in Depth

The deployed application does not set a Content Security Policy (CSP) header or meta tag. While no XSS vectors were found in the codebase, a CSP provides defense-in-depth against future regressions or supply chain attacks via compromised dependencies.

**Remediation:** Add to `index.html`:
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self';">
```

---

### LOW-3: No Schema Validation on File Imports

**Severity:** Low
**Location:** `packages/client/src/components/MapEditor/MapEditor.tsx:405-425`, `packages/client/src/services/campaign-export.ts:199-259`
**Category:** Input Validation

The MapEditor import and campaign import both parse JSON and perform basic structural checks, but neither validates against a formal schema. The MapEditor checks for a `tiles` array; the campaign importer checks portrait IDs.

**Risk:** Malformed import files could cause runtime errors or unexpected behavior.

**Remediation:** Add schema validation (zod or similar) for all import formats.

---

## Clean Areas (No Issues Found)

| Area | Assessment |
|------|-----------|
| **XSS vectors** | No `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `Function()` usage anywhere in codebase |
| **Hardcoded secrets** | No API keys, passwords, tokens, or credentials in any source file |
| **Environment variables** | Only `import.meta.env.DEV` used (development flag). No secrets in env vars |
| **.gitignore** | `.env` and `.env.local` are properly excluded |
| **CI/CD secrets** | GitHub Actions use OIDC tokens, official actions, and `--frozen-lockfile`. No hardcoded PATs |
| **Package scripts** | No suspicious `postinstall`/`preinstall` hooks |
| **Prototype pollution** | Spread syntax used throughout; no unsafe `Object.assign` with dynamic keys |
| **Path traversal** | `data-loader.ts` uses `path.join()` + `.endsWith('.json')` filter |
| **ReDoS** | No complex regexes applied to user input |
| **File uploads** | Portrait uploader validates MIME whitelist (`png/jpeg/webp`) and 10MB size limit |
| **Blob URL handling** | All `URL.createObjectURL()` calls use app-generated blobs, properly revoked after use |
| **IndexedDB** | Content-addressed storage via SHA-256 hashing. Standard API usage with proper transactions |
| **localStorage** | Stores only game saves and audio preferences. No sensitive data |
| **Filename sanitization** | Campaign export sanitizes filenames: `name.replace(/[^a-zA-Z0-9-_ ]/g, '')` |
| **Canvas rendering** | All `fillText()` calls use computed numeric values, never raw user input |
| **Scripts directory** | No `exec()`, `spawn()`, or shell injection vectors. Hardcoded, validated paths only |

---

## Risk Summary

| ID | Severity | Category | Status |
|----|----------|----------|--------|
| MEDIUM-1 | Medium | Input Validation | Open -- mitigated by single-player architecture |
| MEDIUM-1a | Medium | Input Validation / DoS | Open -- unchecked array access in moveFigure() |
| MEDIUM-2 | Medium | Input Validation | Open -- affects campaign import |
| MEDIUM-3 | Medium | Auth Boundaries | Open -- future risk when multiplayer is implemented |
| LOW-1 | Low | Info Disclosure | Open |
| LOW-2 | Low | Defense in Depth | Open |
| LOW-3 | Low | Input Validation | Open |

**Overall Assessment:** No critical or high-severity issues. The application's client-only architecture significantly limits the attack surface. The medium findings should be addressed before enabling multiplayer functionality.
