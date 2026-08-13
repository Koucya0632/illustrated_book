function flushList(
  nodes: React.ReactNode[],
  listItems: string[],
  keyRef: { current: number },
) {
  if (listItems.length === 0) return;
  const key = keyRef.current++;
  nodes.push(
    <ul key={key} className="my-4 list-disc space-y-2 pl-6 text-tuji-ink2">
      {listItems.map((item, index) => (
        <li key={`${key}-${index}`} className="leading-7">
          {item}
        </li>
      ))}
    </ul>,
  );
  listItems.length = 0;
}

export default function MarkdownDocument({ source }: { source: string }) {
  const nodes: React.ReactNode[] = [];
  const listItems: string[] = [];
  const keyRef = { current: 0 };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushList(nodes, listItems, keyRef);
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      continue;
    }

    flushList(nodes, listItems, keyRef);
    const key = keyRef.current++;

    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={key} className="font-display text-4xl font-extrabold tracking-tight text-tuji-ink sm:text-5xl">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={key} className="mt-10 border-t border-tuji-rule pt-8 text-2xl font-bold tracking-tight text-tuji-ink">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={key} className="mt-7 text-lg font-bold tracking-tight text-tuji-ink">
          {line.slice(4)}
        </h3>,
      );
    } else {
      nodes.push(
        <p key={key} className="my-4 leading-7 text-tuji-ink2">
          {line}
        </p>,
      );
    }
  }

  flushList(nodes, listItems, keyRef);

  // Page margin is s4 (24) everywhere — the system has one horizontal boundary.
  return <article className="mx-auto max-w-3xl px-6 py-12">{nodes}</article>;
}
