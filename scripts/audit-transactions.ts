// Static guard: code inside a transaction must use the transaction handle.
//
// A transaction holds one pooled connection until it ends. If its callback
// also queries through the shared pool (the outer `sql`, a store built on it,
// or any helper that calls getSql()), it waits for a second connection while
// holding the first. Under load every connection ends up held by a transaction
// waiting for another, and the instance hangs (reproduced with postgres.js and
// a two-connection pool, see lib/db-watch.ts). tests/transaction-audit.test.ts
// fails on any finding.
//
// Inside every `x.begin(callback)` and `wallet.transact(account, callback)`:
//   1. a reference to a variable declared outside the callback whose type is
//      the pool (`Sql` / `ReservedSql`, not `TransactionSql`), and
//   2. a call to a project function that reaches getSql(), directly or through
//      other project functions, without being handed the transaction.
//
// Run directly: npx tsx scripts/audit-transactions.ts

import path from "node:path";
import ts from "typescript";

export interface AuditOptions {
  /** Repository root (holds tsconfig.json and lib/db.ts). */
  root: string;
  /** Files to audit; defaults to every non-test file under lib/ and app/. */
  files?: string[];
}

const TRANSACTION_METHODS = new Set(["begin", "transact"]);
const POOL_TYPES = new Set(["Sql", "ReservedSql"]);

type Fn = ts.FunctionLikeDeclaration;

export function auditTransactions({ root, files }: AuditOptions): string[] {
  const parsed = ts.getParsedCommandLineOfConfigFile(path.join(root, "tsconfig.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  });
  if (!parsed) throw new Error("cannot read tsconfig.json");
  const audited = new Set(
    files ?? parsed.fileNames.filter((f) => /\/(lib|app)\//.test(path.relative(root, f).replace(/^/, "/")) &&
      !f.includes("/node_modules/") && !/\.test\.tsx?$/.test(f)),
  );
  const dbFile = path.join(root, "lib/db.ts");
  const program = ts.createProgram([...audited, dbFile], parsed.options);
  const checker = program.getTypeChecker();
  const rel = (f: string) => path.relative(root, f);

  const resolve = (node: ts.Node): ts.Symbol | undefined => {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol;
  };
  const fnOf = (decl: ts.Declaration | undefined): Fn | undefined => {
    if (!decl) return undefined;
    if (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl) || ts.isArrowFunction(decl) || ts.isFunctionExpression(decl)) return decl;
    if ((ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl)) && decl.initializer &&
        (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) return decl.initializer;
    return undefined;
  };
  const calleeOf = (call: ts.CallExpression) =>
    fnOf(resolve(ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression)?.declarations?.[0]);

  // Which project functions reach getSql()?
  const dbSource = program.getSourceFile(dbFile);
  const getSql = dbSource?.statements.find(
    (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "getSql",
  );
  if (!getSql) throw new Error("lib/db.ts no longer exports function getSql; update the audit");
  const callees = new Map<Fn, Set<Fn>>();
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || source.fileName.includes("/node_modules/")) continue;
    const visit = (node: ts.Node, owner?: Fn) => {
      if (ts.isFunctionLike(node) && (node as Fn).body) {
        owner = node as Fn;
        callees.set(owner, new Set());
      }
      if (owner && ts.isCallExpression(node)) {
        const callee = calleeOf(node);
        if (callee) callees.get(owner)!.add(callee);
      }
      ts.forEachChild(node, (child) => visit(child, owner));
    };
    visit(source);
  }
  const reachesPool = new Set<Fn>([getSql]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [fn, calls] of callees) {
      if (!reachesPool.has(fn) && [...calls].some((c) => reachesPool.has(c))) {
        reachesPool.add(fn);
        changed = true;
      }
    }
  }

  const isPoolType = (type: ts.Type): boolean =>
    (type.isUnion() ? type.types : [type]).some((t) =>
      // A local alias (`type Pool = postgres.Sql`) names the alias; the
      // underlying interface still carries the postgres name.
      [t.aliasSymbol, t.getSymbol()].some((s) => s !== undefined && POOL_TYPES.has(s.getName())));
  const fnName = (fn: Fn) =>
    (fn as ts.FunctionDeclaration).name?.getText() ??
    ((ts.isVariableDeclaration(fn.parent) || ts.isPropertyAssignment(fn.parent)) ? fn.parent.name.getText() : "<anonymous>");

  const findings: string[] = [];
  for (const source of program.getSourceFiles()) {
    if (!audited.has(source.fileName)) continue;
    const at = (node: ts.Node) => `${rel(source.fileName)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          TRANSACTION_METHODS.has(node.expression.name.text)) {
        const callback = node.arguments.find((a): a is ts.ArrowFunction | ts.FunctionExpression =>
          ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        if (callback) {
          const start = callback.getStart(source), end = callback.getEnd();
          const inside = (decl: ts.Node) => decl.getSourceFile() === source && decl.getStart() >= start && decl.getEnd() <= end;
          const txNames = new Set<string>();
          for (const p of callback.parameters) {
            if (ts.isIdentifier(p.name)) txNames.add(p.name.text);
          }
          const check = (inner: ts.Node): void => {
            if (ts.isIdentifier(inner) && !(ts.isPropertyAccessExpression(inner.parent) && inner.parent.name === inner)) {
              const symbol = resolve(inner);
              const decl = symbol?.valueDeclaration;
              if (symbol && decl && !inside(decl) && (ts.isVariableDeclaration(decl) || ts.isParameter(decl)) &&
                  isPoolType(checker.getTypeOfSymbolAtLocation(symbol, inner))) {
                findings.push(`${at(inner)}: pool handle \`${inner.text}\` used inside the transaction at ${at(node)}`);
              }
            }
            if (ts.isCallExpression(inner)) {
              const callee = calleeOf(inner);
              const handedTx = inner.arguments.some((a) => ts.isIdentifier(a) && txNames.has(a.text));
              if (callee && reachesPool.has(callee) && !handedTx) {
                findings.push(`${at(inner)}: ${fnName(callee)}() reaches getSql() inside the transaction at ${at(node)}`);
              }
            }
            ts.forEachChild(inner, check);
          };
          ts.forEachChild(callback.body, check);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...new Set(findings)].sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const findings = auditTransactions({ root: process.cwd() });
  for (const f of findings) console.log(f);
  console.log(`${findings.length} finding(s)`);
  process.exit(findings.length ? 1 : 0);
}
