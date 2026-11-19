/**
 * Enregistre le raccourci `@/` → `src/` pour exécuter les tests directement
 * sous Node.js (sans bundler ni dépendance de test).
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const srcRoot = path.resolve(import.meta.dirname, '../../src')

registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return {
        url: pathToFileURL(path.resolve(srcRoot, specifier.slice(2))).href,
        shortCircuit: true
      }
    }
    return nextResolve(specifier, context)
  }
})
