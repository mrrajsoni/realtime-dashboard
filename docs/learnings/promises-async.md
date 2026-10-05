# Promises + Async — Reading Model (saved 2026-10-05)

Goal: read async code cold and predict what returns/throws, without running it.

## The one model

- `async function` always returns a Promise. `return X` = promise fulfills with X. `throw E` = promise rejects with E. No return = fulfills with `undefined`.
- `await P` pauses THIS function until P settles, then either gives the value or throws the rejection. Only the awaited value matters if you `return` it.
- `.then(cb)` runs cb later. `return` inside cb returns from cb, not the outer function. Outer must `return` the chain to forward it.
- `finally` always runs. It cannot change the return value unless it throws. It is for cleanup only.

## The 3 reading questions (ask in order)

1. Who returns to whom? Inner `return` (inside `.then`/nested fn) vs outer `return` (the `async function` itself). Only outer counts for the caller.
2. Where does the error go? `await` rethrows at that line. Uncaught in `try` = jumps to `catch`. `catch` that doesn't `return/throw` = resolves `undefined`.
3. Who owns cleanup? If `catch` releases and `finally` releases → double-release. Null the handle or release in one place only.

## Traps you hit (refresh route)

- `await chain.then(() => { return 503 })` with no outer `return` → 503 built, dropped, outer returns `undefined` → Next 500.
- `catch((rollbackError) => { throw rollbackError })` → masks original error with cleanup error.
- `release(true)` always → destroys healthy connections on app bugs. Branch: connection codes → `release(err)`, else `release()`.

## Drill (10 min, no DB needed)

Predict before running in node:

```js
async function a() { try { throw new Error('oops'); } catch { Promise.resolve().then(() => 'apple'); } }
async function b() { try { throw new Error('oops'); } catch { return Promise.resolve().then(() => 'apple'); } }
async function c() { let x = 'held'; try { return 'lunch'; } finally { x = 'released'; } }
```

Answers: a → undefined, b → 'apple', c → 'lunch' with x released. If any surprises you, re-read the one model.

## Interview line

"An async function settles by its outer return/throw. Inner returns inside .then only settle the inner callback. Await without return drops the value, and a catch without return resolves undefined — that's how a 503 became a 500."
