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
});
