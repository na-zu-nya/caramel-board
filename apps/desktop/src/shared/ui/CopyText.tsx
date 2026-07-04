export type CopyBlock = string | readonly string[];

interface CopyTextProps {
  text: CopyBlock;
  className?: string;
}

export function CopyText({ text, className }: CopyTextProps) {
  if (!Array.isArray(text)) {
    return <p className={className}>{text as string}</p>;
  }
  const [lead, ...bullets] = text as readonly string[];
  return (
    <>
      <p className={className}>{lead}</p>
      {bullets.length > 0 ? (
        <ul className={className ? `copy-bullets ${className}` : 'copy-bullets'}>
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
