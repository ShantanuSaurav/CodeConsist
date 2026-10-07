import type { SqlResultSet } from '@/types';

export function SqlResults({ results }: { results: SqlResultSet[] }) {
  return <div className="p-4 min-w-0 overflow-auto" aria-live="polite">
    {results.map((result, resultIndex) => <section key={resultIndex} className="mb-5">
      <h3 className="text-sm font-medium mb-2">Result {resultIndex + 1} · {result.values.length} rows</h3>
      <div className="overflow-auto" tabIndex={0} role="region" aria-label={`SQL result ${resultIndex + 1}`}>
        <table className="w-full text-sm text-left border-collapse">
          <caption className="sr-only">SQL query result {resultIndex + 1}</caption>
          <thead><tr>{result.columns.map((column, index) => <th key={index} scope="col" className="px-3 py-2 border-b border-border bg-surface-2 font-medium whitespace-nowrap">{column}</th>)}</tr></thead>
          <tbody>{result.values.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={columnIndex} className="px-3 py-2 border-b border-border font-mono whitespace-pre-wrap">{value === null ? <span className="text-fg-muted italic">NULL</span> : String(value)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {!result.values.length && <p className="text-sm text-fg-muted mt-2">No matching rows.</p>}
    </section>)}
  </div>;
}
