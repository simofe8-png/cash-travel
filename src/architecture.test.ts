// Architecture guards (CLAUDE.md "Financial authority"): only the Ledger Engine mutates financial state.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const rel = (p: string) => relative(SRC, p).split(sep).join('/');
const FINANCIAL_TABLES = ['transactions', 'ledger_entries', 'card_charges', 'transaction_history'];
const LEDGER_ENGINE = 'data/SqliteLedgerRepository.ts';
const EXEMPT = (f: string) => f.startsWith('testing/') || f.startsWith('data/db/migrations/');

describe('architecture guards', () => {
  it('only the Ledger Engine writes financial tables', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const f = rel(file);
      if (f === LEDGER_ENGINE || EXEMPT(f)) continue;
      const text = readFileSync(file, 'utf8');
      for (const t of FINANCIAL_TABLES) {
        const re = new RegExp(String.raw`(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+${t}\b`, 'i');
        if (re.test(text)) offenders.push(`${f} → ${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no source file stores a balance column or table', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => /CREATE TABLE[^;]*\bbalance\b/i.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('UI never performs financial calculations itself (no money arithmetic or ledger semantics)', () => {
    const FORBIDDEN = /^(add|subtract|sum|negate|convert|convertByRatio|convertWithQuote|cashEffects|summarizeSpending|totalOf|estimateCardCharge|divRoundHalfUp)$/;
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const f = rel(file);
      if (!f.startsWith('ui/') && !f.startsWith('app/')) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']*domain[^']*)'/g)) {
        const names = (m[1] ?? '').split(',').map((n) => n.replace(/^\s*type\s+/, '').trim().split(/\s+as\s+/)[0] ?? '');
        for (const n of names) if (FORBIDDEN.test(n)) offenders.push(`${f} → ${n}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('source files contain no control characters (shell-escaping accidents)', () => {
    const offenders = sourceFiles(SRC).filter((f) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });
});
