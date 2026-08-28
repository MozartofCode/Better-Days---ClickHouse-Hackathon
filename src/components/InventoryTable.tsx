export default function InventoryTable({ headers, rows }: { headers: string[]; rows: Record<string, string>[] }) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface)">
      <table className="w-full table-fixed text-left text-sm">
        <thead>
          <tr className="border-b border-(--color-border) text-xs uppercase text-(--color-text-muted)">
            {headers.map((h) => (
              <th key={h} className="break-words px-4 py-3 align-top font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-(--color-border) last:border-0">
              {headers.map((h) => (
                <td key={h} className="break-words px-4 py-3 align-top text-(--color-text)">
                  {row[h]?.trim() ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
